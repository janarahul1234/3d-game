/**
 * Remote players: one avatar per real connected client, rendered from an
 * interpolation buffer (120 ms behind authoritative snapshots) so movement
 * looks smooth despite 15 Hz network updates.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerProfile } from '@shared/protocol';
import { Character, type AnimInput } from './Character';
import { net, sampleRemote } from '../multiplayer/netState';
import { useSession } from '../store/session';

function RemoteAvatar({ id, profile }: { id: string; profile: PlayerProfile }) {
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(0, -50, 0));
  const inited = useRef(false);
  const yaw = useRef(0);
  const prevSample = useRef<{ x: number; z: number; t: number } | null>(null);
  const anim = useMemo<AnimInput>(() => ({ speed: 0, grounded: true, vy: 0, emote: null }), []);
  const smoothSpeed = useRef(0);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const g = group.current;
    if (!g) return;
    const s = sampleRemote(id, performance.now());
    if (!s) return;
    const [x, y, z] = s.p;
    if (!inited.current) {
      pos.current.set(x, y, z);
      inited.current = true;
    } else {
      const dx = x - pos.current.x;
      const dz = z - pos.current.z;
      const dist = Math.hypot(dx, dz, y - pos.current.y);
      if (dist > 9) {
        pos.current.set(x, y, z); // teleport (respawn / late data) — snap
      } else {
        const k = Math.min(1, dt * 16);
        pos.current.x += dx * k;
        pos.current.y += (y - pos.current.y) * k;
        pos.current.z += dz * k;
      }
    }

    // Derive visual speed from actual rendered motion.
    const now = performance.now();
    const prev = prevSample.current;
    let instSpeed = 0;
    if (prev) {
      const ddt = (now - prev.t) / 1000;
      if (ddt > 0.001) {
        instSpeed = Math.hypot(pos.current.x - prev.x, pos.current.z - prev.z) / ddt;
      }
    }
    prevSample.current = { x: pos.current.x, z: pos.current.z, t: now };
    smoothSpeed.current += (Math.min(12, instSpeed) - smoothSpeed.current) * Math.min(1, dt * 10);

    // Yaw smoothing (shortest arc).
    let d = s.ry - yaw.current;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    yaw.current += d * Math.min(1, dt * 10);

    anim.speed = smoothSpeed.current;
    anim.grounded = s.mv !== 3;
    anim.vy = 0;
    const em = net.emotes.get(id);
    anim.emote = em && now - em.at < 2200 ? em : null;

    g.position.copy(pos.current);
    g.rotation.y = yaw.current;
  });

  return (
    <group ref={group} position={[0, -50, 0]}>
      <Character profile={profile} getAnim={() => anim} name={profile.name} />
    </group>
  );
}

export function RemotePlayers() {
  const room = useSession((s) => s.room);
  const selfId = useSession((s) => s.selfId);
  if (!room) return null;
  return (
    <>
      {room.players
        .filter((p) => p.id !== selfId && net.profiles.has(p.id))
        .map((p) => (
          <RemoteAvatar key={p.id} id={p.id} profile={p.profile} />
        ))}
    </>
  );
}
