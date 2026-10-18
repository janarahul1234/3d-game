/**
 * NeonVerse game server bootstrap: Express health/API + Socket.IO realtime.
 * In production it can also serve the built client (single-process deploy).
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import cors from 'cors';
import { allowedOrigins, config, log } from './config';
import { RoomRegistry } from './rooms';
import { registerSocketHandlers } from './socketHandlers';

const app = express();
const registry = new RoomRegistry();

app.use(cors({ origin: allowedOrigins }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'neonverse-server',
    rooms: registry.size,
    players: registry.all().reduce((n, r) => n + r.playerCount, 0),
    uptimeSec: Math.round(process.uptime()),
  });
});

app.get('/api/rooms', (_req, res) => {
  // Deliberately minimal — codes are private; only aggregate stats are public.
  res.json({
    rooms: registry.size,
    players: registry.all().reduce((n, r) => n + r.playerCount, 0),
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
  serveClient: false,
  pingInterval: 10000,
  pingTimeout: 8000,
  connectionStateRecovery: {}, // graceful transient disconnects where supported
});

registerSocketHandlers(io, registry);

// Optional single-process production deploy: serve the built client if present.
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!socket\.io|health|api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  log(`serving client build from ${clientDist}`);
}

server.listen(config.PORT, () => {
  log(`NeonVerse server listening on :${config.PORT}`);
  log(`allowed origins: ${allowedOrigins.join(', ')}`);
  log(`tick ${config.TICK_RATE}Hz | max/room ${config.MAX_PLAYERS_PER_ROOM} | items ${config.ACTIVE_ITEMS} respawn ${config.ITEM_RESPAWN_MS}ms`);
});

const shutdown = () => {
  log('shutting down…');
  for (const room of registry.all()) {
    io.to(room.code).emit('nv:error', { ok: false, error: 'SERVER_SHUTDOWN' });
  }
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
