/** Pause menu (Esc): resume, settings, controls, leave room. */

import { Gamepad2, LogOut, Play, Settings } from 'lucide-react';
import { Button, Panel } from './primitives';
import { useHud } from '../store/hud';
import { useSession } from '../store/session';
import { leaveRoom } from '../multiplayer/socket';
import { net } from '../multiplayer/netState';
import { audio } from '../game/audio';
import { input } from '../game/input';

export function PauseMenu({ onOpenSettings, onOpenControls }: { onOpenSettings: () => void; onOpenControls: () => void }) {
  const pauseOpen = useHud((s) => s.pauseOpen);
  if (!pauseOpen) return null;

  const resume = () => {
    audio.uiClick();
    useHud.getState().toggle('pauseOpen', false);
    input.uiMode = false;
  };

  const leave = () => {
    audio.uiClick();
    useHud.getState().toggle('pauseOpen', false);
    input.uiMode = false;
    if (net.solo) {
      net.solo = false;
      useSession.getState().leaveRoom();
    } else {
      leaveRoom();
    }
  };

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/40 backdrop-blur-[3px]">
      <Panel className="w-72 p-5">
        <h2 className="mb-1 text-center text-2xl font-black tracking-[0.25em] text-cyan-100 neon-text">PAUSED</h2>
        <p className="mb-4 text-center text-[11px] text-slate-400">The world keeps living while you rest</p>
        <div className="flex flex-col gap-2.5">
          <Button onClick={resume}>
            <Play size={16} /> Resume
          </Button>
          <Button variant="ghost" onClick={() => { audio.uiClick(); onOpenSettings(); }}>
            <Settings size={15} /> Settings
          </Button>
          <Button variant="ghost" onClick={() => { audio.uiClick(); onOpenControls(); }}>
            <Gamepad2 size={15} /> Controls
          </Button>
          <Button variant="danger" onClick={leave}>
            <LogOut size={15} /> Leave room
          </Button>
        </div>
      </Panel>
    </div>
  );
}
