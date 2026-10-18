/**
 * Multiplayer lobby: room code sharing, live player list, ready states,
 * host start control, clear connection/loading states.
 */

import { useState } from 'react';
import { Check, Copy, Crown, Gamepad2, Loader2, LogOut, Play, Settings, Users } from 'lucide-react';
import { Background3D } from '../components/Background3D';
import { Button, Panel } from './primitives';
import { SettingsDialog } from './SettingsDialog';
import { ControlsDialog } from './ControlsDialog';
import { useSession } from '../store/session';
import { useHud } from '../store/hud';
import { leaveRoom, setReady, startGame } from '../multiplayer/socket';
import { audio } from '../game/audio';
import { cn } from '../lib/cn';

export function Lobby() {
  const room = useSession((s) => s.room);
  const selfId = useSession((s) => s.selfId);
  const conn = useSession((s) => s.conn);
  const setPhase = useSession((s) => s.setPhase);
  const toast = useHud((s) => s.toast);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!room) {
    return (
      <div className="relative flex h-full items-center justify-center">
        <Background3D />
        <Panel className="relative flex items-center gap-3 px-8 py-6 text-slate-200">
          <Loader2 className="animate-spin" size={20} /> Joining room…
        </Panel>
      </div>
    );
  }

  const isHost = room.hostId === selfId;
  const me = room.players.find((p) => p.id === selfId);
  const readyCount = room.players.filter((p) => p.ready || p.id === room.hostId).length;

  const copyCode = async () => {
    audio.uiClick();
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast('Clipboard blocked — code: ' + room.code, 'info');
    }
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Background3D />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(3,4,14,0.78)_100%)]" />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <Panel className="w-full max-w-2xl p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black tracking-widest text-cyan-100 neon-text">NEON<span className="text-fuchsia-300">VERSE</span> LOBBY</h2>
              <p className="mt-1 text-xs text-slate-400">
                {isHost
                  ? 'You are the host. Share the code, then start when pilots are ready.'
                  : `Waiting for the host to start the match… (${readyCount}/${room.players.length} ready)`}
              </p>
            </div>
            <button
              onClick={copyCode}
              title="Copy room code"
              className="group flex flex-col items-center rounded-2xl border border-cyan-300/30 bg-cyan-400/10 px-5 py-3 transition-shadow hover:shadow-[0_0_22px_rgba(34,211,238,0.35)] cursor-pointer"
            >
              <span className="text-[10px] uppercase tracking-[0.3em] text-cyan-200/70">Room code</span>
              <span className="font-mono-game text-3xl font-bold tracking-[0.35em] text-cyan-100">{room.code}</span>
              <span className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-cyan-200">
                {copied ? <Check size={11} className="text-emerald-300" /> : <Copy size={11} />}
                {copied ? 'copied!' : 'tap to copy'}
              </span>
            </button>
          </div>

          {/* Player list */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-400">
                <Users size={13} /> Pilots <span className="text-cyan-200">{room.players.length}/{room.maxPlayers}</span>
              </span>
              {conn !== 'online' && (
                <span className="flex items-center gap-1.5 text-[11px] text-amber-300">
                  <Loader2 size={12} className="animate-spin" /> reconnecting…
                </span>
              )}
            </div>
            <ul className="scroll-thin max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-1.5">
              {room.players.map((p) => {
                const host = p.id === room.hostId;
                const self = p.id === selfId;
                return (
                  <li
                    key={p.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      self && 'bg-cyan-400/10',
                    )}
                  >
                    <span className="h-3 w-3 rounded-full shadow-[0_0_8px_currentColor]" style={{ background: p.profile.color, color: p.profile.color }} />
                    <span className="flex-1 truncate font-semibold text-slate-100">
                      {p.profile.name}
                      {self && <span className="ml-1 text-[10px] font-normal text-cyan-300/80">(you)</span>}
                    </span>
                    {host && <Crown size={14} className="text-amber-300" aria-label="host" />}
                    {(host || p.ready) && <Check size={14} className={host ? 'text-amber-200/70' : 'text-emerald-300'} aria-label="ready" />}
                  </li>
                );
              })}
              {Array.from({ length: Math.max(0, room.maxPlayers - room.players.length) }).map((_, i) => (
                <li key={`slot-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600">
                  <span className="h-3 w-3 rounded-full border border-dashed border-slate-600" />
                  <span className="italic">empty slot</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { audio.uiClick(); setControlsOpen(true); }}>
                <Gamepad2 size={14} /> Controls
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { audio.uiClick(); setSettingsOpen(true); }}>
                <Settings size={14} /> Settings
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  audio.uiClick();
                  leaveRoom();
                  setPhase('menu');
                }}
              >
                <LogOut size={15} /> Leave
              </Button>
              {!isHost ? (
                <Button
                  variant={me?.ready ? 'magenta' : 'primary'}
                  onClick={() => {
                    audio.ensure();
                    audio.uiClick();
                    setReady(!me?.ready);
                  }}
                >
                  {me?.ready ? 'Not ready' : 'Ready'}
                </Button>
              ) : (
                <Button
                  disabled={room.players.length === 0 || conn !== 'online'}
                  onClick={() => {
                    audio.ensure();
                    audio.uiOpen();
                    startGame();
                  }}
                >
                  <Play size={15} /> Start Match
                </Button>
              )}
            </div>
          </div>
        </Panel>
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ControlsDialog open={controlsOpen} onClose={() => setControlsOpen(false)} />
    </div>
  );
}
