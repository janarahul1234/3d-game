/**
 * Offline solo session — keeps the game playable when the multiplayer server
 * is unreachable. Implements the same collection/respawn rules locally so
 * the gameplay loop is identical (scores are obviously not global).
 */

import type { ItemState } from '@shared/protocol';
import { CRYSTALS, ITEM_SPAWNS, PHYS, SCORE_PER_ITEM, SCORE_RESONANCE, SPAWN_POINTS } from '@shared/world';
import { useHud } from '../store/hud';
import { useSession } from '../store/session';
import { net, resetNet } from './netState';
import { audio } from '../game/audio';

const ACTIVE_ITEMS = 10;
const RESPAWN_MS = 12000;

class SoloSession {
  private items = new Map<number, ItemState>();
  private respawnAt = new Map<number, number>();
  private score = 0;
  private crystals = new Set<string>();

  start(): void {
    resetNet();
    net.solo = true;
    net.selfId = 'solo';
    const spawn = SPAWN_POINTS[0];
    net.local.p = [spawn[0], spawn[1], spawn[2]];
    this.items.clear();
    this.respawnAt.clear();
    this.crystals.clear();
    this.score = 0;
    const pool = ITEM_SPAWNS.map((_, i) => i).sort(() => Math.random() - 0.5);
    for (let k = 0; k < ACTIVE_ITEMS; k++) {
      const idx = pool[k % pool.length];
      const p = ITEM_SPAWNS[idx];
      this.items.set(k, { id: k, p: [p[0], p[1], p[2]], active: true });
    }
    net.items = this.items;
    const hud = useHud.getState();
    hud.setScore(0);
    hud.setLeaderboard([{ id: 'solo', name: net.selfProfile?.name ?? 'Solo', color: '#22d3ee', score: 0 }]);
    hud.clearChat();
    hud.toast('Offline mode — single player free-roam', 'info');
    const s = useSession.getState();
    s.setPhase('loading');
    setTimeout(() => s.setPhase('game'), 300);
    audio.ensure();
  }

  /** Called from the frame loop to progress respawn timers. */
  tick(now: number): void {
    for (const [id, at] of this.respawnAt) {
      if (now < at) continue;
      this.respawnAt.delete(id);
      const item = this.items.get(id);
      if (!item) continue;
      let idx = Math.floor(Math.random() * ITEM_SPAWNS.length);
      const p = ITEM_SPAWNS[idx];
      item.p = [p[0], p[1], p[2]];
      item.active = true;
      net.fx.push({ type: 'pickup', p: [p[0], p[1], p[2]], color: '#22d3ee' });
    }
  }

  collect(itemId: number, playerPos: readonly [number, number, number]): boolean {
    const item = this.items.get(itemId);
    if (!item || !item.active) return false;
    const dx = playerPos[0] - item.p[0];
    const dy = playerPos[1] + PHYS.PLAYER_HEIGHT / 2 - item.p[1];
    const dz = playerPos[2] - item.p[2];
    if (dx * dx + dy * dy + dz * dz > PHYS.PICKUP_RADIUS * PHYS.PICKUP_RADIUS) return false;
    item.active = false;
    this.respawnAt.set(itemId, performance.now() + RESPAWN_MS);
    this.items.delete(itemId);
    this.score += SCORE_PER_ITEM;
    const hud = useHud.getState();
    hud.setScore(this.score);
    hud.setLeaderboard([{ id: 'solo', name: net.selfProfile?.name ?? 'Solo', color: '#22d3ee', score: this.score }]);
    audio.pickup(true);
    return true;
  }

  toggleCrystal(crystalId: string, playerPos: readonly [number, number, number]): void {
    const c = CRYSTALS.find((x) => x.id === crystalId);
    if (!c) return;
    const d = Math.hypot(playerPos[0] - c.p[0], playerPos[1] - c.p[1], playerPos[2] - c.p[2]);
    if (d > 3.2) return;
    if (this.crystals.has(crystalId)) this.crystals.delete(crystalId);
    else this.crystals.add(crystalId);
    net.crystals = this.crystals;
    if (this.crystals.size === CRYSTALS.length) {
      this.score += SCORE_RESONANCE;
      this.crystals.clear();
      net.crystals = this.crystals;
      useHud.getState().setScore(this.score);
      useHud.getState().toast('⚡ Resonance complete (+5)', 'good');
      net.fx.push({ type: 'resonance', p: [0, 4.5, 0], color: '#e879f9' });
      audio.resonance();
    }
  }

  get leaderboardScore(): number {
    return this.score;
  }
}

export const solo = new SoloSession();
