/** Controls reference dialog — desktop keyboard/mouse + touch layout. */

import { Gamepad2 } from 'lucide-react';
import { Dialog } from './Dialog';

const KEYS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Rotate camera'],
  ['Space', 'Jump'],
  ['Shift', 'Sprint'],
  ['E', 'Interact (attune crystal)'],
  ['1 – 4', 'Emotes: wave / cheer / spin / heart'],
  ['Tab', 'Leaderboard (hold or toggle)'],
  ['Enter', 'Open chat'],
  ['Esc', 'Pause menu'],
];

export function ControlsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Controls" icon={<Gamepad2 size={18} />}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-cyan-200/70">Desktop</h3>
          <ul className="flex flex-col gap-2">
            {KEYS.map(([k, desc]) => (
              <li key={k} className="flex items-center justify-between gap-3 text-sm">
                <kbd className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 font-mono-game text-xs text-cyan-100">
                  {k}
                </kbd>
                <span className="text-right text-slate-300">{desc}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
            Click the world to capture the mouse (pointer lock). Press Esc to release it.
          </p>
        </div>
        <div>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-fuchsia-200/70">Touch / mobile</h3>
          <ul className="flex flex-col gap-2.5 text-sm text-slate-300">
            <li className="glass-subtle rounded-xl px-3 py-2">🕹️ Left joystick — move</li>
            <li className="glass-subtle rounded-xl px-3 py-2">📐 Drag right side — camera</li>
            <li className="glass-subtle rounded-xl px-3 py-2">⬆️ Jump button — jump</li>
            <li className="glass-subtle rounded-xl px-3 py-2">🏃 RUN toggle — sprint</li>
            <li className="glass-subtle rounded-xl px-3 py-2">😀 Emote & 💬 chat buttons — bottom right</li>
          </ul>
          <p className="mt-3 text-[11px] text-slate-500">Interactions happen automatically when standing near crystals and orbs.</p>
        </div>
      </div>
    </Dialog>
  );
}
