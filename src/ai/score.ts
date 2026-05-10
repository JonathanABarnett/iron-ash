// scoreMove implementing the spec's pseudocode. Each move accumulates a
// raw score from heuristics, gets a faction-weight tilt, late-game / round-7
// boosts, and a risk discount. Difficulty-driven noise is applied later in
// decide.ts so the breakdown stays interpretable.

import type {
  CardDefinition,
  FactionId,
  GameState,
  Move,
  PlayerId,
  RoundGoalDefinition,
  SecretGoalDefinition,
} from '../engine/types';
import { weightsFor } from './personalities';
import {
  estimateDenialValue,
  estimateResourceGain,
  estimateVPGain,
  expectedLoss,
  roundGoalAlignment,
  secretGoalAlignment,
} from './heuristics';
import type { AIScoreBreakdown, ScoredCandidate } from './types';

export interface ScoreContext {
  state: GameState;
  playerId: PlayerId;
  factionId: FactionId;
  cards?: CardDefinition[];
  roundGoals: RoundGoalDefinition[];
  secretGoals: SecretGoalDefinition[];
}

const WEIGHTS = {
  vp: 1.0,
  resource: 0.6,
  denial: 0.4,
  roundGoal: 0.7,
  // secretGoalAlignment is multiplied by faction.weights.goalFocus, not a flat constant.
} as const;

export function scoreMove(move: Move, ctx: ScoreContext): ScoredCandidate {
  const { state, playerId, factionId, cards, roundGoals, secretGoals } = ctx;
  const w = weightsFor(factionId);

  const vpGain = estimateVPGain(move, state);
  const resourceGain = estimateResourceGain(move, state, cards);
  const denial = estimateDenialValue(move, state, playerId);
  const rga = roundGoalAlignment(move, state, playerId, roundGoals);
  const sga = secretGoalAlignment(move, state, playerId, secretGoals);

  let score =
    vpGain * WEIGHTS.vp +
    resourceGain * WEIGHTS.resource +
    denial * WEIGHTS.denial +
    rga * WEIGHTS.roundGoal +
    sga * w.goalFocus;

  let factionTilt = 1;
  if (move.kind === 'place' || move.kind === 'combine') {
    const r = state.regionDefs[move.regionId];
    if (r?.isFortress) factionTilt *= 1 + w.fortressPriority;
  }
  if (move.kind === 'battle') factionTilt *= 1 + w.battlePriority;
  if (move.kind === 'draft-card' || move.kind === 'play-card') {
    factionTilt *= 1 + w.enginePriority;
  }
  if (move.kind === 'combine') factionTilt *= 1 + w.combinationAffinity;
  if (move.kind === 'hire-merc') factionTilt *= 1 + w.mercenaryAffinity;

  const tiltedScore = score * factionTilt;

  // Late-game tilt: round >= 5 boosts VP-relevant scores.
  let lateGameBoost = 0;
  if (state.round >= 5) lateGameBoost = vpGain * 0.5;

  // Round-7 free-for-all extra: merc hires especially valuable.
  let freeForAllBoost = 0;
  if (state.freeForAll && move.kind === 'hire-merc') {
    freeForAllBoost = tiltedScore * 0.5;
  }

  const loss = expectedLoss(move, state);
  const riskDiscount = -loss * (1 - w.riskTolerance);

  const finalScore = tiltedScore + lateGameBoost + freeForAllBoost + riskDiscount;

  const breakdown: AIScoreBreakdown = {
    vpGain,
    resourceGain,
    denial,
    roundGoalAlignment: rga,
    secretGoalAlignment: sga,
    factionTilt,
    lateGameBoost,
    freeForAllBoost,
    riskDiscount,
    noise: 0,
  };

  return { move, score: finalScore, breakdown };
}
