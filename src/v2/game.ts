// ─── Iron & Ash v2 — lean game model ─────────────────────────────────────────
//
// The renewable-dice / single-comparison / ~6-round loop. Pure rules; no UI,
// no AI (the sim/UI drive it). Target weight: 45 min (2p) → 90 min (4p).
//
// ROUND
//   1. roll — every player rolls their hand (pool → known values)
//   2. deploy — players commit rolled dice onto reachable territories
//   3. resolve — each contested territory resolves in ONE comparison
//   4. score — VP for territories held (home doesn't score → you must push out)
//   dice return to the pool; repeat for ROUNDS rounds, then most VP wins.

import { Rng } from '../engine/rng';
import { generateBoard, type BoardV2 } from './board';
import { defaultPool, makeUnits, rollPool, type RolledDie, type Unit } from './units';
import { resolveContest } from './combat';
import { assignObjectives } from './objectives';

export const ROUNDS = 6;

export interface PlayerStats {
  /** Contested territories this player won (won a fight, not a walk-in). */
  contestsWon: number;
  /** Fortresses/passes/throne captured FROM a rival. */
  strongpointsCaptured: number;
}

export interface PlayerV2 {
  id: number;
  pool: Unit[];           // persistent dice types (renewed each round)
  vp: number;             // visible accrued VP (the main engine)
  objectiveId: string;    // hidden endgame objective
  objectiveVp: number;    // resolved at game end
  stats: PlayerStats;
}

export interface GameV2 {
  board: BoardV2;
  players: PlayerV2[];
  /** territoryId → owning playerId (absent = neutral). */
  owner: Record<string, number>;
  round: number;
  /** War-exhaustion clock — ticks on every control change; flavour + future endgame. */
  clock: number;
}

export function createGameV2(playerCount: number, seed: string): GameV2 {
  const board = generateBoard(playerCount, seed);
  const players: PlayerV2[] = Array.from({ length: playerCount }, (_, i) => ({
    id: i, pool: defaultPool(i), vp: 0,
    objectiveId: '', objectiveVp: 0,
    stats: { contestsWon: 0, strongpointsCaptured: 0 },
  }));
  // Each player starts owning their home.
  const owner: Record<string, number> = {};
  board.homeIds.forEach((h, i) => { owner[h] = i; });
  const game: GameV2 = { board, players, owner, round: 0, clock: 0 };
  // Deal hidden objectives from a seeded, board-independent stream.
  assignObjectives(game, new Rng(`v2-obj-${seed}-${playerCount}`));
  return game;
}

/** Territories a player may deploy into: ones they own, or adjacent to ones they own. */
export function reachable(game: GameV2, playerId: number): Set<string> {
  const out = new Set<string>();
  for (const [tid, o] of Object.entries(game.owner)) {
    if (o !== playerId) continue;
    out.add(tid);
    for (const adj of game.board.territories[tid]!.adjacency) out.add(adj);
  }
  return out;
}

// ── Catch-up ("underdog reinforcements") ──
// A trailing player rolls extra dice this round — scaled to how far behind the
// leader they are. This counters the centre-snowball WITHOUT gutting accrual:
// it grants FORCE to contest with, not free VP. 2p has no third party to
// police a leader, so this is its main self-correction; 4p table politics
// already curbs runaways, and the gap thresholds mean close games are untouched.
export const CATCHUP = { gap1: 4, gap2: 10 } as const;

export function catchUpDiceCount(game: GameV2, playerId: number): number {
  const leadVp = Math.max(...game.players.map((p) => p.vp));
  const deficit = leadVp - game.players[playerId]!.vp;
  if (deficit >= CATCHUP.gap2) return 2;
  if (deficit >= CATCHUP.gap1) return 1;
  return 0;
}

export function rollHand(game: GameV2, playerId: number, rng: Rng): RolledDie[] {
  const base = rollPool(game.players[playerId]!.pool, rng);
  const bonus = catchUpDiceCount(game, playerId);
  if (bonus === 0) return base;
  const reinforcements = makeUnits('2-5', bonus, `catchup-p${playerId}-r${game.round}`);
  return [...base, ...rollPool(reinforcements, rng)];
}

/** A deployment: which player put how much total value onto a territory this round. */
export type Deployments = Record<string, Record<number, number>>; // territoryId → playerId → summed value

/**
 * Resolve all contested territories for the round, mutating ownership.
 * Returns per-territory results for logging / animation.
 */
export function resolveRound(game: GameV2, deployments: Deployments): {
  territoryId: string; changed: boolean; contested: boolean; newOwner: number | null;
}[] {
  const results: { territoryId: string; changed: boolean; contested: boolean; newOwner: number | null }[] = [];
  for (const [tid, committed] of Object.entries(deployments)) {
    const terr = game.board.territories[tid]!;
    const r = resolveContest({
      committed,
      owner: game.owner[tid] ?? null,
      terrainBonus: terr.defenseBonus,
    });
    const prevOwner = game.owner[tid] ?? null;
    if (r.newOwner !== null) game.owner[tid] = r.newOwner;
    if (r.changed) game.clock += 1;

    // Stats for hidden objectives.
    if (r.newOwner !== null && r.newOwner !== prevOwner) {
      if (r.contested) game.players[r.newOwner]!.stats.contestsWon += 1;
      // Captured a strongpoint (pass or throne) from a rival?
      const captured = prevOwner !== null;
      if (captured && (terr.role === 'choke' || terr.role === 'center')) {
        game.players[r.newOwner]!.stats.strongpointsCaptured += 1;
      }
    }
    results.push({ territoryId: tid, changed: r.changed, contested: r.contested, newOwner: r.newOwner });
  }
  return results;
}

/**
 * Score the round: each controlled NON-HOME territory is worth 1 VP, plus its
 * vpPerRound bonus (centre +2, fortress +1). Home scores nothing — you must
 * push outward to win, which is what compels aggression.
 */
export function scoreRound(game: GameV2): void {
  for (const [tid, ownerId] of Object.entries(game.owner)) {
    const terr = game.board.territories[tid]!;
    if (terr.role === 'home') continue;
    game.players[ownerId]!.vp += 1 + terr.vpPerRound;
  }
}

export function isGameOver(game: GameV2): boolean {
  return game.round >= ROUNDS;
}

export function leader(game: GameV2): PlayerV2 {
  return [...game.players].sort((a, b) => b.vp - a.vp)[0]!;
}
