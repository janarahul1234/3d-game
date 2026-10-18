/** Runtime configuration, validated from environment variables. */
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(2).max(40).default(12),
  TICK_RATE: z.coerce.number().int().min(5).max(30).default(15),
  ITEM_RESPAWN_MS: z.coerce.number().int().min(2000).max(120000).default(12000),
  ACTIVE_ITEMS: z.coerce.number().int().min(3).max(20).default(10),
});

function loadConfig() {
  // Minimal .env loader (avoids an extra dependency): KEY=VALUE lines only.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const file = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(file)) {
      for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
      }
    }
  } catch {
    /* env file is optional */
  }
  return envSchema.parse(process.env);
}

export const config = loadConfig();

/** Allowed browser origins for CORS + Socket.IO handshake. */
export const allowedOrigins = config.CLIENT_ORIGIN.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function log(...args: unknown[]): void {
  console.log(`[nv ${new Date().toISOString().slice(11, 19)}]`, ...args);
}

export function logErr(...args: unknown[]): void {
  console.error(`[nv ${new Date().toISOString().slice(11, 19)}] ⚠`, ...args);
}
