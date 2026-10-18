/**
 * NeonVerse shared world definition.
 *
 * The SAME collider data is used by:
 *  - the client renderer + character physics (collision, ground checks)
 *  - the authoritative server (bounds clamping, movement sanity checks, respawns)
 *
 * All geometry is procedural AABBs so no external 3D assets are required.
 * Units are meters. Ground level is y = 0.
 */

export type V3 = [number, number, number];

export type ColliderStyle =
  | 'ground'
  | 'platform'
  | 'pillar'
  | 'crate'
  | 'step'
  | 'building'
  | 'wall'
  | 'dais';

export interface AABB {
  min: V3;
  max: V3;
  style: ColliderStyle;
}

export interface BoostPad {
  id: number;
  x: number;
  z: number;
  /** Top surface height of the pad. */
  y: number;
}

export interface CrystalDef {
  id: string;
  p: V3;
  hue: number;
}

export interface FloatPlatform {
  x: number;
  z: number;
  /** Top surface height. */
  y: number;
  size: number;
  angleRad: number;
}

export interface Outpost {
  cx: number;
  cz: number;
  roofTop: number;
}

export interface GlowStrip {
  x: number;
  z: number;
  sx: number;
  sz: number;
  hue: number;
  rotY: number;
}

/** Build an AABB from center-x, center-z, size and base (bottom) y. */
function box(
  style: ColliderStyle,
  cx: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  baseY = 0,
): AABB {
  return {
    min: [cx - sx / 2, baseY, cz - sz / 2],
    max: [cx + sx / 2, baseY + sy, cz + sz / 2],
    style,
  };
}

/* ------------------------------------------------------------------ */
/* Physics & gameplay tuning (shared so server validation matches     */
/* what a legitimate client is physically able to do)                 */
/* ------------------------------------------------------------------ */

export const PHYS = {
  GRAVITY: 24,
  WALK_SPEED: 5.0,
  SPRINT_SPEED: 8.2,
  JUMP_SPEED: 8.2, // apex ≈ 1.4 m
  BOOST_VY: 13.5, // launch ≈ 3.8 m
  STEP_HEIGHT: 0.55,
  PLAYER_RADIUS: 0.38,
  PLAYER_HEIGHT: 1.55,
  ACCEL: 34,
  AIR_ACCEL: 12,
  FRICTION: 14,
  DEATH_Y: -18,
  /** Soft play-area boundary; |x| or |z| beyond this is out of bounds. */
  BOUND_XZ: 35,
  /** Item pickup distance enforced server-side. */
  PICKUP_RADIUS: 1.6,
} as const;

export const SCORE_PER_ITEM = 1;
export const SCORE_RESONANCE = 5; // bonus for attuning the last crystal

/* ------------------------------------------------------------------ */
/* Arena colliders                                                     */
/* ------------------------------------------------------------------ */

const colliders: AABB[] = [];

// Main ground plate: 72 x 72, top surface at y = 0.
colliders.push(box('ground', 0, 0, 72, 3, 72, -3));

// ----- Central dais: raised 12 x 12 stage, top y = 0.8 ---------------
colliders.push(box('dais', 0, 0, 12, 0.8, 12));

// Stairs onto the dais on all four sides. Dais edge sits at |x|/|z| = 6.
// North (-z)
colliders.push(box('step', 0, -7.7, 5, 0.4, 1.4));
colliders.push(box('step', 0, -6.6, 5, 0.8, 0.8));
// South (+z)
colliders.push(box('step', 0, 7.7, 5, 0.4, 1.4));
colliders.push(box('step', 0, 6.6, 5, 0.8, 0.8));
// West (-x)
colliders.push(box('step', -7.7, 0, 1.4, 0.4, 5));
colliders.push(box('step', -6.6, 0, 0.8, 0.8, 5));
// East (+x)
colliders.push(box('step', 7.7, 0, 1.4, 0.4, 5));
colliders.push(box('step', 6.6, 0, 0.8, 0.8, 5));

// ----- Corner pillars on the dais (crystal pedestals) -----------------
for (const [x, z] of [
  [-4.5, -4.5],
  [4.5, -4.5],
  [-4.5, 4.5],
  [4.5, 4.5],
]) {
  colliders.push(box('pillar', x, z, 1.1, 2.6, 1.1, 0.8));
}

