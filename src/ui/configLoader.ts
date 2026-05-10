// Browser-side config loader. Vite imports JSON natively; run them through
// the engine schemas so a malformed config fails loudly the first time you
// open the app rather than mid-sim.

import {
  parseCards,
  parseFactions,
  parseRegions,
  parseRoundGoals,
  parseRules,
  parseSecretGoals,
} from '@engine/config-loader';
import factionsJson from '@config/factions.json';
import regionsJson from '@config/regions.json';
import rulesJson from '@config/rules.json';
import roundGoalsJson from '@config/round-goals.json';
import secretGoalsJson from '@config/secret-goals.json';
import cardsJson from '@config/cards.json';
import type { SimConfigs } from '@simulation/types';

export function loadConfigs(): SimConfigs {
  return {
    factions: parseFactions(factionsJson),
    regions: parseRegions(regionsJson),
    rules: parseRules(rulesJson),
    roundGoals: parseRoundGoals(roundGoalsJson),
    secretGoals: parseSecretGoals(secretGoalsJson),
    cards: parseCards(cardsJson),
  };
}
