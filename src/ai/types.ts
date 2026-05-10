// AI types: faction personality weights, difficulty levels, scoring breakdown.

import type { FactionId, Move } from '../engine/types';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface FactionWeights {
  /** How much they value fortress holding. */
  fortressPriority: number;
  /** How aggressive in PvP battles. */
  battlePriority: number;
  /** How much they invest in long-term engine plays (cards, hiring, building). */
  enginePriority: number;
  /** Save vs spend tendency (higher = save). */
  resourceHoarding: number;
  /** Willingness to gamble bad rolls. */
  riskTolerance: number;
  /** How much they pursue secret goals. */
  goalFocus: number;
  /** Likelihood to combine dice. */
  combinationAffinity: number;
  /** Likelihood to spend turns hiring mercs. */
  mercenaryAffinity: number;
}

export type FactionWeightsTable = Record<FactionId, FactionWeights>;

/** Top-N candidate breakdown attached to GameState.log entries. */
export interface AIScoreBreakdown {
  vpGain: number;
  resourceGain: number;
  denial: number;
  roundGoalAlignment: number;
  secretGoalAlignment: number;
  /** Multiplicative tilt from faction weights for the move kind. */
  factionTilt: number;
  /** Late-game bonus (round >= 5) added to VP. */
  lateGameBoost: number;
  /** Round-7 free-for-all extra factor for hire-merc. */
  freeForAllBoost: number;
  /** Risk discount: -expectedLoss * (1 - riskTolerance). */
  riskDiscount: number;
  /** Difficulty-driven noise applied. */
  noise: number;
}

export interface ScoredCandidate {
  move: Move;
  score: number;
  breakdown: AIScoreBreakdown;
}

export interface PickMoveOptions {
  difficulty: Difficulty;
}

/** How much randomness to inject for each difficulty (0..1 fraction of |score|). */
export const DIFFICULTY_NOISE: Record<Difficulty, number> = {
  easy: 0.3,
  medium: 0.1,
  hard: 0.03,
};

/** How many top candidates we keep in the AI reasoning log. */
export const REASONING_TOP_N = 5;
