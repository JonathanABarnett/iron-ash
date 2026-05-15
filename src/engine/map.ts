// Region helpers: legality of placement / combine / round-unlock gating.

import type { Die, GameState, PlayerId, Region, Terrain, ValueRequirement } from './types';
import { canGarrisonOrUsurp } from './fortresses';

export function meetsRequirement(value: number, req: ValueRequirement): boolean {
  switch (req.kind) {
    case 'min':
    case 'minSum':
      return value >= req.value;
    case 'max':
      return value <= req.value;
    case 'exact':
      return value === req.value;
  }
}

export function isRegionUnlocked(region: Region, currentRound: number): boolean {
  if (region.unlocksRound === undefined) return true;
  return currentRound >= region.unlocksRound;
}

/** Single-die placement legality. Combining is checked by canCombineDice. */
export function canPlaceDie(die: Die, region: Region, state: GameState): boolean {
  if (!isRegionUnlocked(region, state.round)) return false;
  if (die.faceValue === null) return false;
  if (die.location.kind !== 'barracks') return false;

  // Locked regions block opponents from placing/combining there.
  const lockOwner = state.lockedRegions[region.id];
  if (lockOwner && lockOwner !== die.ownerId) return false;

  if (!meetsRequirement(die.faceValue, region.valueRequirement)) return false;

  if (region.isFortress) {
    const garrisonCheck = canGarrisonOrUsurp(state, region.id, die.ownerId, die.faceValue);
    if (!garrisonCheck.ok) return false;
  }
  return true;
}

/**
 * Returns true if `playerId` currently has at least one die (placed or garrisoned)
 * on any region whose terrain is in `terrains`. Used for advanced die upgrade gating.
 */
export function playerControlsTerrain(
  state: GameState,
  playerId: PlayerId,
  terrains: Terrain[],
): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  for (const [regionId, rt] of Object.entries(state.regions)) {
    const def = state.regionDefs[regionId];
    if (!def || !terrains.includes(def.terrain)) continue;
    const hasPresence =
      rt.placedDieIds.some((id) => player.dice.some((d) => d.id === id)) ||
      rt.garrisonedDieIds.some((id) => player.dice.some((d) => d.id === id));
    if (hasPresence) return true;
  }
  return false;
}

/** Combine legality: two of the player's barracks dice placed on the same region. */
export function canCombineDice(
  dieA: Die,
  dieB: Die,
  region: Region,
  state: GameState,
): boolean {
  if (dieA.id === dieB.id) return false;
  if (!isRegionUnlocked(region, state.round)) return false;
  if (dieA.faceValue === null || dieB.faceValue === null) return false;
  if (dieA.location.kind !== 'barracks' || dieB.location.kind !== 'barracks') return false;
  if (dieA.ownerId !== dieB.ownerId) return false;

  // Locked regions block opponents from placing/combining there.
  const lockOwner = state.lockedRegions[region.id];
  if (lockOwner && lockOwner !== dieA.ownerId) return false;

  const sum = dieA.faceValue + dieB.faceValue;

  // Combine Bonus: ignore terrain requirement for this combine action.
  const player = state.players[dieA.ownerId];
  const hasCombineBonus = !!player?.hasCombineBonus;
  const effectiveSum = hasCombineBonus ? sum + 1 : sum;

  if (!hasCombineBonus && !meetsRequirement(sum, region.valueRequirement)) return false;
  if (hasCombineBonus && !meetsRequirement(effectiveSum, region.valueRequirement)) return false;

  if (region.isFortress) {
    const garrisonCheck = canGarrisonOrUsurp(state, region.id, dieA.ownerId, effectiveSum);
    if (!garrisonCheck.ok) return false;
  }
  return true;
}
