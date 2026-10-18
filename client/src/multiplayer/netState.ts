/**
 * Hot, mutable network state shared across 3D components.
 *
 * Deliberately NOT React state: remote positions arrive at 15 Hz and are read
 * inside useFrame loops, so re-rendering React trees would be wasteful.
 * Low-frequency, UI-facing state lives in the zustand stores.
 */

import {
  type EmoteId,
  type ItemState,
  type MoveState,
  type PlayerProfile,
  type PlayerSnapshot,
} from '@shared/protocol';
import type { V3 } from '@shared/world';

export interface BufferedState extends PlayerSnapshot {
  /** Client receive-time (ms) for interpolation. */
  t: number;
}

export interface PickupFx {
  type: 'pickup' | 'boost' | 'respawn' | 'resonance' | 'collectOther';
  p: V3;
  color?: string;
}

export interface NetState {
  selfId: string;
  selfProfile: PlayerProfile | null;
  solo: boolean;
  /** playerId -> profile for everyone in the room (from RoomState/PlayerJoined). */
  profiles: Map<string, PlayerProfile>;
  /** playerId -> ring-buffered snapshots of remote movement. */
  remotes: Map<string, BufferedState[]>;
  /** Currently visible/active collectibles by id. */
  items: Map<number, ItemState>;
  /** Active (attuned) crystal ids. */
  crystals: Set<string>;
  /** Local authoritative player state (client prediction). */
  local: PlayerSnapshot & { grounded: boolean };
  /** Last emote played by each player, for animation triggers. */
  emotes: Map<string, { emote: EmoteId; at: number }>;
  /** One-shot particle FX queued by events, consumed by the FX system. */
  fx: PickupFx[];
}

export const net: NetState = {
  selfId: '',
  selfProfile: null,
  solo: false,
  profiles: new Map(),
  remotes: new Map(),
  items: new Map(),
  crystals: new Set(),
  local: { p: [0, 2, 8], ry: Math.PI, mv: 0, grounded: false },
  emotes: new Map(),
  fx: [],
};

const BUFFER_CAP = 40;

/** Interpolation latency: remote states are rendered this far in the past. */
export const INTERP_DELAY_MS = 120;

export function pushRemote(id: string, snap: PlayerSnapshot, serverTs: number): void {
  let buf = net.remotes.get(id);
  if (!buf) {
    buf = [];
    net.remotes.set(id, buf);
  }
  // Arrival time on our monotonic clock; keep buffers strictly increasing.
  const now = performance.now();
  const last = buf[buf.length - 1];
  const t = last && last.t >= now ? last.t + 8 : now;
  void serverTs;
  buf.push({ ...snap, t });
  if (buf.length > BUFFER_CAP) buf.splice(0, buf.length - BUFFER_CAP);
}

const _out: PlayerSnapshot = { p: [0, 0, 0], ry: 0, mv: 0 };

/**
 * Interpolated remote state `INTERP_DELAY_MS` in the past.
 * Returns null when there is no data yet for that player.
 */
export function sampleRemote(id: string, nowPerfMs: number): PlayerSnapshot | null {
  const buf = net.remotes.get(id);
  if (!buf || buf.length === 0) return null;
  const target = nowPerfMs - INTERP_DELAY_MS;

  if (buf.length === 1 || target >= buf[buf.length - 1].t) {
    const s = buf[buf.length - 1];
    _out.p = s.p;
    _out.ry = s.ry;
    _out.mv = s.mv;
    return _out;
  }
  // Find the segment surrounding target.
  let i = buf.length - 1;
  while (i > 0 && buf[i].t > target) i--;
  const a = buf[i];
  const b = buf[Math.min(i + 1, buf.length - 1)];
  if (a === b || b.t === a.t) {
    _out.p = a.p;
    _out.ry = a.ry;
    _out.mv = a.mv;
    return _out;
  }
  const k = (target - a.t) / (b.t - a.t);
  // Shortest-arc yaw interpolation.
  let dRy = b.ry - a.ry;
  while (dRy > Math.PI) dRy -= Math.PI * 2;
  while (dRy < -Math.PI) dRy += Math.PI * 2;
  _out.p = [a.p[0] + (b.p[0] - a.p[0]) * k, a.p[1] + (b.p[1] - a.p[1]) * k, a.p[2] + (b.p[2] - a.p[2]) * k];
  _out.ry = a.ry + dRy * k;
  _out.mv = (k > 0.5 ? b.mv : a.mv) as MoveState;
  return _out;
}

export function resetNet(): void {
  net.selfId = '';
  net.profiles.clear();
  net.remotes.clear();
  net.items.clear();
  net.crystals.clear();
  net.emotes.clear();
  net.fx.length = 0;
}

/** Keep remotes/pruned buffers aligned with the authoritative room roster. */
export function syncRoster(ids: string[]): void {
  const set = new Set(ids);
  for (const id of [...net.remotes.keys()]) {
    if (!set.has(id)) net.remotes.delete(id);
  }
}
