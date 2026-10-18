/**
 * Persistent user settings (quality, audio, controls). Stored in localStorage.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Quality = 'low' | 'medium' | 'high';

export interface SettingsState {
  quality: Quality;
  masterVolume: number; // 0..1
  musicVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  mouseSensitivity: number; // multiplier
  invertY: boolean;
  showFps: boolean;
  reducedMotion: boolean;
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      quality: 'medium',
      masterVolume: 0.8,
      musicVolume: 0.5,
      sfxVolume: 0.8,
      ambientVolume: 0.35,
      mouseSensitivity: 1,
      invertY: false,
      showFps: false,
      reducedMotion: false,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    { name: 'neonverse-settings' },
  ),
);

/** Snapshot getter for non-React contexts (audio engine, r3f loops). */
export const settingsNow = () => useSettings.getState();
