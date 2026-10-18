/**
 * Input singleton: keyboard + pointer-lock mouse + touch joystick/look.
 * Read inside useFrame loops (no React state, no re-renders).
 */

import { settingsNow } from '../store/settings';

export class InputState {
  keys = new Set<string>();
  /** Virtual joystick vector (-1..1). forward = +y. */
  joyX = 0;
  joyY = 0;
  yaw = Math.PI;
  pitch = 0.16;
  jumpQueued = false;
  sprintToggle = false; // mobile sprint
  uiMode = false; // chat/pause open — game input suppressed
  pointerLocked = false;
  readonly isTouch: boolean =
    typeof window !== 'undefined' &&
    (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);

  private el: HTMLElement | null = null;
  private detachFns: (() => void)[] = [];

  attach(el: HTMLElement): void {
    this.detach();
    this.el = el;

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.uiMode) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.jumpQueued = true;
        if (!this.uiMode) e.preventDefault();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const onBlur = () => this.keys.clear();

    const onMouseMove = (e: MouseEvent) => {
      if (!this.pointerLocked || this.uiMode) return;
      const s = settingsNow();
      const k = 0.0023 * s.mouseSensitivity;
      this.yaw -= e.movementX * k;
      this.pitch -= (s.invertY ? -e.movementY : e.movementY) * k;
      this.clampPitch();
    };

    const onLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.el;
      window.__nvPointerLock?.(this.pointerLocked);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    this.detachFns.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
    });
  }

  detach(): void {
    for (const fn of this.detachFns) fn();
    this.detachFns = [];
    this.keys.clear();
  }

  private clampPitch(): void {
    this.pitch = Math.max(-1.25, Math.min(1.35, this.pitch));
  }

  /** Touch camera drag (right side of screen on mobile). */
  addTouchLook(dxPx: number, dyPx: number): void {
    if (this.uiMode) return;
    const s = settingsNow();
    const k = 0.0042 * s.mouseSensitivity;
    this.yaw -= dxPx * k;
    this.pitch -= (s.invertY ? -dyPx : dyPx) * k;
    this.clampPitch();
  }

  requestPointerLock(): void {
    if (this.uiMode || this.isTouch) return;
    try {
      const maybe = this.el?.requestPointerLock?.() as unknown;
      if (maybe && typeof (maybe as Promise<void>).catch === 'function') {
        (maybe as Promise<void>).catch(() => {
          /* embedding contexts / hidden tabs can refuse — hint stays visible */
        });
      }
    } catch {
      /* older engines throw synchronously */
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.pointerLocked = false;
  }

  /** Merged move vector from WASD and joystick, clamped to length 1. */
  moveVector(out: { x: number; y: number }): void {
    let x = 0;
    let y = 0;
    if (!this.uiMode) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      x += this.joyX;
      y += this.joyY;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    out.x = x;
    out.y = y;
  }

  get sprintHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintToggle;
  }
}

export const input = new InputState();

/** Hook set by GameScreen to react to pointer-lock changes in UI. */
declare global {
  interface Window {
    __nvPointerLock?: (locked: boolean) => void;
  }
}
