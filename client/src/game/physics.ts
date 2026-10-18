/**
 * Client character physics: AABB body vs. static world colliders with
 * axis-separated collision resolution, auto step-up, and ground probing.
 * Deterministic, allocation-light, runs every frame for the local player.
 */

import { BOOST_PADS, PHYS, WORLD_COLLIDERS, type AABB } from '@shared/world';

export interface Vec3Mutable {
  x: number;
  y: number;
  z: number;
}

export interface StepOutcome {
  grounded: boolean;
  landed: boolean; // transitioned from airborne to ground this frame
  hitHead: boolean;
  blockedX: boolean;
  blockedZ: boolean;
}

const R = PHYS.PLAYER_RADIUS;
const H = PHYS.PLAYER_HEIGHT;
const STEP = PHYS.STEP_HEIGHT;
const EPS = 0.0001;

/** Box vs player-AABB overlap at feet position (x, y, z). */
function overlapsBox(b: AABB, x: number, y: number, z: number, yShrink = 0): boolean {
  return (
    x + R > b.min[0] + EPS &&
    x - R < b.max[0] - EPS &&
    z + R > b.min[2] + EPS &&
    z - R < b.max[2] - EPS &&
    y + yShrink + H > b.min[1] + EPS &&
    y + yShrink < b.max[1] - 0.02
  );
}

function blocked(x: number, y: number, z: number): boolean {
  for (const b of WORLD_COLLIDERS) {
    if (overlapsBox(b, x, y, z)) return true;
  }
  return false;
}

function blockedForStep(x: number, y: number, z: number): boolean {
  // Consider only colliders whose tops are above our step-up threshold.
  for (const b of WORLD_COLLIDERS) {
    if (b.max[1] - y > STEP + EPS && overlapsBox(b, x, y, z)) return true;
  }
  return false;
}

function clampToBounds(pos: Vec3Mutable): void {
  const B = PHYS.BOUND_XZ;
  if (pos.x > B) pos.x = B;
  if (pos.x < -B) pos.x = -B;
  if (pos.z > B) pos.z = B;
  if (pos.z < -B) pos.z = -B;
}

/**
 * Integrate one step: mutate pos & vel in place.
 * Order: X → Z → Y with per-axis resolution for stable stacking.
 */
export function stepBody(pos: Vec3Mutable, vel: Vec3Mutable, dt: number): StepOutcome {
  const out: StepOutcome = { grounded: false, landed: false, hitHead: false, blockedX: false, blockedZ: false };
  const wasAirborne = !posNearGround(pos);

  // ---- X ----
  let nx = pos.x + vel.x * dt;
  if (!blocked(nx, pos.y, pos.z)) {
    pos.x = nx;
  } else if (vel.y <= 0 && !blockedForStep(nx, pos.y, pos.z) && !blocked(nx, pos.y + STEP, pos.z)) {
    pos.x = nx;
    pos.y += STEP; // step up over low obstacle
  } else {
    out.blockedX = true;
    // Slide flush against the blocking face.
    let best = nx;
    for (const b of WORLD_COLLIDERS) {
      if (overlapsBox(b, nx, pos.y, pos.z)) {
        const candidate = vel.x > 0 ? b.min[0] - R - EPS : b.max[0] + R + EPS;
        if (vel.x > 0 ? candidate < best : candidate > best) best = candidate;
      }
    }
    pos.x = best;
    vel.x *= 0.4; // scrape friction
  }

  // ---- Z ----
  let nz = pos.z + vel.z * dt;
  if (!blocked(pos.x, pos.y, nz)) {
    pos.z = nz;
  } else if (vel.y <= 0 && !blockedForStep(pos.x, pos.y, nz) && !blocked(pos.x, pos.y + STEP, nz)) {
    pos.z = nz;
    pos.y += STEP;
  } else {
    out.blockedZ = true;
    let best = nz;
    for (const b of WORLD_COLLIDERS) {
      if (overlapsBox(b, pos.x, pos.y, best)) {
        const candidate = vel.z > 0 ? b.min[2] - R - EPS : b.max[2] + R + EPS;
        if (vel.z > 0 ? candidate < best : candidate > best) best = candidate;
      }
    }
    pos.z = best;
    vel.z *= 0.4;
  }

  // ---- Y ----
  const ny = pos.y + vel.y * dt;
  pos.y = ny;
  for (const b of WORLD_COLLIDERS) {
    if (!overlapsBox(b, pos.x, pos.y, pos.z, 0)) continue;
    if (vel.y <= 0 && pos.y < b.max[1] && ny < b.max[1]) {
      // Landing on top.
      pos.y = b.max[1];
      if (wasAirborne) out.landed = true;
      vel.y = 0;
      out.grounded = true;
    } else if (vel.y > 0) {
      // Head bump.
      pos.y = b.min[1] - H - EPS;
      vel.y = Math.min(0, vel.y);
      out.hitHead = true;
    }
  }
  clampToBounds(pos);
  return out;
}

/** Cheap support probe: is the feet point resting on/inside a top surface? */
function posNearGround(pos: Vec3Mutable): boolean {
  for (const b of WORLD_COLLIDERS) {
    if (
      pos.x + R > b.min[0] + EPS &&
      pos.x - R < b.max[0] - EPS &&
      pos.z + R > b.min[2] + EPS &&
      pos.z - R < b.max[2] - EPS &&
      Math.abs(pos.y - b.max[1]) < 0.05
    ) {
      return true;
    }
  }
  return false;
}

/** Is the body currently intersecting anything (spawn safety)? */
export function positionBlocked(x: number, y: number, z: number): boolean {
  return blocked(x, y, z);
}

/**
 * Raycast from `o` along unit direction `d`, returns distance to the first
 * expanded AABB hit (or maxDist). Used for third-person camera collision.
 */
export function rayBlockedDistance(
  o: Vec3Mutable,
  d: Vec3Mutable,
  maxDist: number,
  margin: number,
): number {
  let best = maxDist;
  for (const b of WORLD_COLLIDERS) {
    const t = rayBox(o, d, b, margin);
    if (t !== null && t < best && t > 0) best = t;
  }
  return best;
}

function rayBox(o: Vec3Mutable, d: Vec3Mutable, b: AABB, m: number): number | null {
  const min = [b.min[0] - m, b.min[1] - m, b.min[2] - m];
  const max = [b.max[0] + m, b.max[1] + m, b.max[2] + m];
  const od = [o.x, o.y, o.z];
  let tmin = 0;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const oi = od[i];
    const di = i === 0 ? d.x : i === 1 ? d.y : d.z;
    if (Math.abs(di) < 1e-8) {
      if (oi < min[i] || oi > max[i]) return null;
      continue;
    }
    let t1 = (min[i] - oi) / di;
    let t2 = (max[i] - oi) / di;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

/** Boost pad check: feet inside a pad footprint while grounded. */
export function onBoostPad(pos: Vec3Mutable): boolean {
  for (const pad of BOOST_PADS) {
    if (Math.abs(pos.y - pad.y) < 0.4 && Math.abs(pos.x - pad.x) < 1.15 && Math.abs(pos.z - pad.z) < 1.15) {
      return true;
    }
  }
  return false;
}
