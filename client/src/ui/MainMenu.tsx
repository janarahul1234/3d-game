/**
 * Main menu: branding, connection status, quick play / create / join,
 * character customization, settings and the controls guide.
 */

import { useEffect, useState } from 'react';
import {
  Gamepad2,
  Users,
  Zap,
  Settings,
  Play,
  Wifi,
  WifiOff,
  Sparkles,
  LogIn,
  CircleUser,
} from 'lucide-react';
import type { PlayerProfile } from '@shared/protocol';
import { Background3D } from '../components/Background3D';
import { Button, Input, Label, Panel } from './primitives';
import { Dialog } from './Dialog';
import { CustomizePanel } from './CustomizePanel';
import { SettingsDialog } from './SettingsDialog';
import { ControlsDialog } from './ControlsDialog';
import { createRoom, joinRoom, startGame } from '../multiplayer/socket';
import { useSession, loadProfile, saveProfile, DEFAULT_PROFILE } from '../store/session';
import { useHud } from '../store/hud';
import { audio } from '../game/audio';
import { net } from '../multiplayer/netState';
import { solo } from '../multiplayer/soloSession';
import { serverErrorText } from '../multiplayer/gameEvents';

export function MainMenu() {
  const conn = useSession((s) => s.conn);
  const setPhase = useSession((s) => s.setPhase);
  const toast = useHud((s) => s.toast);

  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile() ?? DEFAULT_PROFILE);
  const [needName, setNeedName] = useState(() => !loadProfile());
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(8);

  useEffect(() => {
    net.selfProfile = profile;
  }, [profile]);

  const validName = (name: string): string | null => {
    const n = name.trim();
    if (n.length < 2) return 'Name needs at least 2 characters';
    if (n.length > 16) return 'Name too long (max 16)';
    if (!/^[\w \-.'’\u00C0-\u024F\u0400-\u04FF]+$/.test(n)) return 'Letters, numbers, spaces, - and . only';
    return null;
  };

  const persistProfile = (p: PlayerProfile) => {
    setProfile(p);
    saveProfile(p);
  };

  const gateName = (): boolean => {
    const err = validName(profile.name);
    setNameError(err);
    if (err) {
      setNeedName(true);
      return false;
    }
    return true;
  };

  const click = () => {
    audio.ensure();
    audio.uiClick();
  };

  const quickPlay = async () => {
    click();
    if (!gateName() || busy) return;
    setBusy(true);
    const res = await createRoom(profile);
    setBusy(false);
    if (res.ok) {
      setPhase('lobby');
      // Free-roam: auto-start immediately; friends can still join via the code.
      setTimeout(() => {
        startGame();
        audio.uiOpen();
      }, 250);
    } else {
      toast(serverErrorText(res.error), 'bad');
    }
  };

  const createRoomDialog = async () => {
    click();
    if (!gateName() || busy) return;
    setBusy(true);
    const res = await createRoom(profile, maxPlayers);
    setBusy(false);
    setCreateOpen(false);
    if (res.ok) setPhase('lobby');
    else toast(serverErrorText(res.error), 'bad');
  };

  const doJoin = async () => {
    click();
    if (!gateName() || busy) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) {
      setJoinError('Room codes are 5 characters');
      return;
    }
    setBusy(true);
    const res = await joinRoom(code, profile);
    setBusy(false);
    if (res.ok) {
      setJoinOpen(false);
      setJoinError(null);
      setPhase('lobby');
    } else {
      setJoinError(serverErrorText(res.error));
    }
  };

  const playOffline = () => {
    click();
    persistProfile({ ...profile, name: validName(profile.name) ? profile.name : 'Lone Runner' });
    solo.start();
  };

  const online = conn === 'online' || conn === 'reconnecting';

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Background3D />

      {/* Vignette so UI pops over the scene */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(3,4,14,0.82)_100%)]" />

      {/* Header */}
      <header className="absolute left-0 right-0 top-0 flex items-center justify-between p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-cyan-200/70">
          {online ? <Wifi size={14} className="text-emerald-300" /> : <WifiOff size={14} className="text-rose-300" />}
          {conn === 'online' && 'Connected to server'}
          {conn === 'reconnecting' && 'Connection unstable…'}
          {conn === 'connecting' && 'Connecting…'}
          {conn === 'offline' && 'Server offline'}
        </div>
        <button
          className="glass-subtle flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-slate-200 hover:text-white cursor-pointer"
          onClick={() => {
            click();
            const hue = Math.floor(Math.random() * 360);
            // Convert HSL hue to a hex string (server validates #rrggbb).
            const tmp = document.createElement('i');
            tmp.style.color = `hsl(${hue}, 80%, 62%)`;
            document.body.appendChild(tmp);
            const rgb = getComputedStyle(tmp).color.match(/\d+/g) ?? [34, 211, 238];
            const hex = '#' + rgb.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
            tmp.remove();
            persistProfile({
              ...profile,
              name: validName(profile.name) ? profile.name : `${['Neon', 'Volt', 'Flux', 'Blaze', 'Echo', 'Nyx'][Math.floor(Math.random() * 6)]}${Math.floor(Math.random() * 90 + 10)}`,
              color: hex,
            });
          }}
        >
          <Sparkles size={13} className="text-fuchsia-300" /> Randomize look
        </button>
      </header>

      {/* Center column */}
      <main className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-4">
        <div className="text-center select-none">
          <h1 className="text-6xl md:text-7xl font-black tracking-[0.08em] text-cyan-100 neon-text animate-neon-pulse">
            NEON<span className="text-fuchsia-300 neon-text-magenta">VERSE</span>
          </h1>
          <p className="mt-2 text-sm uppercase tracking-[0.4em] text-slate-300/80">
            online 3D arena · run · jump · collect
          </p>
        </div>

        <Panel className="w-[380px] max-w-[92vw] p-5">
          <div className="flex flex-col gap-2.5">
            <Button size="lg" onClick={quickPlay} disabled={busy}>
              <Play size={18} /> Quick Play — Free Roam
            </Button>
            <div className="grid grid-cols-2 gap-2.5">
              <Button variant="magenta" onClick={() => { click(); setJoinOpen(true); }} disabled={busy}>
                <LogIn size={16} /> Join Room
              </Button>
              <Button variant="magenta" onClick={() => { click(); setCreateOpen(true); }} disabled={busy}>
                <Users size={16} /> Create Room
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => { click(); setCustomizeOpen(true); }}>
                <CircleUser size={15} /> Character
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { click(); setSettingsOpen(true); }}>
                <Settings size={15} /> Settings
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { click(); setControlsOpen(true); }}>
                <Gamepad2 size={15} /> Controls
              </Button>
            </div>
            {conn === 'offline' && (
              <button
                onClick={playOffline}
                className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 cursor-pointer"
              >
                <Zap size={14} /> Server unreachable — play offline (solo)
              </button>
            )}
          </div>
        </Panel>
      </main>

      <footer className="absolute bottom-3 left-0 right-0 text-center text-[11px] text-slate-500">
        Guest access — no account needed. Every orb and rank is scored by the authoritative server.
      </footer>

      {/* -------- Name gate (first visit) -------- */}
      <Dialog open={needName} onClose={() => setNeedName(false)} title="Choose your pilot" icon={<CircleUser size={18} />}>
        <div className="flex flex-col gap-4">
          <CustomizePanel
            profile={profile}
            nameError={nameError}
            onChange={(p) => {
              setProfile(p);
              setNameError(validName(p.name));
            }}
          />
          <Button
            onClick={() => {
              click();
              if (!validName(profile.name)) {
                persistProfile(profile);
                setNeedName(false);
              }
            }}
          >
            Enter the NeonVerse
          </Button>
        </div>
      </Dialog>

      {/* -------- Customize -------- */}
      <Dialog open={customizeOpen} onClose={() => setCustomizeOpen(false)} title="Character" icon={<CircleUser size={18} />}>
        <CustomizePanel profile={profile} nameError={nameError} onChange={(p) => { setProfile(p); setNameError(validName(p.name)); }} />
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => {
              click();
              if (!validName(profile.name)) {
                persistProfile(profile);
                setCustomizeOpen(false);
              }
            }}
          >
            Save
          </Button>
        </div>
      </Dialog>

      {/* -------- Create room -------- */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Create Room" icon={<Users size={18} />}>
        <div className="flex flex-col gap-4">
          <div>
            <Label>Max players: {maxPlayers}</Label>
            <input
              type="range"
              min={2}
              max={12}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="mt-2 w-full"
              style={{ ['--pct' as string]: `${((maxPlayers - 2) / 10) * 100}%` }}
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>2</span>
              <span>12</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            You’ll be the room <span className="text-cyan-200">host</span>. Share the generated code with
            friends — they can join from “Join Room” even after the match starts.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { click(); setCreateOpen(false); }}>Cancel</Button>
            <Button onClick={createRoomDialog} disabled={busy}>Create & go to lobby</Button>
          </div>
        </div>
      </Dialog>

      {/* -------- Join room -------- */}
      <Dialog open={joinOpen} onClose={() => setJoinOpen(false)} title="Join Room" icon={<LogIn size={18} />}>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="join-code">Room code</Label>
            <Input
              id="join-code"
              autoFocus
              value={joinCode}
              maxLength={6}
              placeholder="e.g. K7X2M"
              className="mt-1 text-center !text-2xl tracking-[0.5em] uppercase font-mono-game"
              onChange={(e) => {
                setJoinCode(e.target.value.toUpperCase());
                setJoinError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && doJoin()}
            />
            {joinError && <p className="mt-1 text-xs text-rose-300">{joinError}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { click(); setJoinOpen(false); }}>Cancel</Button>
            <Button onClick={doJoin} disabled={busy || joinCode.length < 4}>Join</Button>
          </div>
        </div>
      </Dialog>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ControlsDialog open={controlsOpen} onClose={() => setControlsOpen(false)} />
    </div>
  );
}
