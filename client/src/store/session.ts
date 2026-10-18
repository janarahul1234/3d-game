/**
 * Session store: connection + room/phase state (low frequency, UI-facing).
 */

import { create } from 'zustand';
import type { PlayerProfile, RoomSnapshot } from '@shared/protocol';

export type Phase = 'menu' | 'lobby' | 'loading' | 'game';
export type ConnState = 'connecting' | 'online' | 'reconnecting' | 'offline' | 'solo';

export const DEFAULT_PROFILE: PlayerProfile = {
  name: 'Guest',
  color: '#22d3ee',
  accent: '#e879f9',
  body: 0,
};

export function loadProfile(): PlayerProfile | null {
  try {
    const raw = localStorage.getItem('neonverse-profile');
    if (!raw) return null;
    const p = JSON.parse(raw) as PlayerProfile;
    if (typeof p.name !== 'string' || !p.name) return null;
    return { name: p.name.slice(0, 16), color: p.color ?? DEFAULT_PROFILE.color, accent: p.accent ?? DEFAULT_PROFILE.accent, body: p.body ?? 0 };
  } catch {
    return null;
  }
}

export function saveProfile(p: PlayerProfile): void {
  localStorage.setItem('neonverse-profile', JSON.stringify(p));
}

interface SessionState {
  phase: Phase;
  conn: ConnState;
  room: RoomSnapshot | null;
  selfId: string;
  latencyMs: number;
  /** True while the initial connect attempt is still pending. */
  firstContact: boolean;
  lastRoomCode: string;
  error: string | null;
  setPhase: (p: Phase) => void;
  setConn: (c: ConnState) => void;
  setRoom: (r: RoomSnapshot | null) => void;
  setSelf: (id: string, code: string) => void;
  setLatency: (ms: number) => void;
  setError: (e: string | null) => void;
  leaveRoom: () => void;
}

export const useSession = create<SessionState>((set) => ({
  phase: 'menu',
  conn: 'connecting',
  room: null,
  selfId: '',
  latencyMs: 0,
  firstContact: true,
  lastRoomCode: '',
  error: null,
  setPhase: (phase) => set({ phase }),
  setConn: (conn) => set({ conn, firstContact: false }),
  setRoom: (room) => set({ room }),
  setSelf: (selfId, lastRoomCode) => set({ selfId, lastRoomCode }),
  setLatency: (latencyMs) => set({ latencyMs }),
  setError: (error) => set({ error }),
  leaveRoom: () => set({ room: null, selfId: '', lastRoomCode: '', phase: 'menu' }),
}));

/** Last used room code, kept across page reloads for reconnects. */

export function rememberCode(code: string): void {
  localStorage.setItem('neonverse-lastcode', code);
}

export function recallCode(): string {
  return localStorage.getItem('neonverse-lastcode') ?? '';
}
