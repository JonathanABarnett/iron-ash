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

export interface FactionAbility {
  name: string;
  /** Player-facing one-liner for the UI. */
  description: string;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  primary: Spoil;
  secondary: readonly [Spoil, Spoil];
  /** Signature passive — the SECOND identity axis beyond spoils + pool shape. */
  ability: FactionAbility;
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

// Pools are POWER-NORMALISED (~14.7–15.5 avg total each) so no faction is just
// weak — they differ in SHAPE, not strength. avg/die: Levy 2.0, Soldier 3.17,
// Elite 4.5, Champion 3.5 (swingy).
// In the churn meta, dice COUNT (placements) is the dominant lever but weak
// dice waste it — so counts cluster at 5-6 and the strong-die factions trade
// raw power for fewer/weaker support dice. Identity now lives in SHAPE
// (variance, count) + the spoil web, kept close enough in effectiveness.
export const FACTIONS: Record<FactionId, FactionDef> = {
  // Elite — 5 dice, two strong + support. Wins contests, decent reach.
  warriors:     { id: 'warriors',     name: 'Warriors',     primary: 'iron',    secondary: ['gold', 'faith'],   pool: ['3-6', '3-6', '2-5', '1-3', '1-3'],
    ability: { name: 'Warlord', description: 'Your forces fight harder — +2 to your total in every contest.' } },
  // Breadth swarm — 6 lighter dice; spread wide, win on coverage not punch.
  merchants:    { id: 'merchants',    name: 'Merchants',    primary: 'gold',    secondary: ['iron', 'wild'],    pool: ['2-5', '2-5', '1-3', '1-3', '1-3', '1-3'],
    ability: { name: 'Coffers', description: 'Trade wealth — +1 bonus VP each round for every 2 territories you hold.' } },
  // Skirmisher swarm — 6 dice, a touch lighter than a line army.
  rangers:      { id: 'rangers',      name: 'Rangers',      primary: 'wild',    secondary: ['gold', 'bone'],    pool: ['2-5', '2-5', '1-3', '1-3', '1-3', '1-3'],
    ability: { name: 'Ambush', description: 'Raiders — +1 to your total when attacking a territory you don\'t hold.' } },
  // Mixed/durable — elite anchor + line + bodies; recovers from defeat.
  necromancers: { id: 'necromancers', name: 'Necromancers', primary: 'bone',    secondary: ['essence', 'wild'], pool: ['3-6', '2-5', '2-5', '1-3', '1-3'],
    ability: { name: 'Soul Harvest', description: 'Raise the fallen — gain a bonus die next round for each contest you lose this round.' } },
  // Surgical & swingy — 5 dice, two high-ceiling Champions.
  mages:        { id: 'mages',        name: 'Mages',        primary: 'essence', secondary: ['bone', 'faith'],   pool: ['1-6', '1-6', '2-5', '2-5', '1-3'],
    ability: { name: 'Arcane Focus', description: 'Precision casting — your Champion dice (1-6) never roll below 4.' } },
  // Disciplined line — 5 dice, reliable, low swing.
  paladins:     { id: 'paladins',     name: 'Paladins',     primary: 'faith',   secondary: ['iron', 'essence'], pool: ['2-5', '2-5', '2-5', '1-3', '1-3'],
    ability: { name: 'Consecrate', description: 'Hold the line — +1 defense on every territory you hold (your ground is harder to take).' } },
};

/** Warriors' Warlord: bonus added to their committed total in any contest. */
export function combatBonus(factionId: FactionId): number {
  return factionId === 'warriors' ? 1 : 0;
}

/** Paladins' Consecrate: bonus defense added when they're the tile's owner. */
export function defenseBonusFor(factionId: FactionId): number {
  return factionId === 'paladins' ? 1 : 0;
}

/** Rangers' Ambush: bonus added to their total when ATTACKING (not the owner). */
export function attackBonus(factionId: FactionId): number {
  return factionId === 'rangers' ? 1 : 0;
}

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
