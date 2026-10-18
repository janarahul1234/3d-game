/**
 * Touch controls for mobile: virtual joystick (left), jump + sprint +
 * emote + chat buttons (right). Camera look is handled by dragging the
 * bare canvas area (wired in GameScene).
 */

import { useRef, useState } from 'react';
import { SendHorizontal, Smile } from 'lucide-react';
import { input } from '../game/input';
import { useHud } from '../store/hud';
import { apiEmote } from '../multiplayer/api';
import { net } from '../multiplayer/netState';
import { audio } from '../game/audio';
import { cn } from '../lib/cn';

const JOY_RADIUS = 60;

export function MobileControls() {
  const baseRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const touchId = useRef<number | null>(null);
  const [emoteBar, setEmoteBar] = useState(false);
  const [sprint, setSprint] = useState(false);

  const setJoyFromPoint = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    setKnob({ x: dx, y: dy, active: true });
    input.joyX = dx / JOY_RADIUS;
    input.joyY = -dy / JOY_RADIUS; // up on screen = forward
  };

  const releaseJoy = () => {
    touchId.current = null;
    setKnob({ x: 0, y: 0, active: false });
    input.joyX = 0;
    input.joyY = 0;
  };

  const emotes = [
    { id: 'wave', label: '👋' },
    { id: 'jump', label: '✨' },
    { id: 'spin', label: '🌀' },
    { id: 'heart', label: '💖' },
  ] as const;

  const playEmote = (e: (typeof emotes)[number]) => {
    audio.ensure();
    audio.uiClick();
    apiEmote(e.id);
    net.emotes.set(net.selfId, { emote: e.id, at: performance.now() });
    setEmoteBar(false);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none md:hidden">
      {/* Joystick */}
      <div
        ref={baseRef}
        className="pointer-events-auto absolute bottom-8 left-8 h-36 w-36 rounded-full border border-cyan-300/25 bg-cyan-400/[0.07] backdrop-blur-sm"
        onTouchStart={(e) => {
          const t = e.changedTouches[0];
          touchId.current = t.identifier;
          setJoyFromPoint(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            if (t.identifier === touchId.current) setJoyFromPoint(t.clientX, t.clientY);
          }
        }}
        onTouchEnd={(e) => {
          for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchId.current) releaseJoy();
          }
        }}
      >
        <div
          className={cn(
            'absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border transition-colors',
            knob.active ? 'border-cyan-200/80 bg-cyan-300/30 shadow-[0_0_18px_rgba(34,211,238,0.5)]' : 'border-cyan-200/40 bg-cyan-400/15',
          )}
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Right cluster */}
      <div className="pointer-events-auto absolute bottom-8 right-8 flex flex-col items-end gap-3">
        {emoteBar && (
          <div className="glass flex gap-2 rounded-2xl p-2">
            {emotes.map((e) => (
              <button
                key={e.id}
                onClick={() => playEmote(e)}
                className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.06] text-xl active:scale-90"
              >
                {e.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                audio.uiClick();
                const next = !sprint;
                setSprint(next);
                input.sprintToggle = next;
              }}
              className={cn(
                'grid h-11 w-16 place-items-center rounded-2xl border text-[11px] font-black tracking-widest backdrop-blur-sm active:scale-95',
                sprint
                  ? 'border-fuchsia-300/70 bg-fuchsia-400/20 text-fuchsia-100'
                  : 'border-white/15 bg-white/[0.06] text-slate-300',
              )}
            >
              RUN
            </button>
            <button
              onClick={() => {
                audio.uiClick();
                useHud.getState().toggle('chatOpen', true);
                input.uiMode = true;
              }}
              className="grid h-11 w-16 place-items-center rounded-2xl border border-white/15 bg-white/[0.06] text-slate-300 backdrop-blur-sm active:scale-95"
            >
              <SendHorizontal size={17} />
            </button>
            <button
              onClick={() => {
                audio.uiClick();
                setEmoteBar((v) => !v);
              }}
              className="grid h-11 w-16 place-items-center rounded-2xl border border-white/15 bg-white/[0.06] text-slate-300 backdrop-blur-sm active:scale-95"
            >
              <Smile size={17} />
            </button>
          </div>
          <button
            onTouchStart={() => {
              audio.ensure();
              input.jumpQueued = true;
            }}
            className="grid h-20 w-20 place-items-center rounded-full border-2 border-cyan-300/60 bg-cyan-400/15 text-xs font-black tracking-widest text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.35)] backdrop-blur-sm active:scale-95"
          >
            JUMP
          </button>
        </div>
      </div>

      {/* Pause */}
      <button
        onClick={() => {
          audio.uiClick();
          useHud.getState().toggle('pauseOpen', true);
          input.uiMode = true;
        }}
        className="pointer-events-auto absolute right-4 top-16 grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/[0.06] text-slate-300 backdrop-blur-sm active:scale-95"
        aria-label="Pause"
      >
        ⏸
      </button>
    </div>
  );
}
