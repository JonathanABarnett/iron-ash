// Specialist mercenary forecasting: should the AI grab the Specialist now,
// wait for a more attractive value next round, or skip entirely?
//
// Per spec: countdown 6 -> 5 -> 4 -> 3 -> 2 -> 1 -> 1 across rounds 1..7.
// Hard difficulty looks 1-2 rounds ahead.

import type { FactionId, GameState, RulesConfig } from '../engine/types';

/**
 * Estimate the Specialist hire's appeal in [-1, 1+]. Higher = better hire now.
 *
 * Spec pseudocode:
 *   - valueMatch    : closeness of currentValue to faction's needed value
 *   - factionMatch  : faction-specific value preferences
 *   - futurePenalty : if waiting one round buys a better value, push down
 */
export function evaluateSpecialistHire(
  currentValue: number,
  state: GameState,
  factionId: FactionId,
  rules: RulesConfig,
): number {
  const idealValue = identifyNeededValue(state, factionId);
  const valueMatch = 1 - Math.abs(currentValue - idealValue) / 5;

  let factionMatch = 0;
  if (factionId === 'warriors' && currentValue >= 5) factionMatch = 1;
  if (factionId === 'assassins' && currentValue <= 2) factionMatch = 1;
  if (factionId === 'mages') factionMatch = 0.7; // any exact value useful

  const nextRoundIdx = state.round; // current round is 1-indexed; index by `round`.
  const nextValue = rules.specialistSequence[nextRoundIdx] ?? currentValue;
  const futureBetter =
    nextValue !== currentValue &&
    Math.abs(nextValue - idealValue) < Math.abs(currentValue - idealValue);

  const futurePenalty = futureBetter ? 0.3 : 0;

  return valueMatch * 0.6 + factionMatch * 0.4 - futurePenalty;
}

/** Heuristic for the value the player most needs right now. */
export function identifyNeededValue(state: GameState, factionId: FactionId): number {
  // Look at unlocked regions and find a face value that would let us land on
  // the highest-VP unsatisfied region. Tied with faction-specific bias.
  let bestValue = 4;
  let bestVP = 0;
  for (const region of Object.values(state.regionDefs)) {
    if (region.unlocksRound !== undefined && state.round < region.unlocksRound) continue;
    const req = region.valueRequirement;
    let want = bestValue;
    if (req.kind === 'min') want = req.value;
    else if (req.kind === 'max') want = Math.min(req.value, 1);
    else if (req.kind === 'exact') want = req.value;
    else if (req.kind === 'minSum') want = Math.min(6, Math.ceil(req.value / 2));
    if (region.vp > bestVP) {
      bestVP = region.vp;
      bestValue = want;
    }
  }

  if (factionId === 'assassins') return Math.min(bestValue, 2);
  if (factionId === 'warriors') return Math.max(bestValue, 5);
  return bestValue;
}
