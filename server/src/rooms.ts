/**
 * Room registry: unique short-code room creation, lookup and teardown.
 */

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../shared/src/protocol';
import { GameRoom, type RoomOptions } from './gameState';
import { config } from './config';

const CODE_MAX_ATTEMPTS = 12;

/** Normalize user input to a comparable room code. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export function generateRoomCode(isTaken: (code: string) => boolean): string | null {
  for (let attempt = 0; attempt < CODE_MAX_ATTEMPTS; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  return null;
}

export class RoomRegistry {
  private rooms = new Map<string, GameRoom>();

  create(hostId: string, requestedMax?: number): GameRoom | null {
    const code = generateRoomCode((c) => this.rooms.has(c));
    if (!code) return null;
    const opts: RoomOptions = {
      maxPlayers: Math.min(requestedMax ?? config.MAX_PLAYERS_PER_ROOM, config.MAX_PLAYERS_PER_ROOM, 40),
      itemRespawnMs: config.ITEM_RESPAWN_MS,
      activeItems: config.ACTIVE_ITEMS,
    };
    const room = new GameRoom(code, hostId, opts);
    this.rooms.set(code, room);
    return room;
  }

  get(rawCode: string): GameRoom | undefined {
    return this.rooms.get(normalizeCode(rawCode));
  }

  remove(code: string): void {
    this.rooms.delete(code);
  }

  get size(): number {
    return this.rooms.size;
  }

  all(): GameRoom[] {
    return [...this.rooms.values()];
  }
}
