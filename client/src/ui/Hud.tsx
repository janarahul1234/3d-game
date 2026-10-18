/**
 * In-game HUD: identity + score, room status, compact leaderboard, chat
 * feed, interaction prompt, crosshair, connection monitor and toasts.
 * The 3D world stays dominant — panels are small, frosted and edge-anchored.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Activity, Coins, Crown, MessageSquare, Radio, Settings, Trophy, Users, Zap } from 'lucide-react';
import { useHud } from '../store/hud';
import { useSession } from '../store/session';
import { useSettings } from '../store/settings';
import { cn } from '../lib/cn';
import { audio } from '../game/audio';
import type { PlayerProfile } from '@shared/protocol';

export function Hud({ profile }: { profile: PlayerProfile }) {
  const score = useHud((s) => s.score);
  const prompt = useHud((s) => s.prompt);
  const showFps = useSettings((s) => s.showFps);
  const fps = useHud((s) => s.fps);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Top-left: identity + score */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="glass-subtle flex items-center gap-3 rounded-2xl px-3.5 py-2">
          <span
            className="grid h-8 w-8 place-items-center rounded-full text-sm font-black"
            style={{ background: `${profile.color}22`, color: profile.color, border: `1px solid ${profile.color}66` }}
          >
            {profile.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="leading-tight">
            <div className="text-sm font-bold tracking-wide text-slate-100">{profile.name}</div>
            <div className="text-[10px] uppercase tracking-widest text-slate-400">
              {useSession.getState().selfId ? 'Neon Runner' : 'Connecting'}
            </div>
          </div>
          <div className="ml-3 flex items-center gap-1.5 rounded-xl bg-amber-400/10 px-2.5 py-1 text-amber-200 border border-amber-300/25">
            <Coins size={14} />
            <span className="font-mono-game text-base font-bold">{score}</span>
          </div>
        </div>
        <RoomChip />
      </div>

      {/* Top-right: leaderboard */}
      <LeaderboardPanel />

      {/* Crosshair / camera indicator */}
      <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200/70 shadow-[0_0_8px_#22d3ee]" />

      {/* Interaction prompt */}
      {prompt && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <div className="glass-subtle flex items-center gap-2 rounded-full px-4 py-2 text-sm text-cyan-100 animate-[riseFade_2s_ease-out]">
            <Zap size={14} className="text-fuchsia-300" /> {prompt}
          </div>
        </div>
      )}

      {/* Chat feed */}
      <ChatFeed />

      {/* Toasts */}
      <Toasts />

      {/* Bottom-right: connection monitor */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2">
        {showFps && (
          <span className="glass-subtle rounded-lg px-2 py-1 font-mono-game text-[11px] text-emerald-300">{fps} FPS</span>
        )}
        <ConnectionChip />
        <HUDButton title="Settings">
          <Settings size={15} />
        </HUDButton>
      </div>
    </div>
  );
}

function HUDButton({ children, title, onClick }: { children: ReactNode; title?: string; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={() => {
        audio.uiClick();
        onClick?.();
      }}
      className="glass-subtle pointer-events-auto grid h-8 w-8 place-items-center rounded-lg text-slate-300 hover:text-cyan-200 cursor-pointer transition-colors"
    >
      {children}
    </button>
  );
}

function RoomChip() {
  const room = useSession((s) => s.room);
  if (!room) return null;
  return (
    <div className="glass-subtle flex items-center gap-3 rounded-xl px-3 py-1.5 text-[11px] tracking-wide text-slate-300">
      <span className="flex items-center gap-1.5 text-cyan-200">
        <Radio size={12} />
        <span className="font-mono-game text-sm font-bold tracking-[0.25em]">{room.code}</span>
      </span>
      <span className="h-3 w-px bg-white/15" />
      <span className="flex items-center gap-1">
        <Users size={12} /> {room.players.length}/{room.maxPlayers}
      </span>
    </div>
  );
}

