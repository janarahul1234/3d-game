/**
 * Game screen shell: gameplay Canvas + HUD + overlays (pause, chat,
 * leaderboard hints, pointer-lock instructions, loading veil, mobile stick).
 */

import { useEffect, useState } from 'react';
import type { PlayerProfile } from '@shared/protocol';
import { GameScene } from '../game/GameScene';
import { Hud } from './Hud';
import { PauseMenu } from './PauseMenu';
import { ChatInput } from './ChatInput';
import { MobileControls } from './MobileControls';
import { SettingsDialog } from './SettingsDialog';
import { ControlsDialog } from './ControlsDialog';
import { useHud } from '../store/hud';
import { useSession } from '../store/session';
import { input } from '../game/input';
import { audio } from '../game/audio';
import { apiEmote } from '../multiplayer/api';
import { net } from '../multiplayer/netState';
import { Zap } from 'lucide-react';

const EMOTE_KEYS: Record<string, 'wave' | 'jump' | 'spin' | 'heart'> = {
  Digit1: 'wave',
  Digit2: 'jump',
  Digit3: 'spin',
  Digit4: 'heart',
};

export function GameScreen({ profile }: { profile: PlayerProfile }) {
  const phase = useSession((s) => s.phase);
  const chatOpen = useHud((s) => s.chatOpen);
  const pauseOpen = useHud((s) => s.pauseOpen);
  const [locked, setLocked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  // Global in-game hotkeys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA';
      const hud = useHud.getState();

      if (e.code === 'Tab') {
        e.preventDefault();
        if (!typing) hud.toggle('lbOpen');
        return;
      }
      if (typing) return;

      if (e.code === 'Enter' && !hud.chatOpen) {
        e.preventDefault();
        audio.ensure();
        audio.uiOpen();
        input.exitPointerLock();
        input.uiMode = true;
        hud.toggle('chatOpen', true);
        return;
      }
      if (e.code === 'Escape') {
        if (hud.chatOpen) {
          hud.toggle('chatOpen', false);
          input.uiMode = false;
        } else if (hud.pauseOpen) {
          hud.toggle('pauseOpen', false);
          input.uiMode = false;
        } else {
          audio.uiOpen();
          hud.toggle('pauseOpen', true);
          input.uiMode = true;
          input.exitPointerLock();
        }
        return;
      }
      const emote = EMOTE_KEYS[e.code];
      if (emote && !hud.pauseOpen && !hud.chatOpen) {
        apiEmote(emote);
        net.emotes.set(net.selfId, { emote, at: performance.now() });
        audio.uiClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Pointer-lock tracking: losing the lock (Esc) opens the pause menu.
  useEffect(() => {
    const onChange = () => {
      const isLocked = !!document.pointerLockElement;
      setLocked(isLocked);
      if (!isLocked) {
        const hud = useHud.getState();
        if (!hud.chatOpen && !hud.pauseOpen && !settingsOpen && !controlsOpen && phase === 'game') {
          hud.toggle('pauseOpen', true);
          input.uiMode = true;
        }
      }
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, [phase, settingsOpen, controlsOpen]);

  useEffect(() => {
    audio.ensure(); // first user gesture already happened (they clicked Play)
    return () => {
      input.uiMode = false;
      input.exitPointerLock();
    };
  }, []);

  const showClickHint = phase === 'game' && !locked && !chatOpen && !pauseOpen && !input.isTouch && !settingsOpen && !controlsOpen;
  const isLoading = phase === 'loading';

  return (
    <div className="relative h-full w-full overflow-hidden bg-void">
      <GameScene profile={profile} />

      {!isLoading && <Hud profile={profile} />}

      {/* First-time instruction screen before pointer lock activates */}
      {showClickHint && (
        <div
          className="pointer-events-none absolute inset-0 z-30 grid place-items-center"
          aria-hidden
        >
          <div
            className="glass pointer-events-auto max-w-sm cursor-pointer rounded-2xl p-5 text-center animate-[riseFade_.5s_ease-out]"
            onClick={() => {
              audio.ensure();
              input.requestPointerLock();
            }}
          >
            <Zap size={26} className="mx-auto mb-2 text-cyan-300" />
            <h3 className="text-sm font-bold uppercase tracking-[0.3em] text-cyan-100">Click to take control</h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Mouse look is captured (pointer lock).
              <br />
              <span className="text-cyan-200">WASD</span> move · <span className="text-cyan-200">Space</span> jump ·{' '}
              <span className="text-cyan-200">Shift</span> sprint · <span className="text-cyan-200">E</span> interact
              <br />
              <span className="text-cyan-200">Tab</span> leaderboard · <span className="text-cyan-200">Enter</span> chat ·{' '}
              <span className="text-cyan-200">1–4</span> emotes · <span className="text-cyan-200">Esc</span> menu
            </p>
          </div>
        </div>
      )}

      {/* Loading veil while the world initializes */}
      {isLoading && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#050510]">
          <div className="text-center">
            <div className="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
            <p className="text-xs uppercase tracking-[0.4em] text-cyan-200/70">Materializing the NeonVerse…</p>
          </div>
        </div>
      )}

      <ChatInput />
      <PauseMenu onOpenSettings={() => setSettingsOpen(true)} onOpenControls={() => setControlsOpen(true)} />
      {input.isTouch && <MobileControls />}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          if (pauseOpen) input.uiMode = true;
        }}
      />
      <ControlsDialog
        open={controlsOpen}
        onClose={() => {
          setControlsOpen(false);
          if (pauseOpen) input.uiMode = true;
        }}
      />
    </div>
  );
}