// ----- Cover walls on the ground arena --------------------------------
colliders.push(box('wall', -8, 0, 0.8, 1.1, 6));
colliders.push(box('wall', 8, 0, 0.8, 1.1, 6));
colliders.push(box('wall', 0, -8, 6, 1.1, 0.8));
colliders.push(box('wall', 0, 8, 6, 1.1, 0.8));

// ----- Crate clusters --------------------------------------------------
const crateSpots: [number, number, number][] = [
  [13, 11, 1.8],
  [14.8, 11.3, 1.8],
  [-13, -10, 1.8],
  [-11.3, -11.4, 1.8],
  [16, -14, 1.8],
  [-18, 12, 2.2],
  [22, 6, 1.8],
  [-9, 17, 1.8],
  [10, -19, 2.0],
];
for (const [cx, cz, s] of crateSpots) {
  colliders.push(box('crate', cx, cz, s, s, s));
}
// Stacked crates on two clusters.
colliders.push(box('crate', 13, 11, 1.7, 1.7, 1.7, 1.8));
colliders.push(box('crate', -13, -10, 1.7, 1.7, 1.7, 1.8));

/* ------------------------------------------------------------------ */
/* Floating outer platforms + step-ramp bridges (procedural)          */
/* ------------------------------------------------------------------ */

export const FLOAT_PLATFORMS: FloatPlatform[] = [];
const PLATFORM_COUNT = 8;
const PLATFORM_RADIUS = 24;
const PLATFORM_HEIGHTS = [2.0, 3.0, 2.5, 4.0, 2.0, 3.0, 2.5, 4.0];

for (let i = 0; i < PLATFORM_COUNT; i++) {
  const a = (i / PLATFORM_COUNT) * Math.PI * 2 + Math.PI / 8;
  const x = Math.cos(a) * PLATFORM_RADIUS;
  const z = Math.sin(a) * PLATFORM_RADIUS;
  const y = PLATFORM_HEIGHTS[i % PLATFORM_HEIGHTS.length];
  const size = 6.5;
  FLOAT_PLATFORMS.push({ x, z, y, size, angleRad: a });
  colliders.push(box('platform', x, z, size, 0.6, size, y - 0.6));

  // Bridge of 5 rising step blocks on the outer edge, each +y/5 taller,
  // so walking outward-to-inward climbs to platform height.
  const STEPS = 5;
  const stepDepth = 1.4;
  for (let s = 0; s < STEPS; s++) {
    const dist = PLATFORM_RADIUS + size / 2 + (STEPS - s) * stepDepth;
    const sx = Math.cos(a) * dist;
    const sz = Math.sin(a) * dist;
    const top = (s + 1) * (y / STEPS);
    colliders.push(box('step', sx, sz, 3.2, top, 3.2));
  }
}

/* ------------------------------------------------------------------ */
/* Outpost buildings (hollow, one door gap) at opposite corners       */
/* ------------------------------------------------------------------ */

export const OUTPOSTS: Outpost[] = [];

function outpost(cx: number, cz: number, doorFacing: [number, number]): Outpost {
  const w = 9; // extent along x
  const d = 9; // extent along z
  const h = 4.5;
  const t = 0.6;
  const doorOnXAxis = Math.abs(doorFacing[0]) > Math.abs(doorFacing[1]);

  if (doorOnXAxis) {
    // Back wall opposite the door.
    colliders.push(box('building', cx - doorFacing[0] * (w / 2), cz, t, h, d));
    // Side walls.
    colliders.push(box('building', cx, cz - d / 2, w, h, t));
    colliders.push(box('building', cx, cz + d / 2, w, h, t));
    // Front wall split by a ~3 m door.
    const frontX = cx + doorFacing[0] * (w / 2);
    colliders.push(box('building', frontX, cz - (d / 4 + 0.75), t, h, d / 2 - 1.5));
    colliders.push(box('building', frontX, cz + (d / 4 + 0.75), t, h, d / 2 - 1.5));
  } else {
    colliders.push(box('building', cx, cz - doorFacing[1] * (d / 2), w, h, t));
    colliders.push(box('building', cx - w / 2, cz, t, h, d));
    colliders.push(box('building', cx + w / 2, cz, t, h, d));
    const frontZ = cz + doorFacing[1] * (d / 2);
    colliders.push(box('building', cx - (w / 4 + 0.75), frontZ, w / 2 - 1.5, h, t));
    colliders.push(box('building', cx + (w / 4 + 0.75), frontZ, w / 2 - 1.5, h, t));
  }
  // Roof slab, walkable.
  colliders.push(box('building', cx, cz, w + 1, 0.5, d + 1, h));
  const op = { cx, cz, roofTop: h + 0.5 };
  OUTPOSTS.push(op);
  return op;
}

