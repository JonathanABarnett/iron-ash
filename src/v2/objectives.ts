// ─── Iron & Ash v2 — secret objectives (hidden endgame VP) ───────────────────
//
// Per-round accrual stays the main scoring engine (the visible VP race). On
// top of it, each player holds ONE hidden objective scored only at game end.
//
// Why hidden VP earns its place:
//   • masks the true leader → a trailing player always has hope, the visible
//     leader can never safely coast (defuses the runaway-leader feeling)
//   • a reveal moment at game end = a real climax
//   • each objective rewards a DIFFERENT axis than "hold the centre", so the
//     board-snowballer isn't automatically winning the hidden race too
//   • naturally faction-flavourable later (each faction's own objective deck)
//
// Magnitudes are tuned so a completed objective (≈5–8 VP) can swing a moderate
// visible lead but never dwarf a whole game of accrual.

import type { GameV2 } from './game';
import type { TerritoryV2 } from './board';

export interface SecretObjective {
  id: string;
  name: string;
  description: string;
  score(game: GameV2, playerId: number): number;
}

function held(game: GameV2, pid: number): TerritoryV2[] {
  return Object.entries(game.owner)
    .filter(([, o]) => o === pid)
    .map(([tid]) => game.board.territories[tid]!);
}

export const SECRET_OBJECTIVES: SecretObjective[] = [
  {
    id: 'crown',
    name: 'The Crown',
    description: 'Hold the Iron Throne at game end.',
    // End-state, not held-all-game → the early centre-snowballer can be
    // knocked off it on the final round by someone gunning for this.
    score: (g, p) => (g.owner[g.board.centerId] === p ? 7 : 0),
  },
  {
    id: 'warlord',
    name: 'Warlord',
    description: 'Win contested battles (+1 VP each, max 8).',
    // Rewards aggression — a player behind on territory can still cash this.
    score: (g, p) => Math.min(8, g.players[p]!.stats.contestsWon),
  },
  {
    id: 'vanguard',
    name: 'Vanguard',
    description: 'Hold fortresses & passes at game end (+2 each, max 8).',
    score: (g, p) => Math.min(8, held(g, p).filter((t) => t.role === 'choke').length * 2),
  },
  {
    id: 'cartographer',
    name: 'Cartographer',
    description: 'Hold ≥3 distinct terrain types at game end (+6).',
    score: (g, p) => (new Set(held(g, p).map((t) => t.terrain)).size >= 3 ? 6 : 0),
  },
  {
    id: 'kingslayer',
    name: 'Kingslayer',
    description: 'Capture fortresses/the throne from a rival (+3 each).',
    score: (g, p) => g.players[p]!.stats.strongpointsCaptured * 3,
  },
  {
    id: 'frontier',
    name: 'Frontier Lord',
    description: 'Hold the open border lands at game end (+2 each, max 6).',
    // Rewards spreading to the rim — orthogonal to the centre rush.
    score: (g, p) => Math.min(6, held(g, p).filter((t) => t.role === 'border').length * 2),
  },
];

/** Deal each player one distinct hidden objective. */
export function assignObjectives(game: GameV2, rng: { shuffle<T>(a: readonly T[]): T[] }): void {
  const deck = rng.shuffle(SECRET_OBJECTIVES);
  game.players.forEach((pl, i) => {
    pl.objectiveId = deck[i % deck.length]!.id;
  });
}

/** Add each player's hidden objective VP to their total (call once, at game end). */
export function scoreObjectives(game: GameV2): void {
  for (const pl of game.players) {
    const obj = SECRET_OBJECTIVES.find((o) => o.id === pl.objectiveId);
    pl.objectiveVp = obj ? obj.score(game, pl.id) : 0;
    pl.vp += pl.objectiveVp;
  }
}

export function objectiveById(id: string): SecretObjective | undefined {
  return SECRET_OBJECTIVES.find((o) => o.id === id);
}
