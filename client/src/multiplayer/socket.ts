/**
 * Socket.IO client singleton + typed emitters.
 *
 * The server URL comes from VITE_WS_URL (see .env.example). The connection
 * auto-reconnects; while disconnected the game keeps running locally and
 * rejoins the previous room automatically when the link returns.
 */

import { io, type Socket } from 'socket.io-client';
import { C2S, type PlayerProfile, type Ack } from '@shared/protocol';
import type { V3 } from '@shared/world';
import { useSession } from '../store/session';
import { attachGameEvents } from './gameEvents';
import { net, resetNet } from './netState';

const WS_URL: string = (import.meta.env.VITE_WS_URL as string | undefined) ?? 'http://localhost:3001';

let socket: Socket | null = null;
let connectFailures = 0;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): void {
  if (socket) return;
  const { setConn } = useSession.getState();
  setConn('connecting');

  socket = io(WS_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 900,
    reconnectionDelayMax: 6000,
    timeout: 7000,
  });

  socket.on('connect', () => {
    connectFailures = 0;
    useSession.getState().setConn('online');
    // Auto-rejoin the room we were in before a drop/reload.
    const s = useSession.getState();
    const profile = net.selfProfile;
    if (s.lastRoomCode && profile && (s.phase === 'lobby' || s.phase === 'game')) {
      void joinRoom(s.lastRoomCode, profile, /* silent */ true);
    }
  });

  socket.on('disconnect', (reason) => {
    if (reason !== 'io client disconnect') useSession.getState().setConn('reconnecting');
  });

  socket.on('connect_error', () => {
    connectFailures++;
    const s = useSession.getState();
    if (connectFailures >= 4 && !s.room) {
      s.setConn('offline');
    } else if (s.firstContact) {
      s.setConn('offline');
    } else {
      s.setConn('reconnecting');
    }
  });

  socket.io.on('reconnect', () => {
    useSession.getState().setConn('online');
  });

  attachGameEvents(socket);
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

async function emitWithAck<T>(event: string, payload: unknown): Promise<Ack<T>> {
  if (!socket || !socket.connected) {
    return { ok: false, error: 'NOT_CONNECTED' } as Ack<T>;
  }
  try {
    return (await socket.emitWithAck(event, payload)) as Ack<T>;
  } catch (err) {
    return { ok: false, error: `TIMEOUT:${String(err)}` } as Ack<T>;
  }
}

interface JoinData {
  code: string;
  playerId: string;
}

export async function createRoom(profile: PlayerProfile, maxPlayers?: number) {
  net.selfProfile = profile;
  const res = await emitWithAck<JoinData>(C2S.RoomCreate, { profile, maxPlayers });
  if (res.ok && res.data) {
    net.selfId = res.data.playerId;
    const { setSelf } = useSession.getState();
    setSelf(res.data.playerId, res.data.code);
  }
  return res;
}

export async function joinRoom(code: string, profile: PlayerProfile, silent = false) {
  net.selfProfile = profile;
  const res = await emitWithAck<JoinData>(C2S.RoomJoin, { code, profile });
  if (res.ok && res.data) {
    resetNet();
    net.selfId = res.data.playerId;
    net.selfProfile = profile;
    const { setSelf } = useSession.getState();
    setSelf(res.data.playerId, res.data.code);
  } else if (!silent && res.error) {
    useSession.getState().setError(res.error);
  }
  return res;
}

export function leaveRoom(): void {
  socket?.emit(C2S.RoomLeave);
  resetNet();
  const s = useSession.getState();
  s.leaveRoom();
}

export function setReady(ready: boolean): void {
  socket?.emit(C2S.LobbyReady, { ready });
}

export function startGame(): void {
  socket?.emit(C2S.GameStart);
}

/** Fire-and-forget 30 Hz movement update (kept compact: raw array). */
export function sendUpdate(p: V3, ry: number, mv: 0 | 1 | 2 | 3): void {
  socket?.emit(C2S.PlayerUpdate, { p, ry, mv });
}

export async function requestCollect(itemId: number): Promise<boolean> {
  const res = await emitWithAck<{ score: number }>(C2S.ItemCollect, { itemId });
  return res.ok === true;
}

export function sendChat(text: string): void {
  socket?.emit(C2S.ChatSend, { text });
}

export function sendEmote(emote: 'wave' | 'jump' | 'spin' | 'heart'): void {
  socket?.emit(C2S.EmotePlay, { emote });
}

export function sendInteract(crystalId: string): void {
  socket?.emit(C2S.Interact, { crystalId });
}

export function pingServer(t: number): void {
  socket?.emit(C2S.Ping, { t });
}
