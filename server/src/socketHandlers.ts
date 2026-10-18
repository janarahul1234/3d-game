/**
 * Socket.IO wiring: translates wire events into GameRoom rule calls and
 * broadcasts. All client payloads are Zod-validated; all scores/positions
 * stored here are the authoritative ones.
 */

import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import {
  C2S,
  MAX_CHAT_LENGTH,
  S2C,
  type Ack,
  type ChatMessage,
  type MoveState,
  type PlayerProfile,
  type RoomSnapshot,
} from '../../shared/src/protocol';
import { CRYSTALS } from '../../shared/src/world';
import { config, log, logErr } from './config';
import type { GameRoom } from './gameState';
import { createPlayerRecord, profileSchema, type PlayerRecord } from './playerManager';
import { RoomRegistry, normalizeCode } from './rooms';

/* ------------------------- wire schemas --------------------------- */

const v3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const createSchema = z.object({
  profile: profileSchema,
  maxPlayers: z.number().int().min(2).max(40).optional(),
});

const joinSchema = z.object({
  code: z.string().min(3).max(8),
  profile: profileSchema,
});

const updateSchema = z.object({
  p: v3,
  ry: z.number().finite().min(-Math.PI * 4).max(Math.PI * 4),
  mv: z.number().int().min(0).max(3).transform((n) => n as MoveState),
});

const collectSchema = z.object({ itemId: z.number().int().min(0).max(64) });
const readySchema = z.object({ ready: z.boolean() });
const chatSchema = z.object({ text: z.string().min(1).max(MAX_CHAT_LENGTH + 20) });
const emoteSchema = z.object({ emote: z.enum(['wave', 'jump', 'spin', 'heart']) });
const interactSchema = z.object({ crystalId: z.string().min(1).max(12) });
const pingSchema = z.object({ t: z.number().finite() });

/** Chat text is sanitized server-side; clients must still render it as text. */
function sanitizeChat(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/[<>]/g, '')
    .trim()
    .replace(/\s{3,}/g, '  ')
    .slice(0, MAX_CHAT_LENGTH);
}

type AckCb = (res: Ack<unknown>) => void;

interface RoomRuntime {
  room: GameRoom;
  timer: NodeJS.Timeout;
  lastRoomStateVersion: number;
}

