/**
 * Fully procedural WebAudio engine — no audio files, no autoplay.
 * The context is created on the first user gesture (click/tap/jump).
 *
 * Music is a tiny generative synth: minor-key chord pads with an arpeggio
 * scheduled in a look-ahead loop. SFX are short synthesized envelopes.
 */

import { settingsNow, useSettings } from '../store/settings';

type Ctx = AudioContext;

class AudioEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private musicG: GainNode | null = null;
  private sfxG: GainNode | null = null;
  private ambG: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextBarTime = 0;
  private barIndex = 0;
  private ambNodes: { osc: OscillatorNode[]; lfoGain: GainNode } | null = null;
  private lastFootAt = 0;

  constructor() {
    // Volumes react live to the settings store.
    useSettings.subscribe((s) => this.applyVolumes(s));
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Must be called from a user gesture handler. */
  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.musicG = ctx.createGain();
    this.sfxG = ctx.createGain();
    this.ambG = ctx.createGain();
    // Gentle bus compression-ish: simple gain staging + shared lowpass on master.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 14000;
    this.master.connect(lp).connect(ctx.destination);
    this.musicG.connect(this.master);
    this.ambG.connect(this.master);
    this.sfxG.connect(this.master);

    this.applyVolumes(settingsNow());
    this.startAmbient();
    this.startMusic();

    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  private applyVolumes(s: { masterVolume: number; musicVolume: number; sfxVolume: number; ambientVolume: number }): void {
    if (!this.ctx || !this.master || !this.musicG || !this.sfxG || !this.ambG) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume * 0.9, t, 0.05);
    this.musicG.gain.setTargetAtTime(s.musicVolume * 0.5, t, 0.05);
    this.sfxG.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.ambG.gain.setTargetAtTime(s.ambientVolume * 0.35, t, 0.1);
  }

  /* ------------------------- primitives -------------------------- */

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    dest: GainNode,
    opts: { glide?: number; delay?: number; filter?: number; pan?: number } = {},
  ): void {
    const ctx = this.ctx;
    if (!ctx || !dest) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = g;
    if (opts.filter) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.filter;
      g.connect(lp);
      node = lp;
    }
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = opts.pan;
      node.connect(p).connect(dest);
    } else {
      node.connect(dest);
    }
    osc.connect(g);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noiseBurst(dur: number, bandFreq: number, gain: number, q = 1.2): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxG) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = bandFreq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(this.sfxG);
    src.start(t0);
  }

  /* ---------------------------- SFX ------------------------------ */

  footstep(): void {
    const now = performance.now();
    if (now - this.lastFootAt < 170) return;
    this.lastFootAt = now;
    this.noiseBurst(0.07, 320 + Math.random() * 240, 0.16, 1.6);
  }

  jump(): void {
    this.tone(240, 0.16, 'square', 0.08, this.sfxG!, { glide: 430, filter: 1800 });
  }

  land(force = 0.5): void {
    this.tone(120, 0.12, 'sine', 0.1 + 0.14 * force, this.sfxG!, { glide: 55 });
    this.noiseBurst(0.06, 240, 0.1 + 0.1 * force);
  }

  boost(): void {
    this.tone(180, 0.4, 'sawtooth', 0.09, this.sfxG!, { glide: 900, filter: 2400 });
  }

  pickup(mine: boolean): void {
    const base = mine ? 660 : 520;
    this.tone(base, 0.09, 'triangle', 0.16, this.sfxG!);
    this.tone(base * 1.5, 0.1, 'triangle', 0.13, this.sfxG!, { delay: 0.06 });
    this.tone(base * 2, 0.14, 'sine', 0.11, this.sfxG!, { delay: 0.12 });
  }

  uiClick(): void {
    this.tone(880, 0.05, 'square', 0.05, this.sfxG!, { filter: 3000 });
  }

  uiOpen(): void {
    this.tone(520, 0.07, 'triangle', 0.07, this.sfxG!, { glide: 760 });
  }

  message(): void {
    this.tone(980, 0.05, 'sine', 0.06, this.sfxG!);
    this.tone(1240, 0.06, 'sine', 0.05, this.sfxG!, { delay: 0.05 });
  }

  joinLeave(): void {
    this.tone(360, 0.12, 'triangle', 0.08, this.sfxG!, { glide: 280 });
  }

  respawn(): void {
    this.tone(300, 0.35, 'sine', 0.12, this.sfxG!, { glide: 1100 });
  }

  error(): void {
    this.tone(200, 0.2, 'sawtooth', 0.08, this.sfxG!, { glide: 120, filter: 900 });
  }

  resonance(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.1, this.musicG ?? this.sfxG!, { delay: i * 0.09 }));
  }

  /* ---------------------- ambient + music ------------------------ */

  private startAmbient(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambG || this.ambNodes) return;
    // Two detuned low sines + slow LFO = hovering hum of the grid.
    const a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.value = 55;
    const b = ctx.createOscillator();
    b.type = 'sine';
    b.frequency.value = 55.7;
    const c = ctx.createOscillator();
    c.type = 'triangle';
    c.frequency.value = 110.3;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain).connect(mix.gain);
    a.connect(mix);
    b.connect(mix);
    c.connect(mix);
    mix.connect(this.ambG);
    a.start();
    b.start();
    c.start();
    lfo.start();
    this.ambNodes = { osc: [a, b, c, lfo], lfoGain };
  }

  private startMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicG || this.musicTimer !== null) return;
    // A minor: Am – F – C – G pad progression, 2 bars each at ~92 BPM,
    // with a gentle pentatonic arpeggio on top.
    const chords = [
      [220.0, 261.63, 329.63], // Am
      [174.61, 220.0, 261.63], // F
      [130.81, 164.81, 196.0], // C
      [196.0, 246.94, 293.66], // G
    ];
    const arpScale = [440.0, 523.25, 659.25, 783.99, 880.0, 1046.5];
    const BAR = 2.08; // seconds per bar

    const scheduleBar = (barTime: number, bar: number) => {
      if (!this.musicG) return;
      const chord = chords[Math.floor(bar / 2) % chords.length];
      // Pad: soft detuned triangle chord, whole bar.
      for (const f of chord) {
        this.tone(f / 2, BAR * 1.9, 'triangle', 0.05, this.musicG, { delay: barTime - ctx.currentTime, filter: 900 });
      }
      // Bass pulse on beats 1 & 3.
      this.tone(chord[0] / 4, 0.5, 'sine', 0.14, this.musicG, { delay: barTime - ctx.currentTime, glide: chord[0] / 4.5 });
      this.tone(chord[0] / 4, 0.5, 'sine', 0.1, this.musicG, { delay: barTime - ctx.currentTime + BAR / 2, glide: chord[0] / 4.6 });
      // Arpeggio 8ths, sparse via pseudo-random but deterministic pattern.
      const seed = bar * 7;
      for (let i = 0; i < 8; i++) {
        if ((seed + i * 13) % 5 < 2) {
          const f = arpScale[(seed + i * 5) % arpScale.length];
          this.tone(f, 0.22, 'sine', 0.035, this.musicG, {
            delay: barTime - ctx.currentTime + (i * BAR) / 8,
            pan: (i % 2 === 0 ? -0.3 : 0.3),
          });
        }
      }
    };

    this.nextBarTime = ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextBarTime < this.ctx.currentTime + 1.0) {
        scheduleBar(this.nextBarTime, this.barIndex);
        this.barIndex++;
        this.nextBarTime += BAR;
      }
    }, 400);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

export const audio = new AudioEngine();
