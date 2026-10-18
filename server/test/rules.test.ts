import { describe, expect, it } from 'vitest';
import { GameRoom } from '../src/gameState';
import { createPlayerRecord, profileSchema } from '../src/playerManager';
import { generateRoomCode, normalizeCode, RoomRegistry } from '../src/rooms';
import { validateMovement, withinRadius } from '../src/collision';
import { CRYSTALS, ITEM_SPAWNS, PHYS, SCORE_PER_ITEM, SCORE_RESONANCE } from '../../shared/src/world';

const opts = { maxPlayers: 4, itemRespawnMs: 10000, activeItems: 6 };

function makeRoom(n = 2) {
  const host = createPlayerRecord('sock-host', { name: 'Host', color: '#22d3ee', accent: '#ffffff', body: 0 });
  const room = new GameRoom('ABCDE', host.id, opts);
  room.addPlayer(host);
  const players = [host];
  for (let i = 1; i < n; i++) {
    const p = createPlayerRecord(`sock-${i}`, { name: `P${i}`, color: '#e879f9', accent: '#ffffff', body: 1 });
    room.addPlayer(p);
    players.push(p);
  }
  room.startGame(1000);
  return { room, players, host };
}

describe('room codes & registry', () => {
  it('generates codes from the unambiguous alphabet at the right length', () => {
    for (let k = 0; k < 30; k++) {
      const code = generateRoomCode(() => false)!;
      expect(code).toHaveLength(5);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it('normalizes user input (lowercase, dashes, spaces)', () => {
    expect(normalizeCode(' a-b c1 ')).toBe('ABC1');
  });

  it('rejects joining unknown rooms and full rooms', () => {
    const registry = new RoomRegistry();
    expect(registry.get('ZZZZZ')).toBeUndefined();
    const room = registry.create('host-1', 2)!;
    expect(room.maxPlayers).toBe(2);
    const a = createPlayerRecord('a', { name: 'A', color: '#22d3ee', accent: '#fff', body: 0 });
    const b = createPlayerRecord('b', { name: 'B', color: '#22d3ee', accent: '#fff', body: 0 });
    const c = createPlayerRecord('c', { name: 'C', color: '#22d3ee', accent: '#fff', body: 0 });
    expect(room.addPlayer(a)).toBe(true);
    expect(room.addPlayer(b)).toBe(true);
    expect(room.isFull).toBe(true);
    expect(room.addPlayer(c)).toBe(false);
  });

  it('reassigns host when the current host disconnects', () => {
    const { room, players, host } = makeRoom(3);
    room.removePlayer(host.id);
    expect(room.hostId).toBe(players[1].id);
    room.removePlayer(players[1].id);
    expect(room.hostId).toBe(players[2].id);
  });
});

describe('profile validation', () => {
  it('trims names and rejects empty or HTML-heavy ones', () => {
    expect(profileSchema.safeParse({ name: '  Neo  ', color: '#22d3ee', accent: '#e879f9', body: 0 }).success).toBe(true);
    expect(profileSchema.safeParse({ name: '   ', color: '#22d3ee', accent: '#e879f9', body: 0 }).success).toBe(false);
    const parsed = profileSchema.parse({ name: '<script>alert(1)</script>', color: '#22d3ee', accent: '#e879f9', body: 1 });
    expect(parsed.name).not.toContain('<');
    expect(parsed.name.length).toBeLessThanOrEqual(16);
    expect(profileSchema.safeParse({ name: 'Neo', color: 'red', accent: '#e879f9', body: 0 }).success).toBe(false);
    expect(profileSchema.safeParse({ name: 'Neo', color: '#22d3ee', accent: '#e879f9', body: 9 }).success).toBe(false);
  });
});

describe('movement validation (server authority)', () => {
  it('accepts plausible movement', () => {
    const res = validateMovement([0, 1, 0], 0, { p: [0.2, 1, 0], ry: 0, mv: 1 }, 100);
    expect(res.corrected).toBe(false);
  });

  it('clamps impossible teleports instead of trusting the client', () => {
    const res = validateMovement([0, 1, 0], 0, { p: [80, 1, 0], ry: 0, mv: 2 }, 100);
    expect(res.corrected).toBe(true);
    const moved = Math.hypot(res.p[0], res.p[2]);
    expect(moved).toBeLessThan(3); // 0.1 s at most ~15 m/s + slack
  });

  it('clamps positions outside the play area', () => {
    const res = validateMovement([30, 1, 0], 0, { p: [3000, 1, 0], ry: 0, mv: 2 }, 500);
    expect(Math.abs(res.p[0])).toBeLessThanOrEqual(PHYS.BOUND_XZ);
  });

  it('flags falling below the world', () => {
    const res = validateMovement([0, -10, 0], 0, { p: [0, -17, 0], ry: 0, mv: 3 }, 400);
    expect(res.fell).toBe(false);
    const dead = validateMovement([0, -17, 0], 400, { p: [0, -19, 0], ry: 0, mv: 3 }, 600);
    expect(dead.fell).toBe(true);
  });

  it('rejects non-finite coordinates', () => {
    const res = validateMovement([1, 1, 1], 0, { p: [NaN, 1, 1], ry: 0, mv: 0 }, 50);
    expect(res.corrected).toBe(true);
    expect(Number.isFinite(res.p[0])).toBe(true);
  });

  it('GameRoom.applyMovement respawns players who fell', () => {
    const { room, players } = makeRoom(1);
    const me = players[0];
    me.pos = [0, -17, 0];
    me.lastUpdateAt = 1000;
    const res = room.applyMovement(me.id, { p: [0, -19, 0], ry: 0, mv: 3 }, 1200);
    expect(res.fell).toBe(true);
    expect(res.respawn).toBeDefined();
    expect(me.pos[1]).toBeGreaterThan(-5);
  });
});

describe('collectibles & scoring', () => {
  it('only awards a collectible once per spawn', () => {
    const { room, players } = makeRoom(1);
    const me = players[0];
    const item = room.items[0];
    me.pos = [item.p[0], item.p[1] - 0.5, item.p[2]];
    const first = room.tryCollect(me.id, item.id, 1500);
    expect(first.ok).toBe(true);
    const second = room.tryCollect(me.id, item.id, 1600);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('ALREADY_COLLECTED');
    expect(me.score).toBe(SCORE_PER_ITEM);
  });

  it('rejects collection claims that are too far (no free score)', () => {
    const { room, players } = makeRoom(1);
    const me = players[0];
    const item = room.items[0];
    me.pos = [0, 1, 0];
    // Ensure the claimed item is actually far from the player.
    if (withinRadius(me.pos, item.p, PHYS.PICKUP_RADIUS)) {
      me.pos = [item.p[0] + 40, 1, item.p[2] + 40];
      // re-verify the fixture itself is valid
      expect(withinRadius(me.pos, item.p, PHYS.PICKUP_RADIUS)).toBe(false);
    }
    const res = room.tryCollect(me.id, item.id, 1500);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('TOO_FAR');
    expect(me.score).toBe(0);
  });

  it('clients cannot claim items that do not exist', () => {
    const { room, players } = makeRoom(1);
    const res = room.tryCollect(players[0].id, 999, 1500);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('NOT_FOUND');
  });

  it('respawns collected items at a spawn location after the delay', () => {
    const { room, players } = makeRoom(1);
    const me = players[0];
    const item = room.items[0];
    me.pos = [item.p[0], item.p[1] - 0.5, item.p[2]];
    room.tryCollect(me.id, item.id, 1500);
    // Before delay: still inactive.
    expect(room.tickItems(1500 + opts.itemRespawnMs - 500)).toHaveLength(0);
    const respawned = room.tickItems(1500 + opts.itemRespawnMs + 100);
    expect(respawned).toHaveLength(1);
    const isSpawnPoint = ITEM_SPAWNS.some((p) => Math.hypot(p[0] - respawned[0].p[0], p[1] - respawned[0].p[1], p[2] - respawned[0].p[2]) < 0.001);
    expect(isSpawnPoint).toBe(true);
    // And collectible again → awards a second point (per-spawn dedupe holds).
    me.pos = [respawned[0].p[0], respawned[0].p[1] - 0.5, respawned[0].p[2]];
    const again = room.tryCollect(me.id, respawned[0].id, 4000);
    expect(again.ok).toBe(true);
    expect(me.score).toBe(SCORE_PER_ITEM * 2);
  });

  it('does not award collection during lobby phase', () => {
    const host = createPlayerRecord('h', { name: 'H', color: '#22d3ee', accent: '#fff', body: 0 });
    const room = new GameRoom('LOBBY', host.id, opts);
    room.addPlayer(host);
    const res = room.tryCollect(host.id, 0, 1000);
    expect(res.ok).toBe(false);
  });

  it('leaderboard ranks players by server-side score', () => {
    const { room, players } = makeRoom(2);
    for (const itemIdx of [0, 1]) {
      const item = room.items[itemIdx];
      players[1].pos = [item.p[0], item.p[1] - 0.5, item.p[2]];
      room.tryCollect(players[1].id, item.id, 1500 + itemIdx * 50);
    }
    const lb = room.leaderboard();
    expect(lb[0].id).toBe(players[1].id);
    expect(lb[0].score).toBe(2);
    expect(lb[1].score).toBe(0);
  });
});

describe('crystals & resonance', () => {
  it('requires proximity and completes resonance exactly once', () => {
    const { room, players } = makeRoom(1);
    const me = players[0];
    // Far away → rejected.
    me.pos = [30, 1, 30];
    expect(room.toggleCrystal(me.id, CRYSTALS[0].id).ok).toBe(false);
    // Walk the player to each crystal in turn.
    me.pos = [...CRYSTALS[0].p] as typeof me.pos;
    for (const c of CRYSTALS) {
      me.pos = [c.p[0], c.p[1] - 1.5, c.p[2]];
      const res = room.toggleCrystal(me.id, c.id);
      expect(res.ok).toBe(true);
      if (c.id !== 'core') {
        expect(res.resonance).toBeUndefined();
      } else {
        expect(res.resonance?.playerId).toBe(me.id);
      }
    }
    expect(me.score).toBe(SCORE_RESONANCE);
    expect(room.crystalsActive.size).toBe(0); // reset after resonance
  });
});

describe('chat rate limiting', () => {
  it('token bucket allows bursts then throttles and refills', () => {
    const { room, players } = makeRoom(1);
    const me = players[0];
    for (let i = 0; i < 4; i++) {
      expect(room.allowChat(me.id, 1000 + i * 30)).toBe(true);
    }
    expect(room.allowChat(me.id, 1130)).toBe(false); // bucket empty
    expect(room.allowChat(me.id, 1130 + 2600)).toBe(true); // refilled one token
  });

  it('emotes have a cooldown', () => {
    const { room, players } = makeRoom(1);
    const me = players[0];
    expect(room.allowEmote(me.id, 1000)).toBe(true);
    expect(room.allowEmote(me.id, 1500)).toBe(false);
    expect(room.allowEmote(me.id, 2000)).toBe(true);
  });
});

describe('snapshot broadcasting', () => {
  it('excludes disconnected players and includes current positions', () => {
    const { room, players } = makeRoom(2);
    players[0].pos = [1, 2, 3];
    const states = room.states();
    expect(Object.keys(states).length).toBe(2);
    expect(states[players[0].id].p).toEqual([1, 2, 3]);
    room.removePlayer(players[1].id);
    expect(Object.keys(room.states()).length).toBe(1);
  });
});
