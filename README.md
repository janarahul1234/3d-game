# ⚡ NeonVerse — Online 3D Multiplayer Browser Arena

A fully playable **real-time 3D multiplayer game** that runs in the browser. Explore a neon arena, run, jump, sprint off boost pads, collect energy orbs, attune crystals, chat, emote — and see **real connected players** moving around you in the same world.

No accounts, no downloads: enter as a guest, share a room code, play.

---

## 1. Quick Start (Development)

Requires **Node.js ≥ 20** (tested on Node 24) and npm.

```bash
# from the repository root
npm install          # installs client + server workspaces in one shot
npm run dev          # starts the game server (:3001) AND the Vite client (:5173)
```

Open **http://localhost:5173** — then click **Quick Play**.

To test multiplayer: open a **second browser window** (or a friend's machine on the network), click **Join Room**, and type the room code shown in the first window's HUD.

> The dev client connects to the server at `http://localhost:3001` by default.
> Override with `client/.env` → `VITE_WS_URL` (see §6).

### Root commands

| Command | What it does |
|---|---|
| `npm run dev` | Concurrent dev servers (tsx watch + Vite HMR) |
| `npm run build` | Production build of server (tsc) + client (vite) |
| `npm start` | Run the built server (also serves `client/dist` if present) |
| `npm test` | Automated server game-rule tests (vitest) |
| `npm run typecheck` | TypeScript check for both apps |

---

## 2. Controls

### Desktop
| Key | Action |
|---|---|
| `W A S D` | Move (camera-relative) |
| Mouse | Rotate camera (click the world to capture pointer) |
| `Space` | Jump |
| `Shift` | Sprint |
| `E` | Interact — attune nearby energy crystal |
| `1` `2` `3` `4` | Emotes: wave / cheer / spin / heart |
| `Tab` | Toggle the full leaderboard |
| `Enter` | Open chat (Enter sends, Esc cancels) |
| `Esc` | Pause menu |

### Touch / mobile
Left **virtual joystick** to move, drag the right side of the screen for camera, **JUMP** button, **RUN** toggle, emote & chat buttons, and a pause button. The game is playable in modern mobile browsers; performance depends on the device (use **Low** quality in Settings).

---

## 3. Gameplay Systems

- **Collectible energy orbs** — server spawns and relocates them; collection is validated by server-side proximity + single-award-per-spawn rules; respawn after a configurable delay.
- **Leaderboard** — computed and broadcast by the server only; clients can never set their own score.
- **Crystal resonance** — attune all 5 arena crystals (before they're re-dimmed) for a bonus; the completing player is scored by the server.
- **Rooms** — 5-character codes (unambiguous alphabet), configurable max players, full/invalid-code errors, host migration on disconnect, automatic teardown of empty rooms, late-join into live matches.
- **Respawn** — falling below the world triggers an authoritative server respawn (plus instant local prediction).
- **Chat & emotes** — room-scoped, length-limited, token-bucket rate-limited, sanitized server-side and rendered as plain text client-side.
- **Offline resilience** — if the server is unreachable you can still play **solo free-roam** (local rules mirror the server's); reconnecting mid-session auto-rejoins your room.

---

## 4. Architecture

```
neonverse/
├── shared/src/
│   ├── world.ts        # ONE procedural world definition used by client render,
│   │                   # client physics AND server validation bounds
│   └── protocol.ts     # wire contract: event names + payload types
├── client/             # React 19 + Vite + TypeScript
│   └── src/
│       ├── game/       # World.tsx, Player.tsx, RemotePlayer.tsx, Character.tsx,
│       │               # CameraController.tsx, Collectibles.tsx, FX.tsx,
│       │               # physics.ts, input.ts, audio.ts, GameScene.tsx
│       ├── multiplayer/# socket.ts, gameEvents.ts, netState.ts, api.ts, soloSession.ts
│       ├── store/      # zustand: session, hud, settings (persisted)
│       ├── ui/         # MainMenu, Lobby, HUD, chat, pause, settings, mobile controls
│       └── components/ # Background3D (menu backdrop)
├── server/             # Node.js + Express + Socket.IO + Zod
│   └── src/
│       ├── index.ts           # bootstrap, /health, static client (prod)
│       ├── rooms.ts           # room registry + code generation
│       ├── gameState.ts       # GameRoom: authoritative rules (socket-free, testable)
│       ├── playerManager.ts   # temp ids, profile validation/sanitizing
│       ├── collision.ts       # movement validation, bounds, proximity checks
│       └── socketHandlers.ts  # event wiring + broadcasts + tick loop
└── test / server/test/rules.test.ts   # vitest: 21 server rule tests
```

### Networking model (server-authoritative)
- Clients send **movement claims** at 30 Hz; the server **validates** each one (max reachable speed from the last accepted position, world bounds, fall detection), stores the authoritative position, and relays compact **snapshots at 15 Hz** to the room.
- Remote players are rendered with a **120 ms interpolation buffer** (with snap-on-teleport) so 15 Hz relays look smooth.
- **Local player uses client-side prediction** (own physics never waits for the network); a drift watchdog resyncs only on >6 m disagreement.
- **Scores, item state, crystals, chat, room membership** live only on the server; clients receive events. Collection claims are proximity-checked and deduplicated per spawn.
- Socket.IO rooms isolate sessions; `connectionStateRecovery` + auto-rejoin handle transient drops.

### Performance choices
- Instanced meshes for colliders/crystals/orbs/particles, one merged wireframe draw call for all neon edges, pooled `Points` particle system, per-frame work in `useFrame` with zero React state churn, allocation-light physics (reused temp vectors), quality tiers (Low/Medium/High) controlling DPR, shadows, antialias, star/sparkle counts.
- Audio is 100% synthesized at runtime (WebAudio) — no audio files, no autoplay (context starts on first click).

---

## 5. Security & Validation

- Every client payload is **Zod-validated** server-side (profiles, positions, item ids, chat, emotes, crystal ids).
- Names/chat are stripped of control chars/angle brackets, length-capped, and rendered as text (React escaping) — no HTML injection.
- Rate limits: chat token bucket (4 burst / 2.5 s refill), emote cooldown, movement speed clamping, room size enforcement.
- No secrets in frontend code; guest ids are random and connection-scoped. No database — nothing is persisted server-side by design.
- Production: serve over **HTTPS**; Socket.IO then runs on **WSS** automatically (see §7).

---

## 6. Environment Variables

**Server** (`server/.env`, see `server/.env.example`):

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3001` | HTTP + WebSocket port |
| `CLIENT_ORIGIN` | `http://localhost:5173,...` | Comma-separated allowed CORS/WS origins |
| `MAX_PLAYERS_PER_ROOM` | `12` | Hard cap per room |
| `TICK_RATE` | `15` | Snapshot broadcast rate (Hz) |
| `ITEM_RESPAWN_MS` | `12000` | Collectible respawn delay |
| `ACTIVE_ITEMS` | `10` | Simultaneous orbs per room |

**Client** (`client/.env`, see `client/.env.example`):

| Var | Default | Meaning |
|---|---|---|
| `VITE_WS_URL` | `http://localhost:3001` | Game server URL for Socket.IO |

---

## 7. Production Build & Deployment

```bash
npm run build     # server → server/dist, client → client/dist
npm start         # single-process: server also serves the built client on :3001
```

**Two deployment topologies:**

1. **Single persistent Node process (simplest).** Run `npm run build && npm start` on any host supporting long-lived Node + WebSockets (Railway, Render, Fly.io, a VPS + nginx, etc.). It serves the game UI *and* the multiplayer socket from one origin — no CORS config needed. Point your HTTPS reverse proxy at `PORT` and upgrade WebSockets on `/socket.io/*`.

2. **Static frontend + separate backend.** Deploy `client/dist` to any static host (Netlify/Vercel/GitHub Pages) with `VITE_WS_URL` set to the backend URL at **build time**; run the server process separately with `CLIENT_ORIGIN` including the frontend origin.

> ⚠️ Static hosting alone **cannot** run the multiplayer server — it needs a persistent Node process. On HTTPS pages the socket must be `wss://` (a `ws://` target will be blocked by the browser); use `https://your-server` as `VITE_WS_URL` and Socket.IO negotiates `wss://` automatically.

---

## 8. Testing

### Automated (server rules)
```bash
npm test
```
21 vitest cases cover: room code generation/normalization/full rooms/host migration, profile sanitizing, movement teleport-clamping, bounds, fall-respawn, **collect-once-per-spawn**, far-claim rejection, respawn relocation, leaderboard ranking, crystal proximity + resonance-once, chat/emote rate limits, snapshot roster.

### Manual verification checklist
1. One player loads and moves (WASD/jump/sprint) ✔
2. Two browser windows join the same room code ✔
3. Both see each other moving (interpolated) ✔
4. Jump + collide with platforms/crates ✔
5. A collectible awards exactly once per spawn (server-enforced) ✔
6. Leaderboard updates on collection ✔
7. Disconnected players disappear (avatar + leaderboard) ✔
8. Full rooms / invalid codes show clear errors ✔
9. Chat stays inside the room ✔
10. Kill the server mid-game → HUD shows *reconnecting*, world keeps running, rejoins automatically ✔

---

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| Menu says *Server offline* | Server not running / wrong `VITE_WS_URL`; check `http://<server>/health` |
| Can't join: "Room not found" | Codes are case-insensitive but must be exactly 5 chars; the room closes when everyone leaves |
| Remote players jittery | Lower `TICK_RATE` lag: check latency chip (bottom-right); network QoS |
| Low FPS | Settings → Graphics **Low**; close GPU-heavy tabs |
| No audio | Click anywhere once (browser gesture policy), check Settings volumes |
| CORS error in console | Add the frontend origin to `CLIENT_ORIGIN` on the server |
| WebSocket fails in production | Ensure the proxy forwards the `Upgrade` header and uses `wss://` behind HTTPS |

---

## 10. Known Limitations / Honest Status

- **Fine collision is client-authoritative** (predicted locally, sanity-clamped server-side). A dedicated server re-simulates bounds/speed/rules, but not every AABB contact — a cheat could clip through a wall, though never gain score or teleport.
- Sprint stamina, match timers/rounds, and global persistent rankings are intentionally absent (spec: no DB until needed).
- Free-roam is the default mode; "Create Room → lobby → Start Match" is the simple match flow.
- Verified on Chromium desktop; Safari/iOS WebAudio and pointer-lock quirks may differ slightly.

Built with React Three Fiber, Three.js, Socket.IO, Express, Zod, Tailwind CSS v4, Zustand, and Lucide.
