// Mercenary pool: Low (1-3) and High (3-6) dice rerolled each round.
// Specialist: fixed face-value per the specialistSequence countdown, 1-6 range.
// Standard hire cost: 3 gold (waived in round-7 free-for-all when allMercsFree).
// Unused merc dice are removed at end of round and refund their cost.
//
// SPECIAL COSTS (all deterministic, no UI prompts needed):
//   Specialist round 1 → 2 gold (discount encourages early contesting of value-6 die)
//   Warriors           → −1 gold on all mercs (mercDiscount: 1)
//   Assassins          → Low merc costs 2 gold, not 3 (First Refusal passive)
//
// FACTION MERC RELATIONSHIPS (passive bonuses, fire automatically on hire or EOR):
//   Assassins     First Refusal    — Low merc costs 2 gold (−1 off)
//   Mages         Arcane Analysis  — hired Low/High merc die is set to its MAX face (NOT random reroll)
//   Necromancers  Soul Conversion  — used (placed/garrisoned) merc dice become permanent at EOR
//   Merchants     Trade Commission — hiring any merc yields +1 essence

import { produce } from 'immer';
import type { Die, GameState, MercSource, PlayerId, RulesConfig } from './types';
import { Rng, makeIdFactory } from './rng';
import { rollDie } from './dice';
import { getMercDiscount } from './factions/abilities';

export const DEFAULT_MERC_COST = 3;

/**
 * Cost to hire a specific merc slot, given the active rules, an optional hirer
 * id (for faction-specific discounts), and optionally which slot.
 *
 * Faction specials:
 *   Warriors   — general -1 discount on all mercs (existing)
 *   Assassins  — Low merc is free (0 gold); other slots at normal cost
 */
export function mercCost(
  state: GameState,
  rules: RulesConfig,
  hirerId?: PlayerId,
  slot?: MercSource,
): number {
  if (state.freeForAll && rules.freeForAllToggles.allMercsFree) return 0;

  // Base cost: 3 gold default, 2 gold for Specialist in rounds 1-2 (encourages
  // early contesting of the high-value Specialist die — R2 claim rate target ≥40%).
  let cost = DEFAULT_MERC_COST;
  if (slot === 'specialist' && state.round <= 2) cost = 2;

  // Faction-specific special cases that REPLACE the base cost
  if (hirerId && slot === 'low') {
    const player = state.players[hirerId];
    if (player?.factionId === 'assassins') cost = Math.min(cost, 2); // First Refusal
  }

  // Stacking: faction mercDiscount (-1 for Warriors / Necromancers) applies to
  // every slot AFTER the base/special cost is set. Min 0.
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

/**
 * Apply a hire-merc action: spend gold, transfer die into hirer's barracks.
 * Pass `rng` to enable Mages' reroll-on-hire faction perk.
 */
export function applyHireMerc(
  state: GameState,
  hirerId: string,
  slot: MercSource,
  rules: RulesConfig,
  _rng?: Rng,
): GameState {
  if (!isSlotAvailable(state, slot)) {
    throw new Error(`Mercenary slot ${slot} not available`);
  }
  const cost = mercCost(state, rules, hirerId, slot);
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

    let claimed: Die = {
      ...fromPool,
      ownerId: hirerId,
      mercCost: cost,
    };

    // Mages: Arcane Analysis — set the hired die to its maximum face value
    // (deterministic peak value, giving Mages precise die control over mercs).
    if (drafted.factionId === 'mages' && slot !== 'specialist' && claimed.faceValue !== null) {
      const maxByRange: Record<string, number> = { '1-3': 3, '2-5': 5, '3-6': 6, '1-6': 6 };
      const peak = maxByRange[claimed.range];
      if (peak !== undefined) claimed = { ...claimed, faceValue: peak };
    }

    if (slot === 'low') draft.mercs.low = null;
    else if (slot === 'high') draft.mercs.high = null;
    else draft.mercs.specialist = null;

    drafted.dice.push(claimed);
    drafted.progress.mercsHiredThisGame += 1;
    draft.mercs.claimed[slot] = hirerId;
    // Track specialist hires in a compact, non-prunable log for sim balance metrics.
    if (slot === 'specialist') {
      draft.mercHireLog.push({ round: state.round, slot, hirerId });
    }

    // Merchants: Trade Commission — hiring a merc yields 1 essence (profitable contract).
    if (drafted.factionId === 'merchants') {
      drafted.resources.essence = Math.min(drafted.resources.essence + 1, 8);
    }
  });
}

/**
 * End-of-round merc cleanup: remove all merc dice from players' rosters and
 * regions; refund cost for any merc die still in barracks (= unused).
 *
 * Faction merc bonuses applied here:
 *   Necromancers — used merc dice (placed/garrisoned) become permanent barracks
 *                  dice instead of disappearing (Soul Conversion passive).
 *   Merchants    — garrisoned merc dice become permanent garrison dice instead
 *                  of disappearing (Free Company passive).
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
        const used = die.location.kind !== 'barracks';

        // (Merchants' merc perk is handled at hire time — no end-of-round special.)

        // Necromancers: convert used merc dice to permanent barracks dice.
        if (player.factionId === 'necromancers' && used) {
          // Return to barracks (face cleared for next round's roll).
          survivors.push({
            ...die,
            mercSource: undefined,
            mercCost: undefined,
            location: { kind: 'barracks' },
            faceValue: null,
          });
          continue;
        }

        // Default: discard. Refund if unused (still in barracks).
        if (!used) {
          const refund = die.mercCost ?? 0;
          player.resources.gold += refund;
        }
      }
      player.dice = survivors;
    }
    // Strip any remaining merc-die ids from region placements and garrisons.
    for (const rt of Object.values(draft.regions)) {
      rt.placedDieIds = rt.placedDieIds.filter((id) => !id.startsWith('merc-'));
      const hadGarrison = rt.garrisonedDieIds.length > 0;
      rt.garrisonedDieIds = rt.garrisonedDieIds.filter((id) => !id.startsWith('merc-'));
      if (hadGarrison && rt.garrisonedDieIds.length === 0 && rt.garrisonOwnerId) {
        // Garrison wiped because only merc dice were holding it.
        rt.garrisonOwnerId = undefined;
        rt.heldRounds = 0;
      }
    }
    // Clear pool: unused pool dice disappear.
    draft.mercs.low = null;
    draft.mercs.high = null;
    draft.mercs.specialist = null;
    draft.mercs.claimed = {};
  });
}
