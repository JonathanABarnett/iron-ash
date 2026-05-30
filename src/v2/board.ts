// ─── Iron & Ash v2 — territorial war board ──────────────────────────────────
//
// A clean, isolated v2 prototype. NOTHING here imports the v1 engine's game
// rules — only the shared Rng. The v1 game at the repo root is untouched.
//
// DESIGN: territories are NODES in a hand-shaped graph, not number-slots.
// You march FORCES (dice) along edges into adjacent territories and fight for
// them. Geography is encoded in the topology so armies are forced to collide.
//
// SCALING RULE — territory count tracks player count so collision density
// stays constant regardless of N:
//
//     territories = 3 * N + 1
//       N homes        (one safe base per player, on the rim)
//     + N chokepoints  (the defended road from each home to the center)
//     + N borders      (open ground between each pair of adjacent homes)
//     + 1 center       (the contested prize everyone is equidistant from)
//
//   2 players →  7 territories   (intimate, fast collision)
//   3 players → 10 territories
//   4 players → 13 territories   (room to maneuver, still forced to meet)

import { Rng } from '../engine/rng';
import { FACTIONS, sharedSpoils, type FactionId, type Spoil } from './factions';

// ─── Types ───────────────────────────────────────────────────────────────────

export type TerrainV2 = 'home' | 'plains' | 'forest' | 'mountain' | 'fortress' | 'center';

export type TerritoryRole = 'home' | 'choke' | 'border' | 'center';

export interface TerritoryV2 {
  id: string;
  name: string;
  role: TerritoryRole;
  terrain: TerrainV2;
  /** Economic value tag — factions score this differently (centre = universal). */
  spoil: Spoil | 'universal';
  /** Added to the DEFENDER's total in combat — terrain that's hard to storm. */
  defenseBonus: number;
  /** Dice/resources generated each round the territory is held. */
  income: number;
  /** VP scored each round the territory is held (fortresses + center only). */
  vpPerRound: number;
  /** Player index whose home this is (homes only). */
  homeOf?: number;
  adjacency: string[];
  /** Layout hint for the eventual SVG renderer (viewBox 0..800 × 0..600). */
  x: number;
  y: number;
}

export interface BoardV2 {
  playerCount: number;
  /** Faction seated in each home slot, indexed by player number. */
  factionIds: FactionId[];
  territories: Record<string, TerritoryV2>;
  /** Home territory id per player, indexed by player number (0..N-1). */
  homeIds: string[];
  centerId: string;
}

// ─── Terrain profiles ──────────────────────────────────────────────────────────
// defenseBonus / income / vpPerRound per terrain — the levers the sim tunes.

const TERRAIN_PROFILE: Record<TerrainV2, { defenseBonus: number; income: number; vpPerRound: number }> = {
  center:   { defenseBonus: 2, income: 3, vpPerRound: 2 }, // the prize — high value (5 VP) but takeable (def 2, not a fortress) so it changes hands and stays contested
  fortress: { defenseBonus: 3, income: 1, vpPerRound: 1 }, // strongholds anchor the spokes
  mountain: { defenseBonus: 2, income: 1, vpPerRound: 0 }, // defensible chokepoints
  home:     { defenseBonus: 1, income: 2, vpPerRound: 0 }, // safe base, decent income
  forest:   { defenseBonus: 1, income: 1, vpPerRound: 0 }, // light cover
  plains:   { defenseBonus: 0, income: 1, vpPerRound: 0 }, // open, exposed
};

const FACTION_HOME_NAMES = [
  'Ironhold', 'Shadowmere', 'Highspire', 'Goldreach',
];
const CHOKE_NAMES   = ['Stormwall Pass', 'Bonewatch Bridge', 'Ashgate', 'Thornward'];
const BORDER_NAMES  = ['The Marches', 'Greywood', 'Mireborn Flats', 'Duskfield', 'Redfen', 'Coldreach'];

