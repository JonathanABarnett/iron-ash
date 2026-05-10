// Mercenary pool: Low/High dice rerolled each round, Specialist on a fixed
// per-round countdown. Hiring costs 3 gold (waived during round-7 free-for-all).
// Merc dice sit in the hirer's barracks for ONE round; whether used or not
// they leave the game at end of round. Unused merc dice refund their cost.

import { produce } from 'immer';
import type { Die, GameState, MercSource, PlayerId, RulesConfig } from './types';
import { Rng, makeIdFactory } from './rng';
import { rollDie } from './dice';
import { getMercDiscount } from './factions/abilities';

export const DEFAULT_MERC_COST = 3;

/**
 * Cost to hire any merc, given the active rules and an optional hirer id
 * (for faction-specific discounts e.g. Warriors -1 gold).
 */
export function mercCost(
  state: GameState,
  rules: RulesConfig,
  hirerId?: PlayerId,
): number {
  if (state.freeForAll && rules.freeForAllToggles.allMercsFree) return 0;
  let cost = DEFAULT_MERC_COST;
  if (hirerId) {
    const player = state.players[hirerId];
    if (player) cost = Math.max(0, cost - getMercDiscount(player.factionId, hirerId));
  }
  return cost;
}

/** Specialist value for the active round, applying free-for-all "any value" if enabled. */
export function specialistOfferValue(state: GameState, rules: RulesConfig): number {
  if (state.freeForAll && rules.freeForAllToggles.specialistChoosable) {
    // For random AI we just hand it the current value; actual UI/AI in Phase 3
    // can pick anything 1-6. Tests verify this hook exists.
    return state.mercs.specialistValue;
  }
  return state.mercs.specialistValue;
}

/** Refresh all three merc dice for the new round. Call after rolling barracks. */
export function refreshMercPool(state: GameState, rng: Rng): GameState {
  const dieId = makeIdFactory(rng, `merc-r${state.round}`);
  return produce(state, (draft) => {
    const lowDie: Die = {
      id: dieId(),
      range: '1-3',
      faceValue: null,
      ownerId: '__pool__',
      location: { kind: 'barracks' },
      mercSource: 'low',
    };
    const highDie: Die = {
      id: dieId(),
      range: '3-6',
      faceValue: null,
      ownerId: '__pool__',
      location: { kind: 'barracks' },
      mercSource: 'high',
    };
    const specialistDie: Die = {
      id: dieId(),
      range: '1-6',
      faceValue: draft.mercs.specialistValue,
      ownerId: '__pool__',
      location: { kind: 'barracks' },
      mercSource: 'specialist',
    };
    draft.mercs.low = rollDie(lowDie, rng);
    draft.mercs.high = rollDie(highDie, rng);
    draft.mercs.specialist = specialistDie;
    draft.mercs.claimed = {};
  });
}

/** Whether a slot is currently available to hire. */
export function isSlotAvailable(state: GameState, slot: MercSource): boolean {
  if (state.mercs.claimed[slot]) return false;
  return state.mercs[slot] !== null;
}

/** Apply a hire-merc action: spend gold, transfer die into hirer's barracks. */
export function applyHireMerc(
  state: GameState,
  hirerId: string,
  slot: MercSource,
  rules: RulesConfig,
): GameState {
  if (!isSlotAvailable(state, slot)) {
    throw new Error(`Mercenary slot ${slot} not available`);
  }
  const cost = mercCost(state, rules, hirerId);
  const hirer = state.players[hirerId];
  if (!hirer) throw new Error(`Unknown player ${hirerId}`);
  if (hirer.resources.gold < cost) {
    throw new Error(`Insufficient gold to hire ${slot} (need ${cost}, has ${hirer.resources.gold})`);
  }

  return produce(state, (draft) => {
    const drafted = draft.players[hirerId]!;
    drafted.resources.gold -= cost;

    const fromPool =
      slot === 'low' ? draft.mercs.low : slot === 'high' ? draft.mercs.high : draft.mercs.specialist;
    if (!fromPool) throw new Error(`Pool slot ${slot} empty`);

    const claimed: Die = {
      ...fromPool,
      ownerId: hirerId,
      mercCost: cost,
    };

    if (slot === 'low') draft.mercs.low = null;
    else if (slot === 'high') draft.mercs.high = null;
    else draft.mercs.specialist = null;

    drafted.dice.push(claimed);
    drafted.progress.mercsHiredThisGame += 1;
    draft.mercs.claimed[slot] = hirerId;
  });
}

/**
 * End-of-round merc cleanup: remove all merc dice from players' rosters and
 * regions; refund cost for any merc die still in barracks (= unused). Returns
 * a new state and reports refunded gold per player for diagnostics.
 */
export function clearMercDicePostRound(state: GameState): GameState {
  return produce(state, (draft) => {
    for (const player of Object.values(draft.players)) {
      const survivors: Die[] = [];
      for (const die of player.dice) {
        if (!die.mercSource) {
          survivors.push(die);
          continue;
        }
        // Refund if unused (still in barracks).
        if (die.location.kind === 'barracks') {
          const refund = die.mercCost ?? 0;
          player.resources.gold += refund;
        }
      }
      player.dice = survivors;
    }
    // Strip any merc-die ids that may have ended up on a region or in a garrison.
    for (const rt of Object.values(draft.regions)) {
      rt.placedDieIds = rt.placedDieIds.filter((id) => !id.startsWith('merc-'));
      rt.garrisonedDieIds = rt.garrisonedDieIds.filter((id) => !id.startsWith('merc-'));
      if (rt.garrisonedDieIds.length === 0 && rt.garrisonOwnerId) {
        // Garrison wiped because only merc dice were holding it.
        rt.garrisonOwnerId = undefined;
        rt.heldRounds = 0;
      }
    }
    // Clear pool: unused pool dice just disappear.
    draft.mercs.low = null;
    draft.mercs.high = null;
    draft.mercs.specialist = null;
    draft.mercs.claimed = {};
  });
}
