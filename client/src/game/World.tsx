/**
 * The NeonVerse arena: instanced collider geometry, merged neon edge
 * wireframes, glowing grid floor, crystals, boost pads, sky and lighting.
 * Everything procedural — zero external assets. Quality tiers scale
 * shadows, star counts and post effects for weaker machines.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Grid, Sparkles, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BOOST_PADS,
  CRYSTALS,
  FLOAT_PLATFORMS,
  GLOW_STRIPS,
  PHYS,
  WORLD_COLLIDERS,
  type AABB,
  type ColliderStyle,
} from '@shared/world';
import { net } from '../multiplayer/netState';
import { useSettings } from '../store/settings';

const STYLE_COLOR: Record<ColliderStyle, string> = {
  ground: '#0a1130',
  dais: '#111c4a',
  platform: '#131f52',
  pillar: '#16224f',
  crate: '#1c1444',
  step: '#101a42',
  building: '#0e1638',
  wall: '#182356',
};

const STYLE_EMISSIVE: Partial<Record<ColliderStyle, string>> = {
  dais: '#1b3a8a',
  platform: '#1d4f9e',
  crate: '#4a1d7a',
  wall: '#20367e',
};

function composeMatrix(m: THREE.Matrix4, c: AABB): void {
  const cx = (c.min[0] + c.max[0]) / 2;
  const cy = (c.min[1] + c.max[1]) / 2;
  const cz = (c.min[2] + c.max[2]) / 2;
  const sx = c.max[0] - c.min[0];
  const sy = c.max[1] - c.min[1];
  const sz = c.max[2] - c.min[2];
  m.compose(
    _v.set(cx, cy, cz),
    _q.identity(),
    _s.set(sx, sy, sz),
  );
}

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** One instanced mesh per collider style + merged neon wireframe overlay. */
function Colliders({ shadows }: { shadows: boolean }) {
  const styleMeshes = useRef<Map<string, THREE.InstancedMesh>>(new Map());

  const grouped = useMemo(() => {
    const map = new Map<ColliderStyle, AABB[]>();
    for (const c of WORLD_COLLIDERS) {
      const arr = map.get(c.style) ?? [];
      arr.push(c);
      map.set(c.style, arr);
    }
    return map;
  }, []);

  const edgeGeom = useMemo(() => {
    const geos: THREE.BufferGeometry[] = [];
    for (const c of WORLD_COLLIDERS) {
      const sx = c.max[0] - c.min[0];
      const sy = c.max[1] - c.min[1];
      const sz = c.max[2] - c.min[2];
      const g = new THREE.BoxGeometry(sx + 0.02, sy + 0.02, sz + 0.02);
      g.translate((c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2);
      geos.push(new THREE.EdgesGeometry(g));
      g.dispose();
    }
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    return merged;
  }, []);

  useEffect(() => {
    const meshes = styleMeshes.current;
    return () => {
      meshes.forEach((mesh) => mesh.dispose());
      edgeGeom.dispose();
    };
  }, [edgeGeom]);

  return (
    <group>
      {[...grouped.entries()].map(([style, boxes]) => (
        <instancedMesh
          key={style}
          ref={(mesh) => {
            if (mesh) {
              styleMeshes.current.set(style, mesh);
              // Fill matrices immediately on mount.
              boxes.forEach((c, i) => {
                composeMatrix(_m, c);
                mesh.setMatrixAt(i, _m);
              });
              mesh.instanceMatrix.needsUpdate = true;
              mesh.computeBoundingSphere();
            }
          }}
          args={[undefined, undefined, boxes.length]}
          receiveShadow
          castShadow={shadows && (style === 'crate' || style === 'building' || style === 'pillar' || style === 'wall')}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={STYLE_COLOR[style]}
            emissive={STYLE_EMISSIVE[style] ?? '#000000'}
            emissiveIntensity={0.35}
            roughness={0.55}
            metalness={0.35}
          />
        </instancedMesh>
      ))}
      {/* Neon wireframe overlay — one draw call for the whole arena. */}
      <lineSegments geometry={edgeGeom} frustumCulled={false}>
        <lineBasicMaterial
          color="#2bd9f2"
          transparent
          opacity={0.38}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
    </group>
  );
}

/** Decorative ground glow strips (additive, no collision). */
function GlowStrips() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const colors = useMemo(() => {
    const out: THREE.Color[] = [];
    for (const s of GLOW_STRIPS) {
      const c = new THREE.Color();
      c.setHSL(s.hue, 0.95, 0.6);
      out.push(c);
    }
    return out;
  }, []);

  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    GLOW_STRIPS.forEach((s, i) => {
      _q.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, s.rotY));
      _v.set(s.x, 0.03, s.z);
      _s.set(s.sx, s.sz, 1);
      _m.compose(_v, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [colors]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, GLOW_STRIPS.length]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

/** Boost pads: pulsing magenta rings that launch the player. */
function BoostPads() {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    group.current?.children.forEach((child, i) => {
      const ring = child as THREE.Mesh;
      const mat = ring.material as THREE.MeshBasicMaterial;
      const pulse = 0.55 + Math.abs(Math.sin(t * 2.4 + i)) * 0.45;
      mat.opacity = pulse * 0.85;
      ring.scale.setScalar(1 + (1 - pulse) * 0.22);
    });
  });
  return (
    <group ref={group}>
      {BOOST_PADS.map((pad) => (
        <mesh key={pad.id} position={[pad.x, pad.y + 0.02, pad.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.72, 1.05, 32]} />
          <meshBasicMaterial
            color="#e879f9"
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** The five interactive energy crystals. */
function Crystals() {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(
    () =>
      CRYSTALS.map(
        (c) =>
          new THREE.MeshStandardMaterial({
            color: new THREE.Color().setHSL(c.hue, 0.85, 0.6),
            emissive: new THREE.Color().setHSL(c.hue, 0.95, 0.55),
            emissiveIntensity: 0.4,
            roughness: 0.15,
            metalness: 0.4,
            transparent: true,
            opacity: 0.92,
          }),
      ),
    [],
  );
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    CRYSTALS.forEach((c, i) => {
      const mesh = refs.current[i];
      if (!mesh) return;
      const active = net.crystals.has(c.id);
      const mat = mats[i];
      mat.emissiveIntensity += ((active ? 2.6 : 0.4) - mat.emissiveIntensity) * 0.08;
      mesh.rotation.y = t * (0.4 + i * 0.1);
      const bob = Math.sin(t * 1.4 + i * 1.7) * 0.08;
      mesh.position.set(c.p[0], c.p[1] + bob + (c.id === 'core' ? Math.sin(t * 0.8) * 0.15 : 0), c.p[2]);
      mesh.scale.setScalar(active ? 1.18 + Math.sin(t * 6) * 0.05 : 1);
    });
  });

  return (
    <group>
      {CRYSTALS.map((c, i) => (
        <mesh
          key={c.id}
          ref={(r) => {
            refs.current[i] = r;
          }}
          position={c.p}
          material={mats[i]}
          castShadow
        >
          <octahedronGeometry args={[c.id === 'core' ? 1.05 : 0.62, 0]} />
        </mesh>
      ))}
    </group>
  );
}

/** Ambient floating crystals over the outer platforms (pure decoration). */
function DecorCrystals({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const seeds = useMemo(() => {
    const arr: { base: [number, number, number]; phase: number; hue: number; scale: number }[] = [];
    for (let i = 0; i < count; i++) {
      const plat = FLOAT_PLATFORMS[i % FLOAT_PLATFORMS.length];
      const a = (i / count) * Math.PI * 2;
      arr.push({
        base: [plat.x + Math.cos(a) * 2.4, plat.y + 1.6 + (i % 3) * 0.5, plat.z + Math.sin(a) * 2.4],
        phase: i * 0.9,
        hue: i % 2 === 0 ? 0.5 : 0.83,
        scale: 0.22 + (i % 4) * 0.08,
      });
    }
    return arr;
  }, [count]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = clock.elapsedTime;
    seeds.forEach((s, i) => {
      _v.set(s.base[0], s.base[1] + Math.sin(t * 0.9 + s.phase) * 0.35, s.base[2]);
      _q.setFromEuler(new THREE.Euler(0, t * 0.5 + s.phase, 0.4));
      _s.setScalar(s.scale);
      _m.compose(_v, _q, _s);
      mesh.setMatrixAt(i, _m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, seeds.length]} frustumCulled={false}>
      <octahedronGeometry args={[1, 0]} />
      <meshStandardMaterial
        color="#67e8f9"
        emissive="#22d3ee"
        emissiveIntensity={1.6}
        roughness={0.2}
        transparent
        opacity={0.85}
      />
    </instancedMesh>
  );
}

/** Invisible walls + visible neon barrier at the play-area boundary. */
function Barrier() {
  const B = PHYS.BOUND_XZ + 0.6;
  const H = 16;
  const walls: { pos: [number, number, number]; rot: number }[] = [
    { pos: [0, H / 2 - 3, -B], rot: 0 },
    { pos: [0, H / 2 - 3, B], rot: Math.PI },
    { pos: [-B, H / 2 - 3, 0], rot: Math.PI / 2 },
    { pos: [B, H / 2 - 3, 0], rot: -Math.PI / 2 },
  ];
  return (
    <group>
      {walls.map((w, i) => (
        <mesh key={i} position={w.pos} rotation={[0, w.rot, 0]}>
          <planeGeometry args={[B * 2, H]} />
          <meshBasicMaterial
            color="#0ea5d9"
            transparent
            opacity={0.05}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

export function World() {
  const quality = useSettings((s) => s.quality);
  const scene = useThree((s) => s.scene);
  const shadows = quality !== 'low';

  useEffect(() => {
    scene.fog = new THREE.Fog('#0a0f2e', quality === 'low' ? 26 : 34, 170);
    scene.background = new THREE.Color('#050510');
    return () => {
      scene.fog = null;
    };
  }, [scene, quality]);

  return (
    <group>
      <Colliders shadows={shadows} />
      <GlowStrips />
      <BoostPads />
      <Crystals />
      <DecorCrystals count={quality === 'low' ? 8 : 16} />
      <Barrier />

      {/* Holo grid over the arena floor. */}
      <Grid
        position={[0, 0.012, 0]}
        args={[72, 72]}
        cellSize={2}
        cellThickness={0.6}
        cellColor="#123a5c"
        sectionSize={12}
        sectionThickness={1.1}
        sectionColor="#1e6a8f"
        fadeDistance={quality === 'low' ? 60 : 120}
        fadeStrength={1.5}
        followCamera={false}
        infiniteGrid={false}
      />

      <ambientLight intensity={0.32} color="#7d93d6" />
      <hemisphereLight args={['#3a56a8', '#160d2e', 0.5]} />
      <directionalLight
        position={[24, 42, 14]}
        intensity={1.15}
        color="#bcd6ff"
        castShadow={shadows}
        shadow-mapSize={quality === 'high' ? 2048 : 1024}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={46}
        shadow-camera-bottom={-46}
        shadow-camera-near={5}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
      />
      <pointLight position={[0, 6, 0]} intensity={22} color="#38bdf8" distance={26} decay={2} />
      <pointLight position={[0, 3, 0]} intensity={10} color="#e879f9" distance={14} decay={2} />

      <Stars
        radius={140}
        depth={60}
        count={quality === 'low' ? 900 : quality === 'medium' ? 2200 : 4000}
        factor={4.5}
        saturation={0.4}
        fade
        speed={0.6}
      />
      {quality !== 'low' && (
        <Sparkles
          count={quality === 'high' ? 90 : 45}
          scale={[70, 14, 70]}
          position={[0, 7, 0]}
          size={2.6}
          speed={0.35}
          opacity={0.5}
          color="#7dd3fc"
        />
      )}
    </group>
  );
}