// ─── Layout (render coordinates, viewBox 800 × 600) ─────────────────────────────
// Explicit, readable positions per player count — no overlaps, uses the canvas.

const CX = 400, CY = 300;
type Pt = { x: number; y: number };

function polarDeg(deg: number, r: number): Pt {
  const a = (deg * Math.PI) / 180;
  return { x: Math.round(CX + Math.cos(a) * r), y: Math.round(CY + Math.sin(a) * r) };
}

interface Layout { center: Pt; home: Pt[]; choke: Pt[]; border: Pt[] }

function layoutPositions(n: number): Layout {
  if (n === 2) {
    // Horizontal lens: homes left/right, spine through centre, borders top/bottom.
    return {
      center: { x: CX, y: CY },
      home:   [{ x: 110, y: 300 }, { x: 690, y: 300 }],
      choke:  [{ x: 255, y: 300 }, { x: 545, y: 300 }],
      border: [{ x: 400, y: 110 }, { x: 400, y: 490 }],
    };
  }
  // 3p / 4p: radial. Homes evenly spaced on the rim (first at top), chokes on the
  // spoke toward centre, borders at the angular midpoint between adjacent homes.
  const start = -90, step = 360 / n;
  const home: Pt[] = [], choke: Pt[] = [], border: Pt[] = [];
  for (let i = 0; i < n; i++) {
    home.push(polarDeg(start + i * step, 250));
    choke.push(polarDeg(start + i * step, 125));
    border.push(polarDeg(start + (i + 0.5) * step, 250));
  }
  return { center: { x: CX, y: CY }, home, choke, border };
}

// ─── Balance: per-faction positional sturdiness (the BALANCE knob) ───────────
// Pools, abilities and the spoil web are IDENTITY. The one lever the balance
// tuner is allowed to move is how defensible each faction's CORE GROUND (its
// home + choke) is — board-disadvantaged factions get sturdier terrain,
// over-strong ones softer, tuned independently PER PLAYER COUNT (the thing pools
// can't do). Default {} = the shipped board, untouched. Set per-count by
// scripts/v2-tune-board.ts; production leaves it empty.
let FACTION_DEFENSE_ADJ: Partial<Record<FactionId, number>> = {};
export function setFactionDefenseAdj(adj: Partial<Record<FactionId, number>>): void {
  FACTION_DEFENSE_ADJ = adj;
}

// ─── Generator ───────────────────────────────────────────────────────────────

