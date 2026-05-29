// ─── Iron & Ash v2 — AI deployment ───────────────────────────────────────────
//
// Greedy faction-aware deployment: pour this round's rolled dice into the most
// valuable reachable territories, where "valuable" = THIS faction's valuation
// of the tile's spoil (3 primary / 2 secondary / 1 other). This is what makes
// factions fan out to their own colours and clash with rivals on shared spoils.
//
// Shared by the headless sim and the interactive sandbox so both use one brain.

import { FACTIONS, valueOf } from './factions';
import { reachable, depletedYield, type GameV2 } from './game';

export interface RolledLike { value: number }

/** Summed committed value per player, per territory — the live deploy board. */
export type CommittedSums = Record<string, Record<number, number>>;

/**
 * Pick ONE die placement for sequential, visible turn-by-turn deployment.
 * Reacts to the current (visible) board: commits this player's largest
 * remaining die to the highest faction-value reachable tile, preferring tiles
 * where the die would seize the lead and contested fights. Returns null to pass
 * (only when out of dice or nothing reachable scores).
 */
export function pickOneDie(
  game: GameV2,
  playerId: number,
  remaining: number[],
  committed: CommittedSums,
): { dieValue: number; tid: string } | null {
  if (remaining.length === 0) return null;
  const faction = FACTIONS[game.players[playerId]!.faction];
  const dieValue = Math.max(...remaining);

  // Effective total for a player on a tile (their committed sum + terrain if owner).
  const eff = (tid: string, pid: number): number =>
    (committed[tid]?.[pid] ?? 0) + (game.owner[tid] === pid ? game.board.territories[tid]!.defenseBonus : 0);

  const reach = [...reachable(game, playerId)].filter(
    (tid) => !(game.board.territories[tid]!.role === 'home' && game.owner[tid] === playerId),
  );

  let best: string | null = null;
  let bestScore = -Infinity;
  for (const tid of reach) {
    const t = game.board.territories[tid]!;
    // Value this tile by what it would yield ME *now*, accounting for depletion:
    // a tile I already hold has decayed (low marginal value), while capturing a
    // fresh/enemy tile pays full — so the AI abandons camped ground and goes for
    // new territory, which is what creates conflict.
    const ownedByMe = game.owner[tid] === playerId;
    const streak = ownedByMe ? (game.heldStreak[tid] ?? 0) : 0;
    const v = depletedYield(valueOf(faction, t.spoil), streak);
    const mine = eff(tid, playerId);
    // strongest opponent presence (committed or the current owner via terrain)
    let oppMax = 0;
    if (game.owner[tid] !== undefined && game.owner[tid] !== playerId) oppMax = eff(tid, game.owner[tid]!);
    for (const k of Object.keys(committed[tid] ?? {})) {
      const pid = Number(k);
      if (pid !== playerId) oppMax = Math.max(oppMax, eff(tid, pid));
    }
    const wouldLead = mine + dieValue > oppMax;
    const gap = oppMax - (mine + dieValue); // how far behind we'd still be (<0 = leading)
    const contested = oppMax > 0;
    let s = v * 2;                          // faction value dominates (primary 6 / sec 4 / other 2)
    // Reward seizing the lead, but only LIGHTLY penalise investing in a tile
    // we don't yet lead — so the AI will build up across turns toward a
    // valuable contested prize instead of always fleeing to safe ground.
    if (wouldLead) s += 2;
    else s -= Math.min(1.5, gap * 0.4);     // mild, scales with how hopeless it is
    if (contested) s += 1;                  // pressing an active fight is good
    if (t.role === 'center') s += 2;        // the prize — strong pull
    if (s > bestScore) { bestScore = s; best = tid; }
  }
  if (best === null) return null;
  return { dieValue, tid: best };
}

/** Returns territoryId → summed committed value for this player's hand. */
export function planDeployment(
  game: GameV2,
  playerId: number,
  hand: RolledLike[],
): Record<string, number> {
  const faction = FACTIONS[game.players[playerId]!.faction];

  const desirability = (tid: string): number => {
    const t = game.board.territories[tid]!;
    const mine = game.owner[tid] === playerId;
    const enemyOwned = game.owner[tid] !== undefined && !mine;
    let s = valueOf(faction, t.spoil);          // 3/2/1 by faction — drives fan-out
    if (t.role === 'center') s += 1;            // universal prize, slight extra pull
    if (enemyOwned) s += 0.5;                   // taking enemy land
    if (mine && t.role !== 'home') s += 0.3;    // hold scoring land we already have
    return s;
  };

  const targets = [...reachable(game, playerId)]
    .filter((tid) => !(game.board.territories[tid]!.role === 'home' && game.owner[tid] === playerId))
    .sort((a, b) => desirability(b) - desirability(a));

  const need = (tid: string): number => {
    const t = game.board.territories[tid]!;
    const enemyOwned = game.owner[tid] !== undefined && game.owner[tid] !== playerId;
    return (enemyOwned ? t.defenseBonus : 0) + 5; // rough force to secure
  };

  const dice = [...hand].sort((a, b) => b.value - a.value);
  const placements: Record<string, number> = {};
  let ti = 0;
  for (const d of dice) {
    while (ti < targets.length && (placements[targets[ti]!] ?? 0) >= need(targets[ti]!)) ti++;
    const tid = targets[ti] ?? targets[0];
    if (!tid) break;
    placements[tid] = (placements[tid] ?? 0) + d.value;
  }
  return placements;
}