export function registerSocketHandlers(io: Server, registry: RoomRegistry): void {
  const runtimes = new Map<string, RoomRuntime>();

  const socketPlayer = (s: Socket): { room: GameRoom; rec: PlayerRecord } | null => {
    const code = s.data.roomCode as string | undefined;
    const pid = s.data.playerId as string | undefined;
    if (!code || !pid) return null;
    const rt = runtimes.get(code);
    if (!rt) return null;
    const rec = rt.room.players.get(pid);
    if (!rec) return null;
    return { room: rt.room, rec };
  };

  const sendRoomState = (room: GameRoom) => {
    io.to(room.code).emit(S2C.RoomState, room.publicState());
  };

  const sendScoreUpdate = (room: GameRoom) => {
    const lb = room.leaderboard();
    for (const p of room.players.values()) {
      io.to(p.socketId).emit(S2C.ScoreUpdate, { leaderboard: lb, yours: p.score });
    }
  };

  const sendSystemChat = (room: GameRoom, text: string) => {
    const msg: ChatMessage = { id: 'system', name: 'system', color: '#8b5cf6', text, ts: Date.now(), system: true };
    io.to(room.code).emit(S2C.ChatRecv, msg);
  };

  const ensureRuntime = (room: GameRoom) => {
    if (runtimes.has(room.code)) return;
    const interval = Math.round(1000 / config.TICK_RATE);
    const timer = setInterval(() => {
      const now = Date.now();
      io.to(room.code).emit(S2C.PlayersSync, { ts: now, states: room.states() });
      const respawned = room.tickItems(now);
      for (const item of respawned) io.to(room.code).emit(S2C.ItemRespawned, item);
      if (room.version !== (runtimes.get(room.code)?.lastRoomStateVersion ?? -1)) {
        sendRoomState(room);
        const rt = runtimes.get(room.code);
        if (rt) rt.lastRoomStateVersion = room.version;
      }
    }, interval);
    runtimes.set(room.code, { room, timer, lastRoomStateVersion: -1 });
  };

  const teardownIfEmpty = (room: GameRoom) => {
    if (room.players.size > 0) return;
    const rt = runtimes.get(room.code);
    if (rt) {
      clearInterval(rt.timer);
      runtimes.delete(room.code);
    }
    registry.remove(room.code);
    log(`room ${room.code} closed (empty)`);
  };

  const leaveCurrentRoom = (s: Socket) => {
    const ctx = socketPlayer(s);
    if (!ctx) {
      s.data.roomCode = undefined;
      s.data.playerId = undefined;
      return;
    }
    const { room, rec } = ctx;
    room.removePlayer(rec.id);
    s.leave(room.code);
    s.data.roomCode = undefined;
    s.data.playerId = undefined;
    io.to(room.code).emit(S2C.PlayerLeft, { id: rec.id, name: rec.profile.name });
    sendRoomState(room);
    sendScoreUpdate(room); // drop the leaver from leaderboards
    sendSystemChat(room, `${rec.profile.name} left the arena`);
    teardownIfEmpty(room);
  };

  /** Shared entry for create + join once a record exists. */
  const enterRoom = (s: Socket, room: GameRoom, rec: PlayerRecord, ack: AckCb) => {
    s.join(room.code);
    s.data.roomCode = room.code;
    s.data.playerId = rec.id;
    ensureRuntime(room);

    const snapshot: RoomSnapshot = room.publicState();
    ack({ ok: true, data: { code: room.code, playerId: rec.id, snapshot } });

    io.to(room.code).emit(S2C.PlayerJoined, {
      id: rec.id,
      profile: rec.profile,
    });
    sendRoomState(room);
    sendSystemChat(room, `${rec.profile.name} joined the arena`);

    if (room.phase === 'playing') {
      // Late joiner drops straight into the round.
      io.to(s.id).emit(S2C.GameStarted, { spawn: rec.pos, code: room.code });
      io.to(s.id).emit(S2C.ItemsState, { items: room.items.filter((i) => i.active) });
      io.to(s.id).emit(S2C.CrystalsState, { active: [...room.crystalsActive] });
      sendScoreUpdate(room);
    }
  };

  io.on('connection', (s: Socket) => {
    log(`socket connected: ${s.id}`);

    s.on(C2S.RoomCreate, (payload: unknown, cb?: AckCb) => {
      const ack = cb ?? (() => {});
      const parsed = createSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'INVALID_PROFILE' });
      leaveCurrentRoom(s);
      const profile = parsed.data.profile as PlayerProfile;
      const rec = createPlayerRecord(s.id, profile);
      const room = registry.create(rec.id, parsed.data.maxPlayers);
      if (!room) return ack({ ok: false, error: 'ROOM_CREATION_FAILED' });
      room.addPlayer(rec);
      log(`room ${room.code} created by "${profile.name}" (${room.maxPlayers} slots)`);
      enterRoom(s, room, rec, ack);
    });

    s.on(C2S.RoomJoin, (payload: unknown, cb?: AckCb) => {
      const ack = cb ?? (() => {});
      const parsed = joinSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: 'INVALID_INPUT' });
      const room = registry.get(parsed.data.code);
      if (!room) return ack({ ok: false, error: 'ROOM_NOT_FOUND' });
      if (room.isFull) return ack({ ok: false, error: 'ROOM_FULL' });
      leaveCurrentRoom(s);
      const profile = parsed.data.profile as PlayerProfile;
      const rec = createPlayerRecord(s.id, profile);
      if (!room.addPlayer(rec)) return ack({ ok: false, error: 'ROOM_FULL' });
      log(`"${profile.name}" joined room ${room.code} (${room.players.size}/${room.maxPlayers})`);
      enterRoom(s, room, rec, ack);
    });

    s.on(C2S.RoomLeave, () => leaveCurrentRoom(s));

    s.on(C2S.LobbyReady, (payload: unknown) => {
      const ctx = socketPlayer(s);
      const parsed = readySchema.safeParse(payload);
      if (!ctx || !parsed.success) return;
      ctx.room.setReady(ctx.rec.id, parsed.data.ready);
    });

    s.on(C2S.GameStart, () => {
      const ctx = socketPlayer(s);
      if (!ctx) return;
      const { room } = ctx;
      if (room.hostId !== ctx.rec.id) return;
      if (room.phase !== 'lobby') return;
      const spawns = room.startGame(Date.now());
      for (const p of room.players.values()) {
        io.to(p.socketId).emit(S2C.GameStarted, { spawn: spawns[p.id], code: room.code });
        io.to(p.socketId).emit(S2C.ItemsState, { items: room.items.filter((i) => i.active) });
      }
      io.to(room.code).emit(S2C.CrystalsState, { active: [...room.crystalsActive] });
      sendScoreUpdate(room);
      sendRoomState(room);
      sendSystemChat(room, 'Match started — collect energy orbs!');
      log(`room ${room.code}: match started with ${room.players.size} players`);
    });

    s.on(C2S.PlayerUpdate, (payload: unknown) => {
      const ctx = socketPlayer(s);
      const parsed = updateSchema.safeParse(payload);
      if (!ctx || !parsed.success) return;
      const { room, rec } = ctx;
      const res = room.applyMovement(rec.id, parsed.data, Date.now());
      if (res.fell && res.respawn) {
        io.to(room.code).emit(S2C.PlayerRespawn, { id: rec.id, p: res.respawn });
        log(`player ${rec.profile.name} fell out of the world — respawned`);
      }
    });

    s.on(C2S.ItemCollect, (payload: unknown, cb?: AckCb) => {
      const ack = cb ?? (() => {});
      const ctx = socketPlayer(s);
      const parsed = collectSchema.safeParse(payload);
      if (!ctx || !parsed.success) return ack({ ok: false, error: 'INVALID' });
      const { room, rec } = ctx;
      const res = room.tryCollect(rec.id, parsed.data.itemId, Date.now());
      if (!res.ok) return ack({ ok: false, error: res.reason });
      io.to(room.code).emit(S2C.ItemCollected, { itemId: res.itemId, playerId: res.playerId });
      sendScoreUpdate(room);
      ack({ ok: true, data: { score: res.score } });
    });

    s.on(C2S.ChatSend, (payload: unknown) => {
      const ctx = socketPlayer(s);
      const parsed = chatSchema.safeParse(payload);
      if (!ctx || !parsed.success) return;
      const { room, rec } = ctx;
      if (!room.allowChat(rec.id, Date.now())) return; // silently drop floods
      const text = sanitizeChat(parsed.data.text);
      if (!text) return;
      const msg: ChatMessage = {
        id: rec.id,
        name: rec.profile.name,
        color: rec.profile.color,
        text,
        ts: Date.now(),
      };
      io.to(room.code).emit(S2C.ChatRecv, msg);
    });

    s.on(C2S.EmotePlay, (payload: unknown) => {
      const ctx = socketPlayer(s);
      const parsed = emoteSchema.safeParse(payload);
      if (!ctx || !parsed.success) return;
      if (!ctx.room.allowEmote(ctx.rec.id, Date.now())) return;
      ctx.room && io.to(ctx.room.code).emit(S2C.EmoteRecv, { id: ctx.rec.id, emote: parsed.data.emote });
    });

    s.on(C2S.Interact, (payload: unknown) => {
      const ctx = socketPlayer(s);
      const parsed = interactSchema.safeParse(payload);
      if (!ctx || !parsed.success) return;
      if (!CRYSTALS.some((c) => c.id === parsed.data.crystalId)) return;
      const { room, rec } = ctx;
      const res = room.toggleCrystal(rec.id, parsed.data.crystalId);
      if (!res.ok) return;
      io.to(room.code).emit(S2C.CrystalsState, { active: [...room.crystalsActive] });
      if (res.resonance) {
        io.to(room.code).emit(S2C.Resonance, { playerId: res.resonance.playerId, name: rec.profile.name });
        sendScoreUpdate(room);
        sendSystemChat(room, `${rec.profile.name} completed crystal resonance (+5)`);
        log(`room ${room.code}: resonance by ${rec.profile.name}`);
      }
    });

    s.on(C2S.Ping, (payload: unknown) => {
      const parsed = pingSchema.safeParse(payload);
      if (!parsed.success) return;
      io.to(s.id).emit(S2C.Pong, { t: parsed.data.t });
    });

    s.on('disconnect', (reason: string) => {
      leaveCurrentRoom(s);
      log(`socket disconnected: ${s.id} (${reason})`);
    });

    s.on('error', (err: unknown) => logErr('socket error', s.id, err));
  });
}
