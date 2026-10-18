/**
 * Local player controller: client-side prediction against the shared world
 * colliders, camera-relative acceleration, jump/boost/gravity, footsteps,
 * interaction + collection proximity checks, and 30 Hz server updates.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { MoveState, PlayerProfile } from '@shared/protocol';
import { CRYSTALS, PHYS, SPAWN_POINTS } from '@shared/world';
import { input } from './input';
import { onBoostPad, rayBlockedDistance, stepBody, type Vec3Mutable } from './physics';
import { Character, type AnimInput } from './Character';
import { audio } from './audio';
import { net } from '../multiplayer/netState';
import { apiCollect, apiInteract, apiSendUpdate, apiSoloTick } from '../multiplayer/api';
import { useHud } from '../store/hud';
import { useSettings } from '../store/settings';

const _move = { x: 0, y: 0 };

interface PlayerProps {
  profile: PlayerProfile;
}

export function Player({ profile }: PlayerProps) {
  const group = useRef<THREE.Group>(null);
  const pos = useRef<Vec3Mutable>({ x: net.local.p[0], y: net.local.p[1], z: net.local.p[2] });
  const vel = useRef<Vec3Mutable>({ x: 0, y: 0, z: 0 });
  const grounded = useRef(true);
  const lastGroundAt = useRef(0);
  const jumpBufferAt = useRef(-10);
  const sendAcc = useRef(0);
  const stepDist = useRef(0);
  const faceYaw = useRef(Math.PI);
  const prevEmoteAt = useRef(0);
  const prevE = useRef(false);
  const speedSmooth = useRef(0);
  const fpsAcc = useRef({ frames: 0, t: 0 });
  const anim = useMemo<AnimInput>(() => ({ speed: 0, grounded: true, vy: 0, emote: null }), []);

  useEffect(() => {
    // Re-sync if net.local was externally reset (respawn, match restart).
    grounded.current = true;
  }, []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const now = performance.now();
    const hud = useHud.getState();
    const settings = useSettings.getState();

    apiSoloTick(now);

    const uiBlocked = input.uiMode || hud.pauseOpen;

    // ---------------- movement ----------------
    const p = pos.current;
    const v = vel.current;

    if (!uiBlocked) {
      input.moveVector(_move);
      const yaw = input.yaw;
      // Camera-relative basis.
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = -fz; // cross(forward, up)
      const rz = fx;
      let wishX = fx * _move.y + rx * _move.x;
      let wishZ = fz * _move.y + rz * _move.x;
      const wishLen = Math.hypot(wishX, wishZ);
      if (wishLen > 1) {
        wishX /= wishLen;
        wishZ /= wishLen;
      }
      const sprint = input.sprintHeld;
      const targetSpeed = wishLen > 0.05 ? (sprint ? PHYS.SPRINT_SPEED : PHYS.WALK_SPEED) * Math.min(1, wishLen) : 0;
      const accel = grounded.current ? PHYS.ACCEL : PHYS.AIR_ACCEL;

      const curX = v.x;
      const curZ = v.z;
      const wishVX = wishX * targetSpeed;
      const wishVZ = wishZ * targetSpeed;
      if (grounded.current) {
        if (targetSpeed > 0.1) {
          v.x += (wishVX - curX) * Math.min(1, accel * dt * 0.28);
          v.z += (wishVZ - curZ) * Math.min(1, accel * dt * 0.28);
        } else {
          const k = Math.max(0, 1 - PHYS.FRICTION * dt);
          v.x *= k;
          v.z *= k;
        }
      } else {
        v.x += (wishVX - curX) * Math.min(1, accel * dt * 0.12);
        v.z += (wishVZ - curZ) * Math.min(1, accel * dt * 0.12);
      }

      // Jump with coyote time + input buffering.
      if (input.jumpQueued) {
        input.jumpQueued = false;
        jumpBufferAt.current = now;
      }
      const coyote = now - lastGroundAt.current < 120;
      if (now - jumpBufferAt.current < 130 && (grounded.current || coyote)) {
        v.y = PHYS.JUMP_SPEED;
        grounded.current = false;
        jumpBufferAt.current = -10;
        audio.jump();
      }

      // Gravity.
      v.y -= PHYS.GRAVITY * dt;
      if (v.y < -45) v.y = -45;
    } else {
      // While a menu/chat is open: decelerate in place, still simulate gravity.
      v.x *= Math.max(0, 1 - 10 * dt);
      v.z *= Math.max(0, 1 - 10 * dt);
      v.y -= PHYS.GRAVITY * dt;
    }

    // ---------------- collision step ----------------
    const res = stepBody(p, v, dt);
    if (res.grounded) {
      grounded.current = true;
      lastGroundAt.current = now;
      if (res.landed) {
        audio.land(0.6);
      }
      // Boost pads launch when you land/stand on them.
      if (onBoostPad(p)) {
        v.y = PHYS.BOOST_VY;
        grounded.current = false;
        net.fx.push({ type: 'boost', p: [p.x, p.y + 0.2, p.z], color: '#e879f9' });
        audio.boost();
      }
    } else {
      grounded.current = false;
    }

    // ---------------- fall out of world ----------------
    if (p.y < PHYS.DEATH_Y) {
      const s = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
      p.x = s[0];
      p.y = s[1];
      p.z = s[2];
      v.x = v.y = v.z = 0;
      net.fx.push({ type: 'respawn', p: [p.x, p.y + 1, p.z], color: '#22d3ee' });
      audio.respawn();
      hud.toast('You fell out of the NeonVerse — respawned', 'bad');
    }

    // ---------------- footsteps ----------------
    const hSpeed = Math.hypot(v.x, v.z);
    if (grounded.current && hSpeed > 1.2) {
      stepDist.current += hSpeed * dt;
      const stride = hSpeed > 6.5 ? 2.6 : 2.0;
      if (stepDist.current > stride) {
        stepDist.current = 0;
        audio.footstep();
      }
    }

    // ---------------- facing ----------------
    if (hSpeed > 0.6) {
      const target = Math.atan2(v.x, v.z);
      let d = target - faceYaw.current;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      faceYaw.current += d * Math.min(1, dt * 12);
    } else if (input.uiMode === false) {
      // Idle: face away from camera (natural third-person stance).
      const target = Math.atan2(-Math.sin(input.yaw), -Math.cos(input.yaw));
      let d = target - faceYaw.current;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      faceYaw.current += d * Math.min(1, dt * 6);
    }

    // ---------------- state publish (hot, no React) ----------------
    net.local.p = [p.x, p.y, p.z];
    net.local.ry = faceYaw.current;
    net.local.mv = (!grounded.current ? 3 : hSpeed > 6.4 ? 2 : hSpeed > 0.6 ? 1 : 0) as MoveState;
    net.local.grounded = grounded.current;

    speedSmooth.current += (hSpeed - speedSmooth.current) * Math.min(1, dt * 10);
    anim.speed = speedSmooth.current;
    anim.grounded = grounded.current;
    anim.vy = v.y;
    const myEmote = net.emotes.get(net.selfId);
    anim.emote = myEmote && now - myEmote.at < 2200 ? myEmote : null;

    // ---------------- network send at 30 Hz ----------------
    sendAcc.current += dt;
    if (sendAcc.current >= 1 / 30) {
      sendAcc.current = 0;
      apiSendUpdate(net.local.p, net.local.ry, net.local.mv);
    }

    // ---------------- proximity: items ----------------
    for (const it of net.items.values()) {
      if (!it.active) continue;
      const dx = p.x - it.p[0];
      const dy = p.y + PHYS.PLAYER_HEIGHT / 2 - it.p[1];
      const dz = p.z - it.p[2];
      if (dx * dx + dy * dy + dz * dz < PHYS.PICKUP_RADIUS * PHYS.PICKUP_RADIUS) {
        apiCollect(it.id); // server validates; dedupes per spawn
      }
    }

    // ---------------- proximity: crystals + interact prompt ----------------
    let nearest: { id: string; d: number } | null = null;
    for (const c of CRYSTALS) {
      const d = Math.hypot(p.x - c.p[0], p.y + 0.8 - c.p[1], p.z - c.p[2]);
      if (d < 3.2 && (!nearest || d < nearest.d)) nearest = { id: c.id, d };
    }
    const wantE = input.keys.has('KeyE');
    if (nearest) {
      const lit = net.crystals.has(nearest.id);
      hud.setPrompt(lit ? 'Hold to dim crystal — [E]' : 'Attune energy crystal — [E]');
      if (wantE && !prevE.current && now - prevEmoteAt.current > 250) {
        apiInteract(nearest.id);
        prevEmoteAt.current = now;
      }
    } else if (hud.prompt) {
      hud.setPrompt(null);
    }
    prevE.current = wantE;

    // ---------------- apply to mesh ----------------
    const g = group.current;
    if (g) {
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = faceYaw.current;
    }

    // ---------------- fps counter ----------------
    if (settings.showFps) {
      const f = fpsAcc.current;
      f.frames++;
      f.t += dt;
      if (f.t >= 0.5) {
        hud.setFps(Math.round(f.frames / f.t));
        f.frames = 0;
        f.t = 0;
      }
    }
  });

  return (
    <group ref={group} position={[net.local.p[0], net.local.p[1], net.local.p[2]]}>
      <Character profile={profile} getAnim={() => anim} name={profile.name} />
    </group>
  );
}

/** Camera occlusion helper re-exported for CameraController. */
export function cameraRayDistance(o: Vec3Mutable, d: Vec3Mutable, max: number): number {
  return rayBlockedDistance(o, d, max, 0.32);
}
