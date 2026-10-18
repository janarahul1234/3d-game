/**
 * Animated 3D backdrop for the main menu and lobby — a slowly drifting
 * crystal cluster over the neon grid. Lightweight (no shadows).
 */

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';

function DriftingCrystals() {
  const group = useRef<THREE.Group>(null);
  const items = useMemo(() => {
    const arr: { pos: [number, number, number]; scale: number; hue: number; speed: number; phase: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 2.6 + (i % 3) * 1.1;
      arr.push({
        pos: [Math.cos(a) * r, Math.sin(i * 1.7) * 1.2, Math.sin(a) * r - 1],
        scale: 0.3 + (i % 4) * 0.22,
        hue: i % 3 === 0 ? 0.85 : 0.5,
        speed: 0.3 + (i % 5) * 0.13,
        phase: i * 0.8,
      });
    }
    return arr;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = group.current;
    if (!g) return;
    g.rotation.y = t * 0.08;
    g.children.forEach((c, i) => {
      const it = items[i];
      if (!it) return; // ring mesh has no item entry
      c.position.y = it.pos[1] + Math.sin(t * it.speed + it.phase) * 0.5;
      c.rotation.x = t * 0.3 + it.phase;
      c.rotation.z = t * 0.22 + it.phase;
    });
  });

  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} position={it.pos} scale={it.scale}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={new THREE.Color().setHSL(it.hue, 0.85, 0.62)}
            emissive={new THREE.Color().setHSL(it.hue, 0.95, 0.5)}
            emissiveIntensity={1.4}
            roughness={0.15}
            metalness={0.4}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.4, 0]}>
        <ringGeometry args={[1.4, 5.6, 48]} />
        <meshBasicMaterial color="#164e78" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function Background3D() {
  return (
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 50, position: [0, 1.2, 9] }}
        gl={{ antialias: true, powerPreference: 'low-power' }}
      >
        <color attach="background" args={['#050510']} />
        <fog attach="fog" args={['#0a0f2e', 12, 34]} />
        <ambientLight intensity={0.5} color="#7d93d6" />
        <pointLight position={[3, 3, 3]} intensity={30} color="#22d3ee" distance={14} decay={2} />
        <pointLight position={[-3, 1, -2]} intensity={22} color="#e879f9" distance={12} decay={2} />
        <DriftingCrystals />
        <Stars radius={80} depth={40} count={1400} factor={3} saturation={0.5} fade speed={0.4} />
        <Sparkles count={50} scale={[10, 5, 6]} size={2} speed={0.3} opacity={0.5} color="#7dd3fc" />
      </Canvas>
    </div>
  );
}
