// Config override store. Edits in the /config UI are persisted here and
// loaded by loadConfigs() on top of the JSON defaults.
// localStorage key: 'iron-ash-config-v1'

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CostsConfig, RulesConfig } from '@engine/types';
import type { FactionWeights } from '@ai/types';
import type { FactionId } from '@engine/types';

export type FactionWeightsOverride = Partial<Record<FactionId, Partial<FactionWeights>>>;

export interface ConfigOverrides {
  rules: Partial<RulesConfig>;
  costs: Partial<{
    dieUpgrade: Partial<CostsConfig['dieUpgrade']>;
    barracksExpand: Partial<CostsConfig['barracksExpand']>;
    cardKeep: Partial<CostsConfig['cardKeep']>;
  }>;
  factionWeights: FactionWeightsOverride;
}

const EMPTY_OVERRIDES: ConfigOverrides = {
  rules: {},
  costs: {},
  factionWeights: {},
};

interface ConfigStore {
  overrides: ConfigOverrides;
  setRuleOverride: <K extends keyof RulesConfig>(key: K, value: RulesConfig[K]) => void;
  setCostOverride: (
    section: keyof ConfigOverrides['costs'],
    field: 'iron' | 'gold' | 'essence',
    value: number,
  ) => void;
  setWeightOverride: (factionId: FactionId, field: keyof FactionWeights, value: number) => void;
  resetAll: () => void;
  resetRules: () => void;
  resetCosts: () => void;
  resetWeights: () => void;
}

export const useConfigStore = create<ConfigStore>()(
  persist(
    (set) => ({
      overrides: EMPTY_OVERRIDES,

      setRuleOverride: (key, value) =>
        set((s) => ({
          overrides: { ...s.overrides, rules: { ...s.overrides.rules, [key]: value } },
        })),

      setCostOverride: (section, field, value) =>
        set((s) => ({
          overrides: {
            ...s.overrides,
            costs: {
              ...s.overrides.costs,
              [section]: { ...(s.overrides.costs[section] ?? {}), [field]: value },
            },
          },
        })),

      setWeightOverride: (factionId, field, value) =>
        set((s) => ({
          overrides: {
            ...s.overrides,
            factionWeights: {
              ...s.overrides.factionWeights,
              [factionId]: {
                ...(s.overrides.factionWeights[factionId] ?? {}),
                [field]: value,
              },
            },
          },
        })),

      resetAll: () => set(() => ({ overrides: EMPTY_OVERRIDES })),
      resetRules: () => set((s) => ({ overrides: { ...s.overrides, rules: {} } })),
      resetCosts: () => set((s) => ({ overrides: { ...s.overrides, costs: {} } })),
      resetWeights: () => set((s) => ({ overrides: { ...s.overrides, factionWeights: {} } })),
    }),
    { name: 'iron-ash-config-v1' },
  ),
);
