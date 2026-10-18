/**
 * Server-side movement sanity checks — the authoritative boundary that a
 * legitimate client could physically reach. Raw colliders are NOT re-simulated
 * server-side (the client owns fine collision); instead we reject impossible
 * teleports, clamp to the play area, and detect out-of-world falls.
 */

import { PHYS, type V3 } from '../../shared/src/world';

export interface MoveCandidate {
  p: V3;
  ry: number;
  mv: 0 | 1 | 2 | 3;
}

export interface MoveValidation {
  /** Accepted position (possibly clamped). */
  p: V3;
  /** True when the claimed move exceeded physics and had to be corrected. */
  corrected: boolean;
  /** True when the player is below the world and must respawn. */
  fell: boolean;
}

const MAX_H_SPEED = PHYS.SPRINT_SPEED * 1.55 + 2; // generous slack for jitter
const MAX_V_SPEED = 60; // high falls from boost launches
const EPS = 0.001;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Validate one movement update against the previously accepted state.
 * `dtSeconds` should be derived from wall-clock time between updates.
 */
export function validateMovement(
  prev: V3,
  prevAtMs: number,
  candidate: MoveCandidate,
  nowMs: number,
): MoveValidation {
  const dt = Math.min(1, Math.max(0.03, (nowMs - prevAtMs) / 1000));
  let corrected = false;

  const [px, py, pz] = prev;
  let [nx, ny, nz] = candidate.p;

  if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) {
    return { p: [px, py, pz], corrected: true, fell: false };
  }

  // Horizontal speed check with clamping toward the allowed radius.
  const dx = nx - px;
  const dz = nz - pz;
  const hDist = Math.hypot(dx, dz);
  const maxH = MAX_H_SPEED * dt + 0.75; // small constant absorbs packet jitter
  if (hDist > maxH) {
    const k = maxH / (hDist + EPS);
    nx = px + dx * k;
    nz = pz + dz * k;
    corrected = true;
  }

  // Vertical speed check (allows fast falls / boost launches but no teleport).
  const dy = ny - py;
  const maxV = MAX_V_SPEED * dt + 1.25;
  if (Math.abs(dy) > maxV) {
    ny = py + Math.sign(dy) * maxV;
    corrected = true;
  }

  // Play-area bounds: clamp inside the invisible walls.
  const bx = clamp(nx, -PHYS.BOUND_XZ, PHYS.BOUND_XZ);
  const bz = clamp(nz, -PHYS.BOUND_XZ, PHYS.BOUND_XZ);
  if (bx !== nx || bz !== nz) corrected = true;
  nx = bx;
  nz = bz;

  // Ceiling guard.
  const ny2 = clamp(ny, PHYS.DEATH_Y - 6, 80);
  if (ny2 !== ny) corrected = true;

  const fell = ny2 < PHYS.DEATH_Y;
  return { p: [nx, ny2, nz], corrected, fell };
}

/** Squared distance helper used for proximity validation. */
export function dist2(a: V3, b: V3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/** True if the player position is within `radius` of the target point. */
export function withinRadius(a: V3, b: V3, radius: number): boolean {
  return dist2(a, b) <= radius * radius;
}
