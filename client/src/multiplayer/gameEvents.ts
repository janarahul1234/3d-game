/**
 * Binds Socket.IO server events to stores + hot netState + audio.
 * This module is the ONLY place that mutates net.* from the network.
 */

import type { Socket } from 'socket.io-client';
import {
  S2C,
  type ChatMessage,
  type CrystalsStatePayload,
  type EmoteId,
  type GameStartedPayload,
  type ItemState,
  type PlayersSyncPayload,
  type RoomSnapshot,
  type ScoreUpdatePayload,
} from '@shared/protocol';
import { useSession } from '../store/session';
import { useHud } from '../store/hud';
import { audio } from '../game/audio';
import { net, pushRemote, syncRoster } from './netState';
import { rememberCode } from '../store/session';

export function attachGameEvents(socket: Socket): void {
  const session = useSession.getState;
  const hud = useHud.getState;

  socket.on(S2C.RoomState, (room: RoomSnapshot) => {
    session().setRoom(room);
    net.profiles.clear();
    for (const p of room.players) {
      net.profiles.set(p.id, p.profile);
    }
    syncRoster(room.players.map((p) => p.id));
    if (room.phase === 'lobby' && session().phase === 'game') {
      // Host restarted a match cycle — return to lobby view.
      session().setPhase('lobby');
    }
  });

  socket.on(S2C.PlayerJoined, ({ id, profile }) => {
    net.profiles.set(id, profile);
    if (id !== net.selfId) {
      hud().toast(`${profile.name} joined`, 'info');
      audio.joinLeave();
    }
  });

  socket.on(S2C.PlayerLeft, ({ id, name }) => {
    net.profiles.delete(id);
    net.remotes.delete(id);
    net.emotes.delete(id);
    hud().toast(`${name} left`, 'info');
  });

  socket.on(S2C.GameStarted, (payload: GameStartedPayload) => {
    resetNetForMatch();
    net.local.p = [payload.spawn[0], payload.spawn[1], payload.spawn[2]];
    net.local.ry = Math.atan2(payload.spawn[0], payload.spawn[2]) + Math.PI;
    net.local.mv = 0;
    session().setPhase('loading');
    // Short delay lets the Canvas mount + Suspense resolve before the HUD.
    setTimeout(() => session().setPhase('game'), 400);
    rememberCode(payload.code);
    audio.ensure();
    audio.uiOpen();
  });

  socket.on(S2C.PlayersSync, (msg: PlayersSyncPayload) => {
    for (const [id, snap] of Object.entries(msg.states)) {
      if (id === net.selfId) {
        // Server-side correction watchdog: only hard-resync on large drift.
        const lp = net.local.p;
        const d = Math.hypot(lp[0] - snap.p[0], lp[1] - snap.p[1], lp[2] - snap.p[2]);
        if (d > 6) net.local.p = [snap.p[0], snap.p[1], snap.p[2]];
        continue;
      }
      pushRemote(id, snap, msg.ts);
    }
  });

  socket.on(S2C.PlayerRespawn, ({ id, p }) => {
    if (id === net.selfId) {
      net.local.p = [p[0], p[1], p[2]];
      net.fx.push({ type: 'respawn', p: [p[0], p[1] + 1, p[2]], color: '#22d3ee' });
      audio.respawn();
      hud().toast('You fell out of the NeonVerse — respawned', 'bad');
    } else {
      pushRemote(id, { p, ry: 0, mv: 0 }, Date.now());
    }
  });

  socket.on(S2C.ItemsState, ({ items }: { items: ItemState[] }) => {
    net.items.clear();
    for (const it of items) net.items.set(it.id, it);
  });

  socket.on(S2C.ItemCollected, ({ itemId, playerId }) => {
    const it = net.items.get(itemId);
    if (it) {
      net.fx.push({
        type: playerId === net.selfId ? 'pickup' : 'collectOther',
        p: [it.p[0], it.p[1], it.p[2]],
        color: playerId === net.selfId ? '#fbbf24' : '#8b5cf6',
      });
      net.items.delete(itemId);
    }
    audio.pickup(playerId === net.selfId);
  });

  socket.on(S2C.ItemRespawned, (item: ItemState) => {
    net.items.set(item.id, item);
    net.fx.push({ type: 'pickup', p: [item.p[0], item.p[1], item.p[2]], color: '#22d3ee' });
  });

  socket.on(S2C.ScoreUpdate, (msg: ScoreUpdatePayload) => {
    hud().setLeaderboard(msg.leaderboard);
    hud().setScore(msg.yours);
  });

  socket.on(S2C.CrystalsState, (msg: CrystalsStatePayload) => {
    net.crystals.clear();
    for (const id of msg.active) net.crystals.add(id);
  });

  socket.on(S2C.Resonance, ({ playerId, name }) => {
    hud().toast(`⚡ ${name} completed crystal resonance (+5)`, 'good');
    net.fx.push({ type: 'resonance', p: [0, 4.5, 0], color: '#e879f9' });
    audio.resonance();
    void playerId;
  });

  socket.on(S2C.ChatRecv, (msg: ChatMessage) => {
    hud().pushChat(msg);
    if (!msg.system) audio.message();
  });

  socket.on(S2C.EmoteRecv, ({ id, emote }: { id: string; emote: EmoteId }) => {
    net.emotes.set(id, { emote, at: performance.now() });
  });

  socket.on(S2C.Pong, ({ t }: { t: number }) => {
    const rtt = Date.now() - t;
    session().setLatency(Math.max(1, Math.round(rtt / 2)));
  });

  socket.on(S2C.ServerError, (err: { error?: string }) => {
    hud().toast(serverErrorText(err.error), 'bad');
  });
}

function resetNetForMatch(): void {
  net.remotes.clear();
  net.items.clear();
  net.crystals.clear();
  net.emotes.clear();
  net.fx.length = 0;
  const hud = useHud.getState();
  hud.setScore(0);
  hud.clearChat();
}

export function serverErrorText(code?: string): string {
  switch (code) {
    case 'ROOM_NOT_FOUND':
      return 'Room not found — check the code';
    case 'ROOM_FULL':
      return 'That room is full';
    case 'INVALID_PROFILE':
      return 'Invalid name or colors';
    case 'ALREADY_COLLECTED':
      return 'Already collected!';
    case 'SERVER_SHUTDOWN':
      return 'Server is shutting down…';
    default:
      return 'Something went wrong';
  }
}
