/**
 * Collectible energy orbs: rendered from server-authoritative item state
 * via one instanced mesh + billboarded halo sprites. Bob/spin animation is
 * per-frame matrix composition (no React state churn).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { net } from '../multiplayer/netState';

const MAX_ITEMS = 32;
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _camQ = new THREE.Quaternion();

function makeHaloTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(255, 226, 130, 0.95)');
  g.addColorStop(0.35, 'rgba(251, 191, 36, 0.42)');
  g.addColorStop(1, 'rgba(251, 191, 36, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function Collectibles() {
  const orbRef = useRef<THREE.InstancedMesh>(null);
  const haloRef = useRef<THREE.InstancedMesh>(null);
  const haloTex = useMemo(makeHaloTexture, []);
  useEffect(() => () => haloTex.dispose(), [haloTex]);

  useFrame(({ camera, clock }) => {
    const orbs = orbRef.current;
    const halos = haloRef.current;
    if (!orbs || !halos) return;
    camera.getWorldQuaternion(_camQ);

    const t = clock.elapsedTime;
    let i = 0;
    for (const item of net.items.values()) {
      if (!item.active || i >= MAX_ITEMS) continue;
      const bob = Math.sin(t * 2 + item.id * 1.3) * 0.16;
      _v.set(item.p[0], item.p[1] + bob, item.p[2]);
      _q.setFromEuler(new THREE.Euler(0, t * 1.6 + item.id, Math.PI / 7));
      const pulse = 1 + Math.sin(t * 3.4 + item.id * 2.1) * 0.09;
      _s.setScalar(0.34 * pulse);
      _m.compose(_v, _q, _s);
      orbs.setMatrixAt(i, _m);

      _q.copy(_camQ);
      _s.setScalar(1.35 * pulse);
      _m.compose(_v, _q, _s);
      halos.setMatrixAt(i, _m);
      i++;
    }
    // Park unused instances far away.
    _v.set(0, -100, 0);
    _s.setScalar(0.001);
    _m.compose(_v, _q, _s);
    for (; i < MAX_ITEMS; i++) {
      orbs.setMatrixAt(i, _m);
      halos.setMatrixAt(i, _m);
    }
    orbs.instanceMatrix.needsUpdate = true;
    halos.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={orbRef} args={[undefined, undefined, MAX_ITEMS]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial
          color="#fde68a"
          emissive="#fbbf24"
          emissiveIntensity={2.2}
          roughness={0.2}
          metalness={0.5}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={haloRef} args={[undefined, undefined, MAX_ITEMS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={haloTex}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}
