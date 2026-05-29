// ─── Iron & Ash v2 — factions & the rivalry ring ────────────────────────────
//
// 6 factions on a hexagon RING. Each wants a PRIMARY spoil (3 VP/round when it
// holds a tile bearing it) and 2 SECONDARY spoils (2 VP) that OVERLAP with its
// ring-neighbours — engineered, controllable conflict. Anything else is 1 VP.
//
//        Warriors
//      /          \
//  Paladins      Merchants
//     |              |
//   Mages         Rangers
//      \          /
//      Necromancers
//
//   adjacent on the ring = STRONG rivals (share 2 spoils)
//   across the ring       = "opposites" that share NOTHING (banned in 2p)
//
// Spoil names are placeholders — theme/skin comes after the math is locked.

import type { UnitRange } from './units';

export type Spoil = 'iron' | 'gold' | 'essence' | 'bone' | 'wild' | 'faith';
export type FactionId = 'warriors' | 'merchants' | 'rangers' | 'necromancers' | 'mages' | 'paladins';

export interface FactionDef {
  id: FactionId;
  name: string;
  primary: Spoil;
  secondary: readonly [Spoil, Spoil];
  /**
   * Starting dice pool — the FIRST axis of faction identity (alongside which
   * spoils score). Differentiated on two axes:
   *   quantity vs quality  — more dice spread to more tiles; fewer strong dice
   *                          win key contests but can't be everywhere.
   *   consistent vs swingy — Soldier/Elite reliable, Levy reliably weak,
   *                          Champion (1-6) high-variance.
   * (First-draft compositions — tuned via the sim; see v2-board-test.ts.)
   */
  pool: readonly UnitRange[];
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  // Elite military — fewer, strong, reliable. Wins contests head-on.
  warriors:     { id: 'warriors',     name: 'Warriors',     primary: 'iron',    secondary: ['gold', 'faith'],   pool: ['3-6', '3-6', '2-5', '2-5', '1-3'] },
  // Numerous & cheap — 6 weak dice; spread wide, avoid big fights.
  merchants:    { id: 'merchants',    name: 'Merchants',    primary: 'gold',    secondary: ['iron', 'wild'],    pool: ['2-5', '1-3', '1-3', '1-3', '1-3', '1-3'] },
  // Swarm skirmishers — 6 dice, light but many.
  rangers:      { id: 'rangers',      name: 'Rangers',      primary: 'wild',    secondary: ['gold', 'bone'],    pool: ['2-5', '2-5', '1-3', '1-3', '1-3', '1-3'] },
  // Attrition horde — bodies over quality (recursion ability comes later).
  necromancers: { id: 'necromancers', name: 'Necromancers', primary: 'bone',    secondary: ['essence', 'wild'], pool: ['2-5', '2-5', '1-3', '1-3', '1-3'] },
  // Surgical — only 4 dice but high ceiling; swingy Champions.
  mages:        { id: 'mages',        name: 'Mages',        primary: 'essence', secondary: ['bone', 'faith'],   pool: ['3-6', '1-6', '1-6', '2-5'] },
  // Disciplined line — consistent, no swing.
  paladins:     { id: 'paladins',     name: 'Paladins',     primary: 'faith',   secondary: ['iron', 'essence'], pool: ['2-5', '2-5', '2-5', '3-6', '1-3'] },
};

/** Hexagon ring order — adjacent entries are strong rivals (share 2 spoils). */
export const RING: readonly FactionId[] = ['warriors', 'merchants', 'rangers', 'necromancers', 'mages', 'paladins'];

const RING_INDEX: Record<FactionId, number> = Object.fromEntries(RING.map((f, i) => [f, i])) as Record<FactionId, number>;

/**
 * A faction's VP valuation of a tile's spoil. The centre (universal) is the
 * PRIZE — worth 5 to everyone, clearly above any primary (3) — so both sides
 * are pulled to fight over it. (Paired with a lower centre defense in board.ts
 * so it actually changes hands, generating conflict rather than a first-grab
 * hold.)
 */
export function valueOf(faction: FactionDef, spoil: Spoil | 'universal'): number {
  if (spoil === 'universal') return 5;
  if (spoil === faction.primary) return 3;
  if (faction.secondary.includes(spoil)) return 2;
  return 1;
}

/** Spoils both factions value (≥1 ⇒ they're rivals; 2 ⇒ strong rivals). */
export function sharedSpoils(a: FactionId, b: FactionId): Spoil[] {
  const fa = FACTIONS[a], fb = FACTIONS[b];
  const setA = new Set<Spoil>([fa.primary, ...fa.secondary]);
  return [fb.primary, ...fb.secondary].filter((s) => setA.has(s));
}

/** Ring distance (0..3). 1 = strong rival, 2 = weak rival, 3 = opposite. */
export function ringDistance(a: FactionId, b: FactionId): number {
  const d = Math.abs(RING_INDEX[a] - RING_INDEX[b]);
  return Math.min(d, RING.length - d);
}

/** The two strong rivals (ring neighbours) — the legal 2p opponents. */
export function strongRivals(f: FactionId): FactionId[] {
  const i = RING_INDEX[f];
  return [RING[(i + 1) % RING.length]!, RING[(i - 1 + RING.length) % RING.length]!];
}

/** The opposite faction (shares nothing) — the banned 2p pairing. */
export function opposite(f: FactionId): FactionId {
  return RING[(RING_INDEX[f] + 3) % RING.length]!;
}

/** Pick a consecutive ring arc of length N — guarantees every neighbour is a rival. */
export function ringArc(startIndex: number, n: number): FactionId[] {
  return Array.from({ length: n }, (_, k) => RING[(startIndex + k) % RING.length]!);
}

/** All consecutive-arc faction sets of size N (the clean, conflict-guaranteed combos). */
export function validCombos(n: number): FactionId[][] {
  if (n === RING.length) return [RING.slice()];
  return RING.map((_, i) => ringArc(i, n));
}
