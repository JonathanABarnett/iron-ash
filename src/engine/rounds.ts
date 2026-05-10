// Round / turn loop: roll phase, action phase, end-of-round resolution.
// Phase 1 end-of-round: dice return to barracks, advance round counter, no scoring yet.

import { produce } from 'immer';
import { rollBarracksDice } from './dice';
import type { GameState, RulesConfig } from './types';
import { Rng } from './rng';

/** Round ends when every player has either passed or has no placeable barracks dice. */
export function isRoundOver(state: GameState): boolean {
  return Object.values(state.players).every((p) => {
    if (p.passedThisRound) return true;
    return p.dice.every((d) => d.location.kind !== 'barracks' || d.faceValue === null);
  });
}

/** Run the simultaneous roll phase. Mutates RNG state via the passed-in Rng. */
export function rollPhase(state: GameState, rng: Rng): GameState {
  return produce(state, (draft) => {
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
    draft.rngState = JSON.stringify(rng.snapshot());
  });
}

/** Phase 1 end-of-round: dice return to barracks; round advances. */
export function endOfRound(state: GameState, rules: RulesConfig): GameState {
  const next = produce(state, (draft) => {
    draft.phase = 'end-of-round';
    draft.log.push({
      round: draft.round,
      turn: draft.turn,
      playerId: draft.activePlayerId,
      event: { kind: 'end-of-round' },
    });

    // Return all non-garrisoned dice to barracks; clear region placements.
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
      // garrisoned dice stay; bump heldRounds (Phase 2 fortress VP uses this)
      if (rt.garrisonedDieIds.length > 0) rt.heldRounds += 1;
    }

    if (draft.round >= rules.totalRounds) {
      draft.phase = 'finished';
    } else {
      draft.round += 1;
      draft.freeForAll = draft.round === rules.freeForAllRound;
      draft.phase = 'roll';
      draft.turn = 0;
      draft.activePlayerId = draft.turnOrder[0]!;
      // Bump specialist value if sequence has more entries (1-indexed by round).
      const idx = draft.round - 1;
      if (idx < rules.specialistSequence.length) {
        const v = rules.specialistSequence[idx];
        if (v !== undefined) draft.mercs.specialistValue = v;
      }
    }
  });
  return next;
}
