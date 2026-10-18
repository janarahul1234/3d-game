/**
 * Stylized low-poly neon character rig — fully procedural, no assets.
 * Animation is computed per frame from a getter (speed, ground state,
 * vertical velocity, current emote), so it never triggers React renders.
 *
 * Used by: local Player, RemotePlayer avatars, and the customization preview.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { EmoteId, PlayerProfile } from '@shared/protocol';

export interface AnimInput {
  /** Horizontal speed m/s. */
  speed: number;
  grounded: boolean;
  vy: number;
  emote: { emote: EmoteId; at: number } | null;
}

interface CharacterProps {
  profile: PlayerProfile;
  getAnim: () => AnimInput;
  name?: string;
  showTag?: boolean;
}

const EMOTE_EMOJI: Record<EmoteId, string> = {
  wave: '👋',
  jump: '✨',
  spin: '🌀',
  heart: '💖',
};

/* ----------------------- canvas label sprites ----------------------- */

const texCache = new Map<string, THREE.CanvasTexture>();

function makeLabelTexture(text: string, color: string, big = false): THREE.CanvasTexture {
  const key = `${text}|${color}|${big}`;
  const cached = texCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.font = `${big ? 92 : 64}px "Segoe UI", system-ui, sans-serif`;
  const w = Math.min(500, ctx.measureText(text).width + 56);
  const x = (512 - w) / 2;
  ctx.fillStyle = 'rgba(5, 6, 18, 0.68)';
  ctx.beginPath();
  ctx.roundRect(x, 14, w, 100, 22);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#e8f6ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}

function NameSprite({ text, color }: { text: string; color: string }) {
  const tex = useMemo(() => makeLabelTexture(text, color), [text, color]);
  return (
    <sprite position={[0, 2.28, 0]} scale={[1.9, 0.475, 1]} renderOrder={20}>
      <spriteMaterial map={tex} transparent depthWrite={false} />
    </sprite>
  );
}

/** Per-avatar emoji bubble shown for ~2 s after an emote is triggered. */
function EmoteBubble({ accent, getAnim }: { accent: string; getAnim: () => AnimInput }) {
  const ref = useRef<THREE.Sprite>(null);
  const shown = useRef<string | null>(null);
  const mat = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthWrite: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    const sprite = ref.current;
    if (!sprite) return;
    const a = getAnim();
    const fresh = a.emote && performance.now() - a.emote.at < 2200;
    if (fresh && a.emote) {
      const key = a.emote.emote;
      if (shown.current !== key) {
        shown.current = key;
        mat.map = makeLabelTexture(EMOTE_EMOJI[key], accent, true);
        mat.needsUpdate = true;
      }
      sprite.visible = true;
      sprite.position.set(0, 2.62, 0);
      sprite.scale.set(0.95, 0.24, 1);
    } else {
      sprite.visible = false;
      shown.current = null;
    }
  });
  return <sprite ref={ref} visible={false} renderOrder={21} material={mat} />;
}

/* ------------------------------ rig -------------------------------- */

const _tmpQ = new THREE.Quaternion();
const _euler = new THREE.Euler();

