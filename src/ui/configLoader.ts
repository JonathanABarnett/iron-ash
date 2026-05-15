// Browser-side config loader. Vite imports JSON natively; run them through
// the engine schemas so a malformed config fails loudly the first time you
// open the app rather than mid-sim.

import {
  parseCards,
  parseCosts,
  parseFactions,
  parseRegions,
  parseRoundGoals,
  parseRules,
  parseSecretGoals,
  parseStructures,
} from '@engine/config-loader';
import factionsJson from '@config/factions.json';
import regionsJson from '@config/regions.json';
import rulesJson from '@config/rules.json';
import roundGoalsJson from '@config/round-goals.json';
import secretGoalsJson from '@config/secret-goals.json';
import cardsJson from '@config/cards.json';
import costsJson from '@config/costs.json';
import structuresJson from '@config/structures.json';
import type { CostsConfig } from '@engine/types';
import type { SimConfigs } from '@simulation/types';

export type AppConfigs = SimConfigs;

export function loadConfigs(overrides?: {
  rules?: Partial<import('@engine/types').RulesConfig>;
  costs?: Partial<{
    dieUpgrade?: Partial<CostsConfig['dieUpgrade']>;
    barracksExpand?: Partial<CostsConfig['barracksExpand']>;
    cardKeep?: Partial<CostsConfig['cardKeep']>;
  }>;
  factionWeightOverrides?: SimConfigs['factionWeightOverrides'];
}): AppConfigs {
  const baseRules = parseRules(rulesJson);
  const baseCosts = parseCosts(costsJson);

  const rules = overrides?.rules
    ? { ...baseRules, ...overrides.rules }
    : baseRules;

  const costs: CostsConfig = {
    dieUpgrade: { ...baseCosts.dieUpgrade, ...(overrides?.costs?.dieUpgrade ?? {}) },
    barracksExpand: { ...baseCosts.barracksExpand, ...(overrides?.costs?.barracksExpand ?? {}) },
    cardKeep: { ...baseCosts.cardKeep, ...(overrides?.costs?.cardKeep ?? {}) },
  };

  return {
    factions: parseFactions(factionsJson),
    regions: parseRegions(regionsJson),
    rules,
    roundGoals: parseRoundGoals(roundGoalsJson),
    secretGoals: parseSecretGoals(secretGoalsJson),
    cards: parseCards(cardsJson),
    costs,
    structures: parseStructures(structuresJson),
    ...(overrides?.factionWeightOverrides
      ? { factionWeightOverrides: overrides.factionWeightOverrides }
      : {}),
  };
}
