/**
 * Character customization: name, body preset, color & accent palettes with
 * a live rotating 3D preview.
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerProfile } from '@shared/protocol';
import { Character } from '../game/Character';
import { cn } from '../lib/cn';
import { Input, Label } from './primitives';
import { MAX_NAME_LENGTH } from '@shared/protocol';

export const BODY_COLORS = [
  '#22d3ee', '#e879f9', '#a78bfa', '#34d399', '#fbbf24', '#fb7185',
  '#60a5fa', '#f472b6', '#4ade80', '#f97316', '#e2e8f0', '#475569',
];

export const ACCENT_COLORS = [
  '#f0f9ff', '#fbbf24', '#e879f9', '#22d3ee', '#84cc16', '#fb7185',
];

const BODIES = [
  { id: 0, label: 'Runner' },
  { id: 1, label: 'Brawler' },
  { id: 2, label: 'Phantom' },
];

function PreviewAvatar({ profile }: { profile: PlayerProfile }) {
  const group = useRef<THREE.Group>(null);
  const anim = useMemo(() => ({ speed: 1.6, grounded: true, vy: 0, emote: null }), []);
  useFrame(({ clock }) => {
    if (group.current) group.current.rotation.y = clock.elapsedTime * 0.7;
  });
  return (
    <group ref={group} position={[0, -1.05, 0]} scale={1.35}>
      <Character profile={profile} getAnim={() => anim} showTag={false} />
    </group>
  );
}

interface Props {
  profile: PlayerProfile;
  onChange: (p: PlayerProfile) => void;
  nameError?: string | null;
}

export function CustomizePanel({ profile, onChange, nameError }: Props) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-4">
      {/* Live preview */}
      <div className="glass-subtle relative h-64 overflow-hidden rounded-2xl">
        <Canvas camera={{ fov: 38, position: [0, 0.6, 3.4] }} dpr={[1, 1.5]} gl={{ alpha: true }}>
          <ambientLight intensity={0.7} color="#9db8ff" />
          <directionalLight position={[2, 4, 3]} intensity={1.6} color="#dceaff" />
          <pointLight position={[-2, 1, -1]} intensity={8} color="#e879f9" distance={7} decay={2} />
          <PreviewAvatar profile={profile} />
        </Canvas>
        <div className="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] uppercase tracking-widest text-cyan-200/60">
          preview
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="pname">Pilot name</Label>
          <Input
            id="pname"
            value={profile.name}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Guest123"
            className="mt-1"
            onChange={(e) => onChange({ ...profile, name: e.target.value })}
          />
          {nameError && <p className="mt-1 text-xs text-rose-300">{nameError}</p>}
        </div>

        <div>
          <Label>Chassis</Label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {BODIES.map((b) => (
              <button
                key={b.id}
                onClick={() => onChange({ ...profile, body: b.id })}
                className={cn(
                  'rounded-xl border px-2 py-1.5 text-xs font-semibold tracking-wide transition-colors cursor-pointer',
                  profile.body === b.id
                    ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.3)]'
                    : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]',
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Body glow</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {BODY_COLORS.map((c) => (
              <Swatch key={c} color={c} active={profile.color === c} onClick={() => onChange({ ...profile, color: c })} />
            ))}
          </div>
        </div>

        <div>
          <Label>Trim / visor</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ACCENT_COLORS.map((c) => (
              <Swatch key={c} color={c} active={profile.accent === c} onClick={() => onChange({ ...profile, accent: c })} small />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Swatch({ color, active, onClick, small }: { color: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      aria-label={`color ${color}`}
      onClick={onClick}
      className={cn(
        'rounded-full transition-transform cursor-pointer',
        small ? 'h-6 w-6' : 'h-7 w-7',
        active ? 'ring-2 ring-white/90 scale-110' : 'hover:scale-105 ring-1 ring-white/15',
      )}
      style={{ background: color, boxShadow: active ? `0 0 12px ${color}` : undefined }}
    />
  );
}
