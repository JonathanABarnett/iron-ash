// Simulation runner types.

import type {
  CardDefinition,
  CostsConfig,
  FactionDefinition,
  FactionId,
  Region,
  RoundGoalDefinition,
  RulesConfig,
  SecretGoalDefinition,
  StructureDefinition,
} from '../engine/types';
import type { FactionWeights } from '../ai/types';
import type { Difficulty } from '../ai/types';

export interface SimConfigs {
  factions: FactionDefinition[];
  regions: Region[];
  rules: RulesConfig;
  roundGoals: RoundGoalDefinition[];
  secretGoals: SecretGoalDefinition[];
  cards: CardDefinition[];
  costs: CostsConfig;
  structures: StructureDefinition[];
  /** Optional per-faction AI personality overrides. Absent keys use defaults from personalities.ts. */
  factionWeightOverrides?: Partial<Record<FactionId, Partial<FactionWeights>>> | undefined;
}

export type LineupMode = 'random' | 'fixed-rotate' | 'all-combinations';

export interface RunOptions {
  numGames: number;
  difficulty: Difficulty;
  seed: string;
  /** How to pick player factions per game. */
  lineupMode?: LineupMode;
  /** Used when lineupMode === 'fixed-rotate'; rotated each game. */
  fixedLineup?: FactionId[];
  configs: SimConfigs;
}

export interface FactionStats {
  factionId: FactionId;
  winRate: number;
  avgVP: number;
  playCount: number;
  /** Approximate breakdown of where their VP came from (averaged). */
  vpSources: {
    roundGoalsAndFortressPerRound: number;
    regionControl: number;
    fortressEndGame: number;
    fullBarracksBonus: number;
    secretGoals: number;
    bothSecretGoalsBonus: number;
  };
}

export interface RulePressure {
  /** Fraction of fortress regions that changed garrison ownership at least once across all games. */
  fortressTurnoverRate: number;
  /** Mercenary hires per turn where the active player could afford one. */
  mercenaryHireRate: number;
  /** Specialist claim rate per round (length === rules.totalRounds; null where no games reached). */
  specialistClaimByRound: Array<number | null>;
  /** Combine actions per total move actions. */
  combineActionRate: number;
  /** Fraction of games that reached round 7. */
  round7ReachRate: number;
  /** Average game length in rounds. */
  avgGameLength: number;
}

export interface SimulationResult {
  simulationId: string;
  gamesRun: number;
  difficulty: Difficulty;
  seed: string;
  startedAt: string;
  elapsedMs: number;
  factionStats: Record<FactionId, FactionStats>;
  rulePressure: RulePressure;
  warnings: string[];
}
