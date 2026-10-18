/**
 * The main gameplay Canvas: world + local player + remotes + items + FX.
 * All per-frame work happens inside useFrame; React re-renders are limited
 * to roster/quality changes.
 */

import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { PlayerProfile } from '@shared/protocol';
import { World } from './World';
import { Player } from './Player';
import { RemotePlayers } from './RemotePlayer';
import { Collectibles } from './Collectibles';
import { FX } from './FX';
import { CameraController } from './CameraController';
import { input } from './input';
import { useSettings } from '../store/settings';

export function GameScene({ profile }: { profile: PlayerProfile }) {
  const quality = useSettings((s) => s.quality);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Attach keyboard + pointer-lock listeners to the canvas wrapper.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    input.attach(el);

    // Touch camera drag on the canvas itself (right-side area on mobile).
    let lastTouch: { id: number; x: number; y: number } | null = null;
    const onDown = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t && t.clientX > window.innerWidth * 0.35) {
        lastTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (!lastTouch) return;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.identifier === lastTouch.id) {
          input.addTouchLook(t.clientX - lastTouch.x, t.clientY - lastTouch.y);
          lastTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
          break;
        }
      }
    };
    const onUp = () => {
      lastTouch = null;
    };
    el.addEventListener('touchstart', onDown, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onUp);
    el.addEventListener('touchcancel', onUp);
    return () => {
      el.removeEventListener('touchstart', onDown);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onUp);
      el.removeEventListener('touchcancel', onUp);
      input.detach();
    };
  }, []);

  const dpr: [number, number] = quality === 'low' ? [0.7, 1] : quality === 'medium' ? [1, 1.5] : [1, 2];

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 outline-none"
      tabIndex={0}
      onPointerDown={(e) => {
        // Click-to-lock for desktop mouse look (only when no UI is open).
        if (e.button === 0 && !input.uiMode && !input.isTouch) {
          input.requestPointerLock();
        }
      }}
    >
      <Canvas
        shadows={quality !== 'low'}
        dpr={dpr}
        gl={{
          antialias: quality !== 'low',
          powerPreference: 'high-performance',
          stencil: false,
        }}
        camera={{ fov: 62, near: 0.12, far: 420, position: [0, 6, 16] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Suspense fallback={null}>
          <World />
          <Player profile={profile} />
          <RemotePlayers />
          <Collectibles />
          <FX />
          <CameraController />
        </Suspense>
      </Canvas>
    </div>
  );
}
