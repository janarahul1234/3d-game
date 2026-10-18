/**
 * GameRoom — authoritative per-room gameplay state.
 *
 * Deliberately free of socket.io imports: all time-dependent methods take an
 * explicit `now` argument, which makes the rules directly unit-testable.
 */

import {
  CRYSTALS,
  ITEM_SPAWNS,
  PHYS,
  SCORE_PER_ITEM,
  SCORE_RESONANCE,
  SPAWN_POINTS,
  type V3,
} from '../../shared/src/world';
import {
  type ItemState,
  type LeaderRow,
  type MoveState,
  type PlayerSnapshot,
  type PublicPlayer,
  type RoomPhase,
  type RoomSnapshot,
} from '../../shared/src/protocol';
import { validateMovement, withinRadius } from './collision';
import type { PlayerRecord } from './playerManager';

export interface RoomOptions {
  maxPlayers: number;
  itemRespawnMs: number;
  activeItems: number;
}

export type CollectResult =
  | { ok: true; itemId: number; playerId: string; score: number }
  | { ok: false; reason: 'NOT_FOUND' | 'ALREADY_COLLECTED' | 'TOO_FAR' | 'NOT_PLAYING' };

export interface MovementResult {
  accepted: boolean;
  fell: boolean;
  /** Authoritative respawn position when `fell` is true. */
  respawn?: V3;
}

export interface CrystalToggleResult {
  ok: boolean;
  active?: boolean;
  /** Set when this toggle completed a full-resonance attunement. */
  resonance?: { playerId: string; score: number };
}

const CHAT_BUCKET_CAPACITY = 4;
const CHAT_REFILL_MS = 2500; // one token back every 2.5 s
const EMOTE_COOLDOWN_MS = 900;

