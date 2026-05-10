// Zustand store wrapping sim state. Phase 5 keeps it tight: sim form inputs,
// run state (idle | running | done), latest result.

import { create } from 'zustand';
import type { Difficulty } from '@ai/types';
import type { SimulationResult } from '@simulation/types';

export type SimRunState = 'idle' | 'running' | 'done' | 'error';

export interface SimFormState {
  numGames: number;
  difficulty: Difficulty;
  seed: string;
}

interface UIStore {
  form: SimFormState;
  runState: SimRunState;
  result?: SimulationResult | undefined;
  error?: string | undefined;
  setForm: (patch: Partial<SimFormState>) => void;
  setRunState: (state: SimRunState) => void;
  setResult: (result: SimulationResult) => void;
  setError: (msg: string) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  form: {
    numGames: 200,
    difficulty: 'medium',
    seed: 'ui-default',
  },
  runState: 'idle',
  setForm: (patch) => set((s) => ({ form: { ...s.form, ...patch } })),
  setRunState: (runState) => set(() => ({ runState })),
  setResult: (result) => set(() => ({ result, runState: 'done', error: undefined })),
  setError: (msg) => set(() => ({ error: msg, runState: 'error' })),
}));