// Doors face the arena center along z (so both outposts use z-facing doors).
outpost(28, 20, [0, -1]);
outpost(-28, -20, [0, 1]);

/* ------------------------------------------------------------------ */
/* Boost pads — launch the player onto high platforms / roofs         */
/* ------------------------------------------------------------------ */

export const BOOST_PADS: BoostPad[] = [
  { id: 0, x: 28, z: 14.5, y: 0.06 },
  { id: 1, x: -28, z: -14.5, y: 0.06 },
  { id: 2, x: 0, z: -31, y: 0.06 },
  { id: 3, x: 0, z: 31, y: 0.06 },
];

/* ------------------------------------------------------------------ */
/* Interactive energy crystals                                        */
/* ------------------------------------------------------------------ */

export const CRYSTALS: CrystalDef[] = [
  { id: 'c1', p: [-4.5, 3.9, -4.5], hue: 0.52 },
  { id: 'c2', p: [4.5, 3.9, -4.5], hue: 0.86 },
  { id: 'c3', p: [-4.5, 3.9, 4.5], hue: 0.72 },
  { id: 'c4', p: [4.5, 3.9, 4.5], hue: 0.95 },
  { id: 'core', p: [0, 4.7, 0], hue: 0.48 },
];

/* ------------------------------------------------------------------ */
/* Collectible spawn points (server picks locations from this pool)   */
/* ------------------------------------------------------------------ */

export const ITEM_SPAWNS: V3[] = [];
// Ring of 12 on the ground between cover walls and outer platforms.
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  ITEM_SPAWNS.push([Math.cos(a) * 17.5, 0.95, Math.sin(a) * 17.5]);
}
// On the dais.
ITEM_SPAWNS.push([0, 1.75, 3], [3, 1.75, -3], [-3, 1.75, 0]);
// On each floating platform.
for (const p of FLOAT_PLATFORMS) ITEM_SPAWNS.push([p.x, p.y + 0.95, p.z]);
// On top of the two stacked crate clusters.
ITEM_SPAWNS.push([13, 3.75, 11], [-13, 3.75, -10]);
// On outpost roofs.
for (const o of OUTPOSTS) ITEM_SPAWNS.push([o.cx, o.roofTop + 0.95, o.cz]);

/* ------------------------------------------------------------------ */
/* Spawn / respawn points                                              */
/* ------------------------------------------------------------------ */

export const SPAWN_POINTS: V3[] = [];
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  SPAWN_POINTS.push([Math.cos(a) * 10.5, 1.1, Math.sin(a) * 10.5]);
}

/* ------------------------------------------------------------------ */
/* Decorative, non-colliding glow strips on the ground                */
/* ------------------------------------------------------------------ */

export const GLOW_STRIPS: GlowStrip[] = [];
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  GLOW_STRIPS.push({
    x: Math.cos(a) * 31,
    z: Math.sin(a) * 31,
    sx: 3.2,
    sz: 0.22,
    hue: i % 2 === 0 ? 0.5 : 0.85,
    rotY: -a + Math.PI / 2,
  });
}
for (let i = 0; i < 4; i++) {
  const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
  GLOW_STRIPS.push({
    x: Math.cos(a) * 6.2,
    z: Math.sin(a) * 6.2,
    sx: 2.4,
    sz: 0.18,
    hue: 0.55,
    rotY: -a,
  });
}

export const WORLD_COLLIDERS: readonly AABB[] = colliders;

/** Approximate highest walkable surface under (x, z). Used for sanity checks. */
export function surfaceHeightAt(x: number, z: number): number {
  let best = 0;
  for (const c of WORLD_COLLIDERS) {
    if (x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2]) {
      if (c.max[1] > best) best = c.max[1];
    }
  }
  return best;
}