export function Character({ profile, getAnim, name, showTag = true }: CharacterProps) {
  const root = useRef<THREE.Group>(null);
  const bodyRoot = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const walkPhase = useRef(0);
  const spinAcc = useRef(0);

  const { color, accent, body } = profile;
  const bodyPreset = body === 1 ? 'blocky' : body === 2 ? 'slim' : 'classic';
  const torsoW = bodyPreset === 'blocky' ? 0.62 : bodyPreset === 'slim' ? 0.36 : 0.46;
  const torsoH = bodyPreset === 'slim' ? 0.66 : 0.55;
  const headSize = bodyPreset === 'blocky' ? 0.26 : 0.24;

  const mats = useMemo(() => {
    const skin = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.25,
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.12,
    });
    const trim = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.3,
      metalness: 0.4,
      emissive: new THREE.Color(accent),
      emissiveIntensity: 0.65,
    });
    const visor = new THREE.MeshStandardMaterial({
      color: '#0a1024',
      roughness: 0.15,
      metalness: 0.7,
      emissive: new THREE.Color(accent),
      emissiveIntensity: 0.9,
    });
    return { skin, trim, visor };
  }, [color, accent]);

  useEffect(
    () => () => {
      mats.skin.dispose();
      mats.trim.dispose();
      mats.visor.dispose();
    },
    [mats],
  );

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const a = getAnim();
    const g = bodyRoot.current;
    if (!g) return;

    const moving = a.speed > 0.6;
    const freq = 2.2 + Math.min(9, a.speed) * 0.85;
    if (moving || !a.grounded) walkPhase.current += dt * freq;
    const amp = Math.min(1, a.speed / 4.5);
    const swing = Math.sin(walkPhase.current) * 0.7 * (moving ? amp : 0);

    // Legs
    if (legL.current && legR.current) {
      const airborne = !a.grounded;
      legL.current.rotation.x = airborne ? -0.5 * Math.sign(a.vy || 1) : swing;
      legR.current.rotation.x = airborne ? 0.35 * Math.sign(a.vy || 1) : -swing;
    }
    // Arms
    if (armL.current && armR.current) {
      const airborne = !a.grounded;
      armL.current.rotation.x = airborne ? -1.1 : -swing * 0.85;
      armR.current.rotation.x = airborne ? -1.1 : swing * 0.85;
      armL.current.rotation.z = 0.08;
      armR.current.rotation.z = -0.08;
    }

    // Emote overrides
    const emote = a.emote && performance.now() - a.emote.at < 2000 ? a.emote.emote : null;
    if (emote === 'wave' && armR.current) {
      const t = (performance.now() - (a.emote?.at ?? 0)) / 2000;
      armR.current.rotation.x = 0;
      armR.current.rotation.z = -2.3 + Math.sin(t * 18) * 0.5;
      if (head.current) head.current.rotation.z = Math.sin(t * 12) * 0.08;
    } else if (emote === 'spin' && root.current) {
      spinAcc.current += dt * 11;
      root.current.rotation.y = spinAcc.current;
    } else {
      spinAcc.current = 0;
      if (root.current) root.current.rotation.y = 0;
      if (head.current) head.current.rotation.z = 0;
      if (armR.current && emote !== 'wave') armR.current.rotation.z = -0.08;
    }
    if (emote === 'heart' && head.current) {
      head.current.rotation.x = Math.sin(performance.now() / 160) * 0.12 - 0.1;
    } else if (head.current) {
      head.current.rotation.x = 0;
    }

    // Torso bob & lean
    g.position.y = Math.abs(Math.sin(walkPhase.current)) * 0.035 * amp;
    g.rotation.x = Math.min(0.22, a.speed * 0.018);
    // Idle breathing
    if (!moving && a.grounded && !emote) {
      g.scale.y = 1 + Math.sin(performance.now() / 650) * 0.008;
    } else {
      g.scale.y = 1;
    }
  });

  const hipY = 0.78;
  const shoulderY = hipY + torsoH + 0.02;
  const headY = shoulderY + 0.24;

  return (
    <group ref={root}>
      {showTag && name && <NameSprite text={name} color={accent} />}
      <EmoteBubble accent={accent} getAnim={getAnim} />
      <group ref={bodyRoot}>
        {/* legs (pivot at hip) */}
        <group ref={legL} position={[-torsoW * 0.28, hipY, 0]}>
          <mesh position={[0, -hipY / 2 - 0.02, 0]} castShadow material={mats.skin}>
            <boxGeometry args={[torsoW * 0.34, hipY, torsoW * 0.4]} />
          </mesh>
          <mesh position={[0, -hipY + 0.02, 0.04]} castShadow material={mats.trim}>
            <boxGeometry args={[torsoW * 0.38, 0.12, torsoW * 0.52]} />
          </mesh>
        </group>
        <group ref={legR} position={[torsoW * 0.28, hipY, 0]}>
          <mesh position={[0, -hipY / 2 - 0.02, 0]} castShadow material={mats.skin}>
            <boxGeometry args={[torsoW * 0.34, hipY, torsoW * 0.4]} />
          </mesh>
          <mesh position={[0, -hipY + 0.02, 0.04]} castShadow material={mats.trim}>
            <boxGeometry args={[torsoW * 0.38, 0.12, torsoW * 0.52]} />
          </mesh>
        </group>

        {/* torso */}
        <mesh position={[0, hipY + torsoH / 2, 0]} castShadow material={mats.skin}>
          <boxGeometry args={[torsoW, torsoH, torsoW * 0.66]} />
        </mesh>
        {/* chest light strip */}
        <mesh position={[0, hipY + torsoH * 0.62, torsoW * 0.34]} castShadow material={mats.trim}>
          <boxGeometry args={[torsoW * 0.7, 0.06, 0.03]} />
        </mesh>
        {/* belt */}
        <mesh position={[0, hipY + 0.02, 0]} castShadow material={mats.trim}>
          <boxGeometry args={[torsoW * 1.04, 0.07, torsoW * 0.72]} />
        </mesh>

        {/* arms (pivot at shoulder) */}
        <group ref={armL} position={[-torsoW / 2 - 0.07, shoulderY, 0]}>
          <mesh position={[0, -(hipY - 0.06) * 0.62, 0]} castShadow material={mats.skin}>
            <boxGeometry args={[torsoW * 0.26, (hipY - 0.06) * 1.15, torsoW * 0.3]} />
          </mesh>
        </group>
        <group ref={armR} position={[torsoW / 2 + 0.07, shoulderY, 0]}>
          <mesh position={[0, -(hipY - 0.06) * 0.62, 0]} castShadow material={mats.skin}>
            <boxGeometry args={[torsoW * 0.26, (hipY - 0.06) * 1.15, torsoW * 0.3]} />
          </mesh>
        </group>

        {/* head */}
        <group ref={head} position={[0, headY, 0]}>
          {bodyPreset === 'blocky' ? (
            <mesh castShadow material={mats.skin}>
              <boxGeometry args={[headSize * 1.8, headSize * 1.7, headSize * 1.6]} />
            </mesh>
          ) : (
            <mesh castShadow material={mats.skin}>
              <sphereGeometry args={[headSize, 18, 16]} />
            </mesh>
          )}
          {/* visor / face */}
          <mesh position={[0, headSize * 0.12, headSize * (bodyPreset === 'blocky' ? 0.82 : 0.86)]} material={mats.visor}>
            <boxGeometry args={[headSize * 1.45, headSize * 0.5, 0.05]} />
          </mesh>
          {/* antenna for classic */}
          {bodyPreset === 'classic' && (
            <mesh position={[headSize * 0.5, headSize * 1.05, 0]} material={mats.trim}>
              <cylinderGeometry args={[0.012, 0.02, 0.22, 6]} />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

/** Helper for parent components that rotate an avatar group by yaw. */
export function applyYaw(quatTarget: THREE.Quaternion, ry: number): void {
  _euler.set(0, ry, 0);
  quatTarget.setFromEuler(_euler);
}
