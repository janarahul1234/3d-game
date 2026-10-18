/**
 * NeonVerse shared network protocol contracts.
 * Types here define the exact wire format between client and server.
 * The server validates every client payload with Zod using matching schemas.
 */

import type { V3 } from './world';

/* ------------------------------------------------------------------ */
/* Entity types                                                        */
/* ------------------------------------------------------------------ */

export interface PlayerProfile {
  name: string;
  /** Hex color of the body, e.g. "#22d3ee". */
  color: string;
  /** Hex accent color (visor / trim). */
  accent: string;
  /** Body preset index 0..2 (classic / blocky / slim). */
  body: number;
}

/** 0 idle, 1 walk, 2 sprint, 3 airborne */
export type MoveState = 0 | 1 | 2 | 3;

export interface PlayerSnapshot {
  p: V3;
  /** Yaw rotation in radians. */
  ry: number;
  mv: MoveState;
}

export interface PublicPlayer {
  id: string;
  profile: PlayerProfile;
  score: number;
  ready: boolean;
}

export type RoomPhase = 'lobby' | 'playing';

export interface RoomSnapshot {
  code: string;
  phase: RoomPhase;
  hostId: string;
  maxPlayers: number;
  players: PublicPlayer[];
}

export interface ItemState {
  id: number;
  p: V3;
  active: boolean;
}

export interface LeaderRow {
  id: string;
  name: string;
  color: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  name: string;
  color: string;
  text: string;
  ts: number;
  /** System messages (join/leave/bonus) are rendered differently. */
  system?: boolean;
}

export type EmoteId = 'wave' | 'jump' | 'spin' | 'heart';

/* ------------------------------------------------------------------ */
/* Event names                                                         */
/* ------------------------------------------------------------------ */

export const C2S = {
  RoomCreate: 'nv:room:create',
  RoomJoin: 'nv:room:join',
  RoomLeave: 'nv:room:leave',
  LobbyReady: 'nv:lobby:ready',
  GameStart: 'nv:game:start',
  PlayerUpdate: 'nv:player:update',
  ItemCollect: 'nv:item:collect',
  ChatSend: 'nv:chat:send',
  EmotePlay: 'nv:emote:play',
  Interact: 'nv:interact',
  Ping: 'nv:ping',
} as const;

export const S2C = {
  RoomState: 'nv:room:state',
  GameStarted: 'nv:game:started',
  PlayersSync: 'nv:players:sync',
  PlayerJoined: 'nv:player:joined',
  PlayerLeft: 'nv:player:left',
  PlayerRespawn: 'nv:player:respawn',
  ScoreUpdate: 'nv:score:update',
  ItemsState: 'nv:items:state',
  ItemCollected: 'nv:item:collected',
  ItemRespawned: 'nv:item:respawned',
  ChatRecv: 'nv:chat:recv',
  EmoteRecv: 'nv:emote:recv',
  CrystalsState: 'nv:crystals:state',
  Resonance: 'nv:resonance',
  ServerError: 'nv:error',
  Pong: 'nv:pong',
} as const;

/* ------------------------------------------------------------------ */
/* Payload shapes                                                      */
/* ------------------------------------------------------------------ */

export interface RoomCreatePayload {
  profile: PlayerProfile;
}

export interface RoomJoinPayload {
  code: string;
  profile: PlayerProfile;
}

export interface Ack<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Sent ~30 Hz by each client; server validates then relays via snapshots. */
export interface PlayerUpdatePayload {
  p: V3;
  ry: number;
  mv: MoveState;
}

export interface PlayersSyncPayload {
  /** Server monotonic time in ms when the snapshot was emitted. */
  ts: number;
  states: Record<string, PlayerSnapshot>;
}

export interface ScoreUpdatePayload {
  leaderboard: LeaderRow[];
  /** playerId -> score (full map so HUD can show own score even when unranked) */
  yours: number;
}

export interface ItemCollectedPayload {
  itemId: number;
  playerId: string;
}

export interface GameStartedPayload {
  /** This player's authoritative spawn position. */
  spawn: V3;
  code: string;
}

export interface CrystalsStatePayload {
  active: string[];
}

export interface InteractResultPayload {
  crystalId: string;
  active: boolean;
  /** Set when the interaction triggered full resonance. */
  playerId?: string;
}

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 120;
