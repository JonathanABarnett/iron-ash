// Region helpers: legality of placement / combine / round-unlock gating.

import type { Die, GameState, Region, ValueRequirement } from './types';
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

  if (!meetsRequirement(die.faceValue, region.valueRequirement)) return false;

  if (region.isFortress) {
    const garrisonCheck = canGarrisonOrUsurp(state, region.id, die.ownerId, die.faceValue);
    if (!garrisonCheck.ok) return false;
  }
  return true;
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

  const sum = dieA.faceValue + dieB.faceValue;
  if (!meetsRequirement(sum, region.valueRequirement)) return false;

  if (region.isFortress) {
    const garrisonCheck = canGarrisonOrUsurp(state, region.id, dieA.ownerId, sum);
    if (!garrisonCheck.ok) return false;
  }
  return true;
}
