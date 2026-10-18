/**
 * HUD store: chat, leaderboard, score, prompts, toasts, overlay toggles.
 * Updated by network events; consumed by React UI components.
 */

import { create } from 'zustand';
import type { ChatMessage, LeaderRow } from '@shared/protocol';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'bad';
}

interface HudState {
  score: number;
  leaderboard: LeaderRow[];
  chat: ChatMessage[];
  toasts: Toast[];
  prompt: string | null;
  lbOpen: boolean;
  chatOpen: boolean;
  pauseOpen: boolean;
  settingsOpen: boolean;
  controlsOpen: boolean;
  fps: number;
  setScore: (n: number) => void;
  setLeaderboard: (rows: LeaderRow[]) => void;
  pushChat: (m: ChatMessage) => void;
  clearChat: () => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setPrompt: (p: string | null) => void;
  toggle: (key: 'lbOpen' | 'chatOpen' | 'pauseOpen' | 'settingsOpen' | 'controlsOpen', value?: boolean) => void;
  setFps: (n: number) => void;
}

let toastSeq = 1;

export const useHud = create<HudState>((set, get) => ({
  score: 0,
  leaderboard: [],
  chat: [],
  toasts: [],
  prompt: null,
  lbOpen: false,
  chatOpen: false,
  pauseOpen: false,
  settingsOpen: false,
  controlsOpen: false,
  fps: 0,
  setScore: (score) => set({ score }),
  setLeaderboard: (leaderboard) => set({ leaderboard }),
  pushChat: (m) => set((s) => ({ chat: [...s.chat.slice(-49), m] })),
  clearChat: () => set({ chat: [] }),
  toast: (text, kind = 'info') => {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setPrompt: (prompt) => set({ prompt }),
  toggle: (key, value) => set({ [key]: value ?? !get()[key] } as Partial<HudState>),
  setFps: (fps) => set({ fps }),
}));
