// ─── Iron & Ash v2 — AI deployment ───────────────────────────────────────────
//
// Greedy faction-aware deployment: pour this round's rolled dice into the most
// valuable reachable territories, where "valuable" = THIS faction's valuation
// of the tile's spoil (3 primary / 2 secondary / 1 other). This is what makes
// factions fan out to their own colours and clash with rivals on shared spoils.
//
// Shared by the headless sim and the interactive sandbox so both use one brain.

import { FACTIONS, valueOf } from './factions';
import { reachable, type GameV2 } from './game';

export interface RolledLike { value: number }

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
