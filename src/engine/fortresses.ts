// Fortress garrison + usurp helpers. Phase 2A:
// - Placing on a fortress garrisons (dice persist across rounds, no return).
// - If a different player already garrisons, you must usurp: incoming sum
//   must exceed current garrison sum + 1. Defender keeps a +1 implicit bonus.
// - Successful usurp returns defender's dice to barracks (face values cleared).

import type { Die, GameState, Player, PlayerId, RegionId } from './types';

export function garrisonSum(state: GameState, regionId: RegionId): number {
  const rt = state.regions[regionId];
  if (!rt) return 0;
  let sum = 0;
  for (const id of rt.garrisonedDieIds) {
    for (const player of Object.values(state.players)) {
      const die = player.dice.find((d) => d.id === id);
      if (die?.faceValue !== null && die?.faceValue !== undefined) {
        sum += die.faceValue;
        break;
      }
    }
  }
  return sum;
}

/** Total face value of a placement (single die or pair). */
export function placementSum(dice: Die[]): number {
  let sum = 0;
  for (const die of dice) {
    if (die.faceValue !== null) sum += die.faceValue;
  }
  return sum;
}

/** Can `attacker` garrison or usurp this fortress with the given placement value? */
export function canGarrisonOrUsurp(
  state: GameState,
  regionId: RegionId,
  attackerId: PlayerId,
  attackerSum: number,
): { ok: boolean; usurp: boolean } {
  const rt = state.regions[regionId];
  if (!rt) return { ok: false, usurp: false };
  const owner = rt.garrisonOwnerId;
  if (!owner || owner === attackerId) return { ok: true, usurp: false };
  const defenderSum = garrisonSum(state, regionId);
  return { ok: attackerSum > defenderSum + 1, usurp: true };
}

/**
 * Mutate draft GameState: move attacker dice to garrison, evict defender dice if usurping.
 * Returns the previous garrison owner if a usurp happened (caller may want to log it).
 */
export function applyGarrison(
  draft: GameState,
  regionId: RegionId,
  attackerId: PlayerId,
  attackerDieIds: readonly string[],
): { usurpedFrom?: PlayerId } {
  const rt = draft.regions[regionId];
  if (!rt) throw new Error(`Unknown region ${regionId}`);
  const previousOwner = rt.garrisonOwnerId;
  const usurped = previousOwner && previousOwner !== attackerId;

  if (usurped) {
    // Evict defender dice back to barracks.
    const defender = draft.players[previousOwner];
    if (defender) {
      for (const id of rt.garrisonedDieIds) {
        const die = defender.dice.find((d) => d.id === id);
        if (die) {
          die.location = { kind: 'barracks' };
          die.faceValue = null;
        }
      }
    }
    rt.garrisonedDieIds = [];
    rt.heldRounds = 0;
  }

  // Move attacker dice into garrison.
  const attacker = draft.players[attackerId];
  if (!attacker) throw new Error(`Unknown player ${attackerId}`);
  for (const id of attackerDieIds) {
    const die = attacker.dice.find((d) => d.id === id);
    if (!die) throw new Error(`Die ${id} not on player ${attackerId}`);
    die.location = { kind: 'garrison', regionId };
  }
  rt.garrisonedDieIds.push(...attackerDieIds);
  rt.garrisonOwnerId = attackerId;

  // Update goal-progress max-fortresses-simultaneous for attacker.
  const fortressCount = Object.values(draft.regions).filter(
    (r) => r.garrisonOwnerId === attackerId,
  ).length;
  if (fortressCount > attacker.progress.maxFortressesSimultaneous) {
    attacker.progress.maxFortressesSimultaneous = fortressCount;
  }

  return usurped ? { usurpedFrom: previousOwner } : {};
}

/** True if `player` currently garrisons the named fortress. */
export function ownsFortress(state: GameState, player: Player, regionId: RegionId): boolean {
  const rt = state.regions[regionId];
  return rt?.garrisonOwnerId === player.id;
}
