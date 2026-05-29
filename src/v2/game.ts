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
import { defaultPool, rollPool, type RolledDie, type Unit } from './units';
import { resolveContest } from './combat';

export const ROUNDS = 6;

export interface PlayerV2 {
  id: number;
  pool: Unit[];           // persistent dice types (renewed each round)
  vp: number;
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
  }));
  // Each player starts owning their home.
  const owner: Record<string, number> = {};
  board.homeIds.forEach((h, i) => { owner[h] = i; });
  return { board, players, owner, round: 0, clock: 0 };
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

export function rollHand(game: GameV2, playerId: number, rng: Rng): RolledDie[] {
  return rollPool(game.players[playerId]!.pool, rng);
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
    if (r.newOwner !== null) game.owner[tid] = r.newOwner;
    if (r.changed) game.clock += 1;
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
