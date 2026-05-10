// Round / turn loop: roll phase, action phase, end-of-round resolution.
// Phase 2 end-of-round: score round goal, fortress per-round VP, threat track,
// dice return to barracks, possibly end the game.

import { produce } from 'immer';
import { rollBarracksDice } from './dice';
import type {
  GameState,
  RoundGoalDefinition,
  RulesConfig,
  SecretGoalDefinition,
} from './types';
import { Rng } from './rng';
import {
  computeEndGameScore,
  scoreFortressPerRound,
  scoreRoundGoal,
} from './scoring';
import { clearMercDicePostRound, refreshMercPool } from './mercenaries';
import { endOfRoundHandCleanup, refreshMarket } from './cards';
import type { CardDefinition } from './types';

/** Round ends when every player has either passed or has no placeable barracks dice. */
export function isRoundOver(state: GameState): boolean {
  return Object.values(state.players).every((p) => {
    if (p.passedThisRound) return true;
    return p.dice.every((d) => d.location.kind !== 'barracks' || d.faceValue === null);
  });
}

export interface RollPhaseContext {
  rng: Rng;
  cards?: CardDefinition[];
}

/** Run the simultaneous roll phase + refresh the merc pool + market. */
export function rollPhase(state: GameState, ctxOrRng: RollPhaseContext | Rng): GameState {
  const ctx: RollPhaseContext = ctxOrRng instanceof Rng ? { rng: ctxOrRng } : ctxOrRng;
  const { rng, cards } = ctx;
  let next = produce(state, (draft) => {
    for (const playerId of draft.turnOrder) {
      const player = draft.players[playerId]!;
      player.dice = rollBarracksDice(player.dice, rng);
    }
    draft.phase = 'action';
    draft.turn = 1;
    draft.activePlayerId = draft.turnOrder[0]!;
    draft.log.push({
      round: draft.round,
      turn: 0,
      playerId: draft.turnOrder[0]!,
      event: { kind: 'roll' },
    });
  });
  next = refreshMercPool(next, rng);
  if (cards) next = refreshMarket(next, cards, rng);
  return produce(next, (draft) => {
    draft.rngState = JSON.stringify(rng.snapshot());
  });
}

export interface EndOfRoundContext {
  rules: RulesConfig;
  roundGoals: RoundGoalDefinition[];
  secretGoals: SecretGoalDefinition[];
}

/** End-of-round: score, advance threat track, possibly end game. */
export function endOfRound(state: GameState, ctx: EndOfRoundContext): GameState {
  const { rules, roundGoals, secretGoals } = ctx;

  // 1) Score the current round's goal, if assigned.
  let next = state;
  const slot = next.roundGoals.find((s) => s.forRound === next.round);
  if (slot) {
    const goalDef = roundGoals.find((g) => g.id === slot.goalId);
    if (goalDef) next = scoreRoundGoal(next, goalDef);
  }

  // 2) Per-round fortress VP for garrison holders.
  next = scoreFortressPerRound(next);

  // 3) Clean up merc dice (refunds unused) before regular dice return.
  next = clearMercDicePostRound(next);

  // 3b) Hand cleanup: keep up to HAND_LIMIT, discard the rest.
  next = endOfRoundHandCleanup(next);

  // 4) Mark phase, log, return dice, reset passed, advance threat track, maybe end.
  next = produce(next, (draft) => {
    draft.phase = 'end-of-round';
    draft.log.push({
      round: draft.round,
      turn: draft.turn,
      playerId: draft.activePlayerId,
      event: { kind: 'end-of-round' },
    });

    // Update goal progress: max-dice-placed-at-round-end (counts deployed dice).
    for (const player of Object.values(draft.players)) {
      const placed = player.dice.filter((d) => d.location.kind !== 'barracks').length;
      if (placed > player.progress.maxDicePlacedAtRoundEnd) {
        player.progress.maxDicePlacedAtRoundEnd = placed;
      }
    }

    // Return non-garrisoned dice to barracks; clear region placements.
    for (const player of Object.values(draft.players)) {
      for (const die of player.dice) {
        if (die.location.kind === 'region') {
          die.location = { kind: 'barracks' };
          die.faceValue = null;
        }
      }
      player.passedThisRound = false;
    }
    for (const rt of Object.values(draft.regions)) {
      rt.placedDieIds = [];
      if (rt.garrisonedDieIds.length > 0) rt.heldRounds += 1;
    }

    // Threat track always ticks; faction abilities can push more in later phases.
    draft.threatTrack += 1;
    const reachedThreshold = draft.threatTrack >= rules.threatTrackThreshold;
    const lastRound = draft.round >= rules.totalRounds;

    if (lastRound || reachedThreshold) {
      draft.phase = 'finished';
      draft.scoreBreakdown = computeEndGameScore(draft, secretGoals);
      draft.winnerId = draft.scoreBreakdown.winnerId;
    } else {
      draft.round += 1;
      draft.freeForAll = draft.round === rules.freeForAllRound;
      draft.phase = 'roll';
      draft.turn = 0;
      draft.activePlayerId = draft.turnOrder[0]!;
      const idx = draft.round - 1;
      if (idx < rules.specialistSequence.length) {
        const v = rules.specialistSequence[idx];
        if (v !== undefined) draft.mercs.specialistValue = v;
      }
    }
  });
  return next;
}
