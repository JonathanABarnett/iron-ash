// Custom dice faces and rolling.

import type { Die, DieRange } from './types';
import type { Rng } from './rng';

export const FACES: Record<DieRange, readonly number[]> = {
  '1-3': [1, 1, 2, 2, 3, 3],
  '2-5': [2, 2, 3, 3, 4, 5],
  '3-6': [3, 3, 4, 5, 6, 6],
  '1-6': [1, 2, 3, 4, 5, 6],
};

/** Returns a NEW die with faceValue set. */
export function rollDie(die: Die, rng: Rng): Die {
  const faces = FACES[die.range];
  const value = rng.pick(faces);
  return { ...die, faceValue: value };
}

/** Rolls every barracks die for a player. Dice on regions or in garrisons are NOT rerolled. */
export function rollBarracksDice(dice: readonly Die[], rng: Rng): Die[] {
  return dice.map((d) => (d.location.kind === 'barracks' ? rollDie(d, rng) : d));
}

/** Lower bound (inclusive) and upper bound (inclusive) for a die range. */
export function rangeBounds(range: DieRange): [number, number] {
  const faces = FACES[range];
  let min = Infinity;
  let max = -Infinity;
  for (const f of faces) {
    if (f < min) min = f;
    if (f > max) max = f;
  }
  return [min, max];
}
