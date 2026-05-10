// Battle resolution: attacker commits a barracks die against a non-fortress
// region containing one or more enemy placed dice. Defender gets an implicit
// +1 bonus (per spec). Winner: attacker if attackerValue > defenderSum + 1.
// Loser's dice return to barracks. Each battle ticks the threat track by 1.

import { produce } from 'immer';
import type { Die, GameState, PlayerId, RegionId } from './types';

/** Sum of face values of dice on the region NOT owned by the attacker. */
export function defenderSum(state: GameState, regionId: RegionId, attackerId: PlayerId): number {
  const rt = state.regions[regionId];
  if (!rt) return 0;
  let sum = 0;
  for (const id of rt.placedDieIds) {
    for (const player of Object.values(state.players)) {
      if (player.id === attackerId) continue;
      const die = player.dice.find((d) => d.id === id);
      if (die?.faceValue !== null && die?.faceValue !== undefined) {
        sum += die.faceValue;
        break;
      }
    }
  }
  return sum;
}

/** True if region has at least one die owned by a different player. */
export function hasEnemyDefender(
  state: GameState,
  regionId: RegionId,
  attackerId: PlayerId,
): boolean {
  const rt = state.regions[regionId];
  if (!rt) return false;
  for (const id of rt.placedDieIds) {
    for (const player of Object.values(state.players)) {
      if (player.id === attackerId) continue;
      if (player.dice.some((d) => d.id === id)) return true;
    }
  }
  return false;
}

/** Can `attacker` initiate a battle on this region with `attackerDie`? */
export function canBattle(state: GameState, attackerDie: Die, regionId: RegionId): boolean {
  const region = state.regionDefs[regionId];
  if (!region) return false;
  if (region.isFortress) return false; // fortress combat handled by usurp logic
  if (attackerDie.location.kind !== 'barracks') return false;
  if (attackerDie.faceValue === null) return false;
  return hasEnemyDefender(state, regionId, attackerDie.ownerId);
}

export interface BattleResult {
  attackerWon: boolean;
  attackerValue: number;
  defenderSum: number;
}

/**
 * Apply a battle. Returns new state and the result for logging.
 * Attacker spends their die regardless of outcome (loser's dice go to
 * barracks with face cleared).
 */
export function applyBattle(
  state: GameState,
  attackerId: PlayerId,
  attackerDieId: string,
  regionId: RegionId,
): { state: GameState; result: BattleResult } {
  const attacker = state.players[attackerId];
  if (!attacker) throw new Error(`Unknown attacker ${attackerId}`);
  const attackerDie = attacker.dice.find((d) => d.id === attackerDieId);
  if (!attackerDie) throw new Error(`Die ${attackerDieId} not on attacker ${attackerId}`);
  if (!canBattle(state, attackerDie, regionId)) {
    throw new Error(`Cannot battle in ${regionId} with die ${attackerDieId}`);
  }

  const attackerValue = attackerDie.faceValue!;
  const defSum = defenderSum(state, regionId, attackerId);
  const attackerWon = attackerValue > defSum + 1;

  const next = produce(state, (draft) => {
    const rt = draft.regions[regionId]!;

    if (attackerWon) {
      // Evict every defender die from this region.
      for (const id of [...rt.placedDieIds]) {
        for (const player of Object.values(draft.players)) {
          if (player.id === attackerId) continue;
          const die = player.dice.find((d) => d.id === id);
          if (die) {
            die.location = { kind: 'barracks' };
            die.faceValue = null;
            break;
          }
        }
      }
      rt.placedDieIds = [];

      // Move attacker die in.
      const die = draft.players[attackerId]!.dice.find((d) => d.id === attackerDieId)!;
      die.location = { kind: 'region', regionId };
      rt.placedDieIds.push(attackerDieId);

      // VP + progress.
      draft.players[attackerId]!.vp += 1;
      draft.players[attackerId]!.progress.battlesWonThisGame += 1;
    } else {
      // Attacker loses: their die returns to barracks, face cleared.
      const die = draft.players[attackerId]!.dice.find((d) => d.id === attackerDieId)!;
      die.location = { kind: 'barracks' };
      die.faceValue = null;
    }

    // Every battle pushes the threat track regardless of outcome.
    draft.threatTrack += 1;
  });

  return {
    state: next,
    result: { attackerWon, attackerValue, defenderSum: defSum },
  };
}
