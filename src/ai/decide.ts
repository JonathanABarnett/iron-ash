// decide.pickMove — orchestrates enumerate -> score -> noise -> pick + log.
// Used by the simulation runner and (in Phase 5) the UI.

import type {
  AIReasoning,
  CardDefinition,
  CostsConfig,
  GameState,
  Move,
  RoundGoalDefinition,
  RulesConfig,
  SecretGoalDefinition,
} from '../engine/types';
import { enumerate } from '../engine/moves';
import type { Rng } from '../engine/rng';
import { scoreMove } from './score';
import { applyNoise } from './difficulty';
import type { Difficulty, ScoredCandidate } from './types';
import { REASONING_TOP_N } from './types';

export interface DecideContext {
  rules: RulesConfig;
  cards?: CardDefinition[];
  costs?: CostsConfig;
  roundGoals: RoundGoalDefinition[];
  secretGoals: SecretGoalDefinition[];
  rng: Rng;
  difficulty: Difficulty;
}

export interface DecideResult {
  move: Move;
  reasoning: AIReasoning;
}

export function pickMove(state: GameState, ctx: DecideContext): DecideResult {
  const moveCtx = {
    rules: ctx.rules,
    rng: ctx.rng,
    ...(ctx.cards ? { cards: ctx.cards } : {}),
    ...(ctx.costs ? { costs: ctx.costs } : {}),
  };
  const moves = enumerate(state, moveCtx);
  if (moves.length === 0) {
    return {
      move: { kind: 'pass' },
      reasoning: { candidates: [], noiseApplied: 0 },
    };
  }

  // Hard difficulty considers secret goals; Easy ignores them per spec.
  const goals = ctx.difficulty === 'easy' ? [] : ctx.secretGoals;

  const playerId = state.activePlayerId;
  const factionId = state.players[playerId]!.factionId;

  const scoreCtxBase = {
    state,
    playerId,
    factionId,
    roundGoals: ctx.roundGoals,
    secretGoals: goals,
    rules: ctx.rules,
  };
  let scored: ScoredCandidate[] = moves.map((m) =>
    scoreMove(m, ctx.cards ? { ...scoreCtxBase, cards: ctx.cards } : scoreCtxBase),
  );

  scored = applyNoise(scored, ctx.difficulty, ctx.rng);

  // Pick the highest score; ties broken by RNG.
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]!;
  const tied = scored.filter((c) => c.score === top.score);
  const chosen = tied.length > 1 ? ctx.rng.pick(tied) : top;

  const reasoning: AIReasoning = {
    candidates: scored.slice(0, REASONING_TOP_N).map((c) => ({
      move: c.move,
      score: Number(c.score.toFixed(3)),
      breakdown: {
        vpGain: c.breakdown.vpGain,
        resourceGain: c.breakdown.resourceGain,
        denial: c.breakdown.denial,
        roundGoalAlignment: c.breakdown.roundGoalAlignment,
        secretGoalAlignment: c.breakdown.secretGoalAlignment,
        factionTilt: c.breakdown.factionTilt,
        lateGameBoost: c.breakdown.lateGameBoost,
        freeForAllBoost: c.breakdown.freeForAllBoost,
        riskDiscount: c.breakdown.riskDiscount,
        noise: c.breakdown.noise,
      },
    })),
    noiseApplied: scored.reduce((acc, c) => acc + Math.abs(c.breakdown.noise), 0) / scored.length,
  };

  return { move: chosen.move, reasoning };
}