function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export class GameRoom {
  readonly code: string;
  readonly createdAt = Date.now();
  phase: RoomPhase = 'lobby';
  hostId: string;
  maxPlayers: number;
  readonly players = new Map<string, PlayerRecord>();
  items: ItemState[] = [];
  crystalsActive = new Set<string>();

  private readonly opts: RoomOptions;
  private itemRespawnAt = new Map<number, number>();
  private spawnIdxById = new Map<number, number>();
  private chatBuckets = new Map<string, { tokens: number; last: number }>();
  private emoteLast = new Map<string, number>();
  /** Incremented whenever lobby membership/ready state changes. */
  version = 0;

  constructor(code: string, hostId: string, opts: RoomOptions) {
    this.code = code;
    this.hostId = hostId;
    this.opts = opts;
    this.maxPlayers = Math.max(2, Math.min(opts.maxPlayers, 40));
  }

  get isFull(): boolean {
    return this.players.size >= this.maxPlayers;
  }

  get playerCount(): number {
    return this.players.size;
  }

  addPlayer(rec: PlayerRecord): boolean {
    if (this.players.has(rec.id) || this.isFull) return false;
    this.players.set(rec.id, rec);
    this.version++;
    return true;
  }

  removePlayer(id: string): { hostChanged: boolean } {
    this.players.delete(id);
    this.chatBuckets.delete(id);
    this.emoteLast.delete(id);
    let hostChanged = false;
    if (this.hostId === id) {
      const next = this.players.keys().next().value;
      this.hostId = next ?? '';
      if (next) hostChanged = true;
    }
    this.version++;
    return { hostChanged };
  }

  setReady(id: string, ready: boolean): void {
    const p = this.players.get(id);
    if (p) {
      p.ready = ready;
      this.version++;
    }
  }

  publicState(): RoomSnapshot {
    const players: PublicPlayer[] = [];
    for (const p of this.players.values()) {
      players.push({ id: p.id, profile: p.profile, score: p.score, ready: p.ready });
    }
    return {
      code: this.code,
      phase: this.phase,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      players,
    };
  }

  /** Start (or late-initialize) the round: spawn everyone + place items. */
  startGame(now: number): Record<string, V3> {
    this.phase = 'playing';
    const spawns = shuffled(SPAWN_POINTS);
    let i = 0;
    const result: Record<string, V3> = {};
    for (const p of this.players.values()) {
      const s = spawns[i % spawns.length];
      p.pos = [s[0], s[1], s[2]];
      p.ry = Math.atan2(s[0], s[2]) + Math.PI;
      p.mv = 0;
      p.lastUpdateAt = now;
      result[p.id] = p.pos;
      i++;
    }
    this.initItems();
    this.crystalsActive.clear();
    this.version++;
    return result;
  }

  private initItems(): void {
    const pool = shuffled(Array.from(ITEM_SPAWNS.keys()));
    this.items = [];
    this.itemRespawnAt.clear();
    this.spawnIdxById.clear();
    const n = Math.min(this.opts.activeItems, ITEM_SPAWNS.length);
    for (let k = 0; k < n; k++) {
      const spawnIdx: number = pool[k % pool.length];
      const p = ITEM_SPAWNS[spawnIdx];
      this.items.push({ id: k, p: [p[0], p[1], p[2]], active: true });
      this.spawnIdxById.set(k, spawnIdx);
    }
  }

  /** Assign one item a fresh spawn location and activate it. */
  private relocateItem(item: ItemState): void {
    const prevIdx = this.spawnIdxById.get(item.id) ?? 0;
    let idx = Math.floor(Math.random() * ITEM_SPAWNS.length);
    if (ITEM_SPAWNS.length > 1 && idx === prevIdx) idx = (idx + 1) % ITEM_SPAWNS.length;
    const p = ITEM_SPAWNS[idx];
    item.p = [p[0], p[1], p[2]];
    item.active = true;
    this.spawnIdxById.set(item.id, idx);
  }

  /** Called by the room tick: activate items whose respawn delay elapsed. */
  tickItems(now: number): ItemState[] {
    const respawned: ItemState[] = [];
    for (const item of this.items) {
      if (item.active) continue;
      const at = this.itemRespawnAt.get(item.id);
      if (at !== undefined && now >= at) {
        this.relocateItem(item);
        this.itemRespawnAt.delete(item.id);
        respawned.push({ ...item });
      }
    }
    return respawned;
  }

  /** Validate + accept a client movement claim. Server position is law. */
  applyMovement(id: string, candidate: PlayerSnapshot, now: number): MovementResult {
    const p = this.players.get(id);
    if (!p || this.phase !== 'playing') return { accepted: false, fell: false };

    const v = validateMovement(p.pos, p.lastUpdateAt, candidate, now);
    p.pos = v.p;
    p.ry = candidate.ry;
    p.mv = candidate.mv as MoveState;
    p.lastUpdateAt = now;
    if (v.corrected) p.corrections++;

    if (v.fell) {
      const s = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
      p.pos = [s[0], s[1], s[2]];
      p.mv = 0;
      return { accepted: true, fell: true, respawn: p.pos };
    }
    return { accepted: true, fell: false };
  }

  /** Server-validated collection: proximity + single-award-per-spawn. */
  tryCollect(playerId: string, itemId: number, now: number): CollectResult {
    if (this.phase !== 'playing') return { ok: false, reason: 'NOT_PLAYING' };
    const p = this.players.get(playerId);
    if (!p) return { ok: false, reason: 'NOT_FOUND' };
    const item = this.items.find((it) => it.id === itemId);
    if (!item) return { ok: false, reason: 'NOT_FOUND' };
    if (!item.active) return { ok: false, reason: 'ALREADY_COLLECTED' };
    if (!withinRadius(p.pos, item.p, PHYS.PICKUP_RADIUS)) {
      return { ok: false, reason: 'TOO_FAR' };
    }
    item.active = false;
    this.itemRespawnAt.set(item.id, now + this.opts.itemRespawnMs);
    p.score += SCORE_PER_ITEM;
    return { ok: true, itemId: item.id, playerId, score: p.score };
  }

  toggleCrystal(playerId: string, crystalId: string): CrystalToggleResult {
    if (this.phase !== 'playing') return { ok: false };
    const p = this.players.get(playerId);
    const crystal = CRYSTALS.find((c) => c.id === crystalId);
    if (!p || !crystal) return { ok: false };
    if (!withinRadius(p.pos, crystal.p, 3.2)) return { ok: false };

    let active: boolean;
    if (this.crystalsActive.has(crystalId)) {
      this.crystalsActive.delete(crystalId);
      active = false;
    } else {
      this.crystalsActive.add(crystalId);
      active = true;
    }

    if (active && this.crystalsActive.size === CRYSTALS.length) {
      // Full resonance! Award the completing player, then crystals go dark
      // again so the loop can repeat.
      p.score += SCORE_RESONANCE;
      this.crystalsActive.clear();
      return { ok: true, active: false, resonance: { playerId, score: p.score } };
    }
    return { ok: true, active };
  }

  /** Token-bucket chat rate limit. */
  allowChat(playerId: string, now: number): boolean {
    let b = this.chatBuckets.get(playerId);
    if (!b) {
      b = { tokens: CHAT_BUCKET_CAPACITY, last: now };
      this.chatBuckets.set(playerId, b);
    }
    const refill = Math.floor((now - b.last) / CHAT_REFILL_MS);
    if (refill > 0) {
      b.tokens = Math.min(CHAT_BUCKET_CAPACITY, b.tokens + refill);
      b.last += refill * CHAT_REFILL_MS;
    }
    if (b.tokens <= 0) return false;
    b.tokens--;
    return true;
  }

  allowEmote(playerId: string, now: number): boolean {
    const last = this.emoteLast.get(playerId) ?? 0;
    if (now - last < EMOTE_COOLDOWN_MS) return false;
    this.emoteLast.set(playerId, now);
    return true;
  }

  leaderboard(n = 10): LeaderRow[] {
    const rows: LeaderRow[] = [];
    for (const p of this.players.values()) {
      rows.push({ id: p.id, name: p.profile.name, color: p.profile.color, score: p.score });
    }
    rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return rows.slice(0, n);
  }

  /** Compact snapshot map broadcast on every tick. */
  states(): Record<string, PlayerSnapshot> {
    const out: Record<string, PlayerSnapshot> = {};
    for (const p of this.players.values()) {
      out[p.id] = { p: p.pos, ry: p.ry, mv: p.mv };
    }
    return out;
  }

  scoreOf(id: string): number {
    return this.players.get(id)?.score ?? 0;
  }
}