function ConnectionChip() {
  const conn = useSession((s) => s.conn);
  const latency = useSession((s) => s.latencyMs);
  const net = conn === 'online' ? 'online' : conn === 'solo' ? 'solo' : conn === 'offline' ? 'offline' : 'reconnecting';
  return (
    <span
      className={cn(
        'glass-subtle flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono-game text-[11px]',
        net === 'online' && 'text-emerald-300',
        net === 'reconnecting' && 'animate-pulse text-amber-300',
        net === 'solo' && 'text-fuchsia-300',
        net === 'offline' && 'text-rose-300',
      )}
    >
      <Activity size={11} />
      {net === 'online' ? `${latency} ms` : net === 'solo' ? 'SOLO' : net}
    </span>
  );
}

function LeaderboardPanel() {
  const leaderboard = useHud((s) => s.leaderboard);
  const lbOpen = useHud((s) => s.lbOpen);
  const selfId = useSession((s) => s.selfId);
  const rows = lbOpen ? leaderboard.slice(0, 10) : leaderboard.slice(0, 3);
  if (rows.length === 0) return null;
  return (
    <div className="absolute right-4 top-4 w-49 min-w-[190px]">
      <div className="glass-subtle rounded-2xl p-2.5">
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <Trophy size={12} className="text-amber-300" /> Leaderboard
          </span>
          {lbOpen && <span className="text-[9px] text-slate-500">Tab to close</span>}
        </div>
        <ol className="flex flex-col gap-1">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className={cn(
                'flex items-center gap-2 rounded-lg px-2 py-1 text-xs transition-colors',
                r.id === selfId ? 'bg-cyan-400/15 text-cyan-50 border border-cyan-300/30' : 'text-slate-200',
              )}
            >
              <span className={cn('w-4 text-right font-mono-game font-bold', i === 0 ? 'text-amber-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-slate-500')}>
                {i + 1}
              </span>
              {i === 0 && <Crown size={11} className="-ml-0.5 text-amber-300" />}
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color, boxShadow: `0 0 6px ${r.color}` }} />
              <span className="flex-1 truncate">{r.name}</span>
              <span className="font-mono-game font-bold text-amber-200">{r.score}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function ChatFeed() {
  const chat = useHud((s) => s.chat);
  const chatOpen = useHud((s) => s.chatOpen);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  const recent = chatOpen ? chat.slice(-14) : chat.slice(-4);
  if (recent.length === 0) return null;
  return (
    <div className="absolute bottom-4 left-4 w-80 max-w-[46vw]">
      {chatOpen && (
        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400">
          <MessageSquare size={11} className="text-cyan-300" /> Room chat — Enter to type
        </div>
      )}
      <div
        ref={boxRef}
        className={cn(
          'scroll-thin flex flex-col gap-1 overflow-hidden rounded-xl bg-black/25 p-2 backdrop-blur-sm transition-all',
          chatOpen ? 'max-h-56 overflow-y-auto' : 'max-h-24',
        )}
      >
        {recent.map((m, i) =>
          m.system ? (
            <div key={`${m.ts}-${i}`} className="text-[11px] italic text-slate-400">
              {m.text}
            </div>
          ) : (
            <div key={`${m.ts}-${i}`} className="text-[12px] leading-snug">
              <span className="font-bold" style={{ color: m.color }}>
                {m.name}
              </span>
              <span className="mx-1 text-slate-500">›</span>
              {/* Rendered as plain text — React escapes it; server also sanitized. */}
              <span className="text-slate-200">{m.text}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function Toasts() {
  const toasts = useHud((s) => s.toasts);
  return (
    <div className="absolute left-1/2 top-14 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'glass rounded-full px-4 py-1.5 text-sm font-medium shadow-lg animate-[riseFade_4.2s_ease-out_forwards]',
            t.kind === 'good' && 'text-emerald-200 border-emerald-300/30',
            t.kind === 'bad' && 'text-rose-200 border-rose-300/30',
            t.kind === 'info' && 'text-cyan-100',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