export function generateBoard(factionIds: FactionId[], seed: string): BoardV2 {
  const N = factionIds.length;
  if (N < 2 || N > 4) {
    throw new Error(`v2 board supports 2-4 players, got ${N}`);
  }
  const rng = new Rng(`v2-board-${seed}-${factionIds.join('-')}`);
  const pos = layoutPositions(N);
  const territories: Record<string, TerritoryV2> = {};

  const mk = (
    id: string, name: string, role: TerritoryRole, terrain: TerrainV2,
    spoil: Spoil | 'universal', pos: { x: number; y: number }, extra: Partial<TerritoryV2> = {},
  ): TerritoryV2 => {
    const p = TERRAIN_PROFILE[terrain];
    const t: TerritoryV2 = {
      id, name, role, terrain, spoil,
      defenseBonus: p.defenseBonus, income: p.income, vpPerRound: p.vpPerRound,
      adjacency: [], x: pos.x, y: pos.y, ...extra,
    };
    territories[id] = t;
    return t;
  };

  // ── Centre — the universal prize ──
  const centerId = 'center';
  mk(centerId, 'The Iron Throne', 'center', 'center', 'universal', pos.center);

  const homeIds: string[] = [];
  const chokeIds: string[] = [];
  const borderIds: string[] = [];

  // ── Homes + their spoke chokepoints ──
  // Home spoil = that faction's PRIMARY (a comfortable base economy).
  // Choke spoil = that faction's first SECONDARY (push out to it; rivals contest).
  for (let i = 0; i < N; i++) {
    const faction = FACTIONS[factionIds[i]!];
    // Positional-balance adjustment for THIS faction's core ground (home + choke).
    const adj = FACTION_DEFENSE_ADJ[factionIds[i]!] ?? 0;

    const homeId = `home-${i}`;
    homeIds.push(homeId);
    const homeT = mk(homeId, FACTION_HOME_NAMES[i] ?? `Home ${i + 1}`, 'home', 'home', faction.primary, pos.home[i]!, { homeOf: i });
    if (adj) homeT.defenseBonus = Math.max(0, homeT.defenseBonus + adj);

    const chokeId = `choke-${i}`;
    chokeIds.push(chokeId);
    const chokeTerrain: TerrainV2 = i % 2 === 0 ? 'fortress' : 'mountain';
    const chokeT = mk(chokeId, CHOKE_NAMES[i] ?? `Pass ${i + 1}`, 'choke', chokeTerrain, faction.secondary[0], pos.choke[i]!);
    if (adj) chokeT.defenseBonus = Math.max(0, chokeT.defenseBonus + adj);
  }

  // ── Borders — open ground between each pair of ADJACENT homes ──
  // Border spoil = a spoil BOTH neighbouring factions value (their shared
  // secondary) → engineered contested ground exactly where the ring predicts.
  for (let i = 0; i < N; i++) {
    const borderId = `border-${i}`;
    borderIds.push(borderId);
    const borderTerrain: TerrainV2 = rng.pick(['plains', 'forest'] as const);

    const left = factionIds[i]!, right = factionIds[(i + 1) % N]!;
    const shared = sharedSpoils(left, right);
    // Prefer a genuinely shared spoil; fall back to the left faction's 2nd secondary.
    const borderSpoil: Spoil = shared[0] ?? FACTIONS[left].secondary[1];
    mk(borderId, BORDER_NAMES[i] ?? `Border ${i + 1}`, 'border', borderTerrain, borderSpoil, pos.border[i]!);
  }

  // ── Edges ──
  const link = (a: string, b: string) => {
    if (a === b) return;
    if (!territories[a]!.adjacency.includes(b)) territories[a]!.adjacency.push(b);
    if (!territories[b]!.adjacency.includes(a)) territories[b]!.adjacency.push(a);
  };

  for (let i = 0; i < N; i++) {
    // home → its chokepoint → centre  (the defended road to the prize)
    link(homeIds[i]!, chokeIds[i]!);
    link(chokeIds[i]!, centerId);

    // home → its two flanking borders (border i sits between home i and home i+1)
    const prevBorder = borderIds[(i - 1 + N) % N]!;
    const nextBorder = borderIds[i]!;
    link(homeIds[i]!, prevBorder);
    link(homeIds[i]!, nextBorder);

    // borders also touch the adjacent chokepoint — gives an alternate flank
    // route to the front line instead of everything funnelling through centre.
    link(nextBorder, chokeIds[i]!);
    link(nextBorder, chokeIds[(i + 1) % N]!);
  }

  return { playerCount: N, factionIds, territories, homeIds, centerId };
}

// ─── Introspection helpers (used by the validation script + renderer) ─────────

export function territoryList(board: BoardV2): TerritoryV2[] {
  return Object.values(board.territories);
}

/** Shortest-path distance (in edges) between two territories. */
export function graphDistance(board: BoardV2, from: string, to: string): number {
  if (from === to) return 0;
  const seen = new Set<string>([from]);
  let frontier = [from];
  let dist = 0;
  while (frontier.length > 0) {
    dist += 1;
    const next: string[] = [];
    for (const id of frontier) {
      for (const adj of board.territories[id]!.adjacency) {
        if (seen.has(adj)) continue;
        if (adj === to) return dist;
        seen.add(adj);
        next.push(adj);
      }
    }
    frontier = next;
  }
  return Infinity;
}
