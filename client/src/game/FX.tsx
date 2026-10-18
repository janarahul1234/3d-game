/**
 * Lightweight pooled particle system for pickups, boosts, respawns and
 * resonance — a single THREE.Points buffer, zero allocations per burst.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { net } from '../multiplayer/netState';

const CAP = 420;

interface FxState {
  positions: Float32Array;
  colors: Float32Array;
  vel: Float32Array;
  life: Float32Array; // seconds remaining; 0 = dead slot
}

export function FX() {
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const state = useMemo<FxState>(
    () => ({
      positions: new Float32Array(CAP * 3).fill(-9999),
      colors: new Float32Array(CAP * 3),
      vel: new Float32Array(CAP * 3),
      life: new Float32Array(CAP),
    }),
    [],
  );
  const cursor = useRef(0);
  const baseColor = useMemo(() => new THREE.Color(), []);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);

    // Drain queued events into particle bursts.
    while (net.fx.length > 0) {
      const ev = net.fx.pop()!;
      const n = ev.type === 'resonance' ? 90 : ev.type === 'respawn' ? 42 : 26;
      baseColor.set(ev.color ?? '#fbbf24');
      for (let k = 0; k < n; k++) {
        const i = cursor.current;
        cursor.current = (cursor.current + 1) % CAP;
        const i3 = i * 3;
        state.positions[i3] = ev.p[0];
        state.positions[i3 + 1] = ev.p[1];
        state.positions[i3 + 2] = ev.p[2];
        const a = Math.random() * Math.PI * 2;
        const up = ev.type === 'boost' ? 4 + Math.random() * 4 : Math.random() * 4.5;
        const sp = ev.type === 'resonance' ? 5 + Math.random() * 5 : 1.6 + Math.random() * 3.4;
        state.vel[i3] = Math.cos(a) * sp;
        state.vel[i3 + 1] = up;
        state.vel[i3 + 2] = Math.sin(a) * sp;
        state.life[i] = 0.55 + Math.random() * 0.75;
        // Cyan-shifted variance around the base hue.
        const c = baseColor.clone().offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.4) * 0.15);
        state.colors[i3] = c.r;
        state.colors[i3 + 1] = c.g;
        state.colors[i3 + 2] = c.b;
      }
    }

    // Integrate.
    let alive = false;
    for (let i = 0; i < CAP; i++) {
      if (state.life[i] <= 0) continue;
      alive = true;
      state.life[i] -= dt;
      const i3 = i * 3;
      state.vel[i3 + 1] -= 9 * dt;
      state.positions[i3] += state.vel[i3] * dt;
      state.positions[i3 + 1] += state.vel[i3 + 1] * dt;
      state.positions[i3 + 2] += state.vel[i3 + 2] * dt;
      if (state.life[i] <= 0) {
        state.positions[i3] = -9999;
        state.positions[i3 + 1] = -9999;
        state.positions[i3 + 2] = -9999;
      } else {
        const fade = Math.min(1, state.life[i] * 1.6);
        state.colors[i3] *= 0.995 + fade * 0.004;
      }
    }

    const geom = geomRef.current;
    if (geom && alive) {
      (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geom.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  });

  return (
    <points frustumCulled={false} renderOrder={15}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[state.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[state.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.14}
        vertexColors
        transparent
        opacity={0.95}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}
