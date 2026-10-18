/**
 * Tracks players bound to socket connections.
 * Guest players need no auth — each connection gets a unique temporary id.
 */

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { MAX_NAME_LENGTH, type MoveState, type PlayerProfile } from '../../shared/src/protocol';
import type { V3 } from '../../shared/src/world';
import { SPAWN_POINTS } from '../../shared/src/world';

/** Zod schema for client-supplied profiles (validated server-side). */
export const profileSchema = z.object({
  name: z
    .string()
    .transform((s) => s.replace(/[\u0000-\u001f<>]/g, '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH))
    .refine((s) => s.length >= 1, 'Name must not be empty'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid accent color'),
  body: z.number().int().min(0).max(2),
});

export type PlayerProfileInput = z.infer<typeof profileSchema>;

export interface PlayerRecord {
  /** Temporary unique id, valid for this connection only. */
  id: string;
  socketId: string;
  profile: PlayerProfile;
  score: number;
  ready: boolean;
  /** Server-authoritative position (validated client claim). */
  pos: V3;
  ry: number;
  mv: MoveState;
  /** Wall-clock ms of the last accepted movement update. */
  lastUpdateAt: number;
  /** Counter of rejected/corrected movement claims (debug + abuse signal). */
  corrections: number;
}

export function makePlayerId(): string {
  return 'p_' + randomBytes(6).toString('base64url');
}

export function createPlayerRecord(socketId: string, profile: PlayerProfile): PlayerRecord {
  const spawn = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
  return {
    id: makePlayerId(),
    socketId,
    profile,
    score: 0,
    ready: false,
    pos: [spawn[0], spawn[1], spawn[2]],
    ry: Math.atan2(spawn[0], spawn[2]) + Math.PI, // face the center
    mv: 0,
    lastUpdateAt: Date.now(),
    corrections: 0,
  };
}
