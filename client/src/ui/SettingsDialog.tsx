/** Settings: graphics quality, audio volumes, mouse tuning, HUD toggles. */

import { Settings } from 'lucide-react';
import { Dialog } from './Dialog';
import { Label } from './primitives';
import { useSettings, type Quality } from '../store/settings';
import { audio } from '../game/audio';

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.05,
  fmt,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  fmt?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="text-xs text-cyan-200/80 font-mono-game">{fmt ? fmt(value) : `${Math.round(value * 100)}%`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="mt-1.5 w-full"
        style={{ ['--pct' as string]: `${((value - min) / (max - min)) * 100}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings();

  const qualityBtn = (q: Quality, text: string) => (
    <button
      key={q}
      onClick={() => {
        audio.ensure();
        audio.uiClick();
        s.set('quality', q);
      }}
      className={
        'rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer transition-all ' +
        (s.quality === q
          ? 'border-cyan-300/70 bg-cyan-400/15 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.3)]'
          : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]')
      }
    >
      {text}
    </button>
  );

  return (
    <Dialog open={open} onClose={onClose} title="Settings" icon={<Settings size={18} />}>
      <div className="flex flex-col gap-5">
        <div>
          <Label>Graphics quality</Label>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {qualityBtn('low', 'Low')}
            {qualityBtn('medium', 'Medium')}
            {qualityBtn('high', 'High')}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Low disables shadows/AA and particle extras — best for weak machines and laptops on battery.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-4">
          <Slider label="Master volume" value={s.masterVolume} onChange={(v) => s.set('masterVolume', v)} />
          <Slider label="Music" value={s.musicVolume} onChange={(v) => s.set('musicVolume', v)} />
          <Slider label="Sound effects" value={s.sfxVolume} onChange={(v) => s.set('sfxVolume', v)} />
          <Slider label="Ambient" value={s.ambientVolume} onChange={(v) => s.set('ambientVolume', v)} />
        </div>

        <Slider
          label="Mouse sensitivity"
          value={s.mouseSensitivity}
          min={0.3}
          max={2.5}
          step={0.1}
          onChange={(v) => s.set('mouseSensitivity', v)}
          fmt={(v) => `${v.toFixed(1)}×`}
        />

        <div className="flex flex-wrap gap-3">
          <Toggle label="Invert Y axis" value={s.invertY} onChange={(v) => s.set('invertY', v)} />
          <Toggle label="Show FPS counter" value={s.showFps} onChange={(v) => s.set('showFps', v)} />
          <Toggle label="Reduced motion (UI)" value={s.reducedMotion} onChange={(v) => s.set('reducedMotion', v)} />
        </div>
      </div>
    </Dialog>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => {
        audio.ensure();
        audio.uiClick();
        onChange(!value);
      }}
      className={
        'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors ' +
        (value
          ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-200'
          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]')
      }
    >
      <span className={'h-2 w-2 rounded-full ' + (value ? 'bg-emerald-300 shadow-[0_0_8px_#6ee7b7]' : 'bg-slate-600')} />
      {label}
    </button>
  );
}
