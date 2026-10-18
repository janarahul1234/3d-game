/**
 * Smooth third-person camera with pointer orientation from the input
 * singleton and occlusion handling against the world colliders.
 */

import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRef } from 'react';
import { rayBlockedDistance, type Vec3Mutable } from './physics';
import { input } from './input';
import { net } from '../multiplayer/netState';

const _target = new THREE.Vector3();
const _desired = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _o: Vec3Mutable = { x: 0, y: 0, z: 0 };
const _d: Vec3Mutable = { x: 0, y: 0, z: 0 };

export function CameraController() {
  const curDist = useRef(5.4);

  useFrame(({ camera }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const p = net.local.p;
    _target.set(p[0], p[1] + 1.35, p[2]);

    const yaw = input.yaw;
    const pitch = input.pitch;
    const cp = Math.cos(pitch);
    _dir.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).normalize();

    // Camera collision: pull in when the segment hits geometry.
    _o.x = _target.x;
    _o.y = _target.y;
    _o.z = _target.z;
    _d.x = _dir.x;
    _d.y = _dir.y;
    _d.z = _dir.z;
    const maxDist = 5.8;
    const hit = rayBlockedDistance(_o, _d, maxDist, 0.34);
    const wantDist = Math.max(1.35, Math.min(maxDist, hit - 0.18));
    // Snap in fast, extend out slowly (avoids popping through walls abruptly).
    const k = wantDist < curDist.current ? Math.min(1, dt * 26) : Math.min(1, dt * 7);
    curDist.current += (wantDist - curDist.current) * k;

    _desired.copy(_target).addScaledVector(_dir, curDist.current);
    // Keep camera above the ground plate.
    if (_desired.y < 0.35) _desired.y = 0.35;

    const smooth = 1 - Math.exp(-14 * dt);
    camera.position.lerp(_desired, smooth);
    camera.lookAt(_target);
  });

  return null;
}
