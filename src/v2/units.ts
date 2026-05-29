// ─── Iron & Ash v2 — units ───────────────────────────────────────────────────
//
// A unit is a DIE WITH A RANGE that lives on a territory as a persistent force.
// It is NOT rolled until it fights — combat rolls every committed unit, so the
// drama of the dice lands exactly at the moment of conflict.
//
//   levy     1-3   cheap fodder; might spike to 3, often a 1
//   soldier  2-5   reliable line troops
//   elite    3-6   expensive, rarely whiffs
//   champion 1-6   high ceiling, swingy — mercenaries / heroes
//
// Recruiting better-range units is the "dice-building" engine: an army of
// elites reliably out-rolls an army of levies, so growing your force quality
// (not just quantity) is the long game.

import type { Rng } from '../engine/rng';

export type UnitRange = '1-3' | '2-5' | '3-6' | '1-6';

export interface Unit {
  id: string;
  range: UnitRange;
}

// Weighted faces per range (same distributions as v1 dice, kept for continuity).
const FACES: Record<UnitRange, readonly number[]> = {
  '1-3': [1, 1, 2, 2, 3, 3],
  '2-5': [2, 2, 3, 3, 4, 5],
  '3-6': [3, 3, 4, 5, 6, 6],
  '1-6': [1, 2, 3, 4, 5, 6],
};

export interface UnitProfile {
  tier: string;
  /** Gold cost to recruit (the dice-building economy lever — tune via sim). */
  cost: number;
  /** Average rolled value — the at-a-glance "how strong is this troop". */
  avg: number;
}

export const UNIT_PROFILE: Record<UnitRange, UnitProfile> = {
  '1-3': { tier: 'Levy',     cost: 1, avg: 2.0 },
  '2-5': { tier: 'Soldier',  cost: 2, avg: 3.17 },
  '3-6': { tier: 'Elite',    cost: 3, avg: 4.5 },
  '1-6': { tier: 'Champion', cost: 4, avg: 3.5 },
};

/** A pool die rolled for the current round. */
export interface RolledDie {
  unit: Unit;
  value: number;
}

/** Roll a single unit's strength. */
export function rollUnit(unit: Unit, rng: Rng): number {
  const faces = FACES[unit.range];
  return rng.pick(faces);
}

/** Roll an entire pool into this round's hand of known values. */
export function rollPool(pool: Unit[], rng: Rng): RolledDie[] {
  return pool.map((unit) => ({ unit, value: rollUnit(unit, rng) }));
}

/** Make N units of a range with deterministic ids. */
export function makeUnits(range: UnitRange, count: number, idPrefix: string): Unit[] {
  return Array.from({ length: count }, (_, i) => ({ id: `${idPrefix}-${range}-${i}`, range }));
}

/** Default starting pool — 5 dice spanning the tiers (tune via sim). */
export function defaultPool(playerIndex: number): Unit[] {
  return [
    ...makeUnits('2-5', 2, `p${playerIndex}`), // two reliable soldiers
    ...makeUnits('1-3', 1, `p${playerIndex}`), // a cheap levy
    ...makeUnits('3-6', 1, `p${playerIndex}`), // an elite
    ...makeUnits('1-6', 1, `p${playerIndex}`), // a swingy champion
  ];
}
