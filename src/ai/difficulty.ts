// Difficulty noise: how much we perturb candidate scores before picking max.
// Fraction of |score| jittered uniformly in [-noise, +noise] for that move.

import type { Rng } from '../engine/rng';
import type { ScoredCandidate, Difficulty } from './types';
import { DIFFICULTY_NOISE } from './types';

export function applyNoise(
  candidates: ScoredCandidate[],
  difficulty: Difficulty,
  rng: Rng,
): ScoredCandidate[] {
  const noise = DIFFICULTY_NOISE[difficulty];
  if (noise <= 0) return candidates;
  return candidates.map((c) => {
    const mag = Math.abs(c.score);
    // Uniform [-noise, +noise] * |score|; for tiny scores fall back to a flat 0.5
    // perturbation so passes/no-ops stay shuffleable on Easy.
    const span = mag > 0.5 ? mag * noise : noise * 0.5;
    const delta = (rng.next() * 2 - 1) * span;
    return {
      ...c,
      score: c.score + delta,
      breakdown: { ...c.breakdown, noise: delta },
    };
  });
}
