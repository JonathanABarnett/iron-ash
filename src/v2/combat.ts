// ─── Iron & Ash v2 — contest resolution ─────────────────────────────────────
//
// LEAN MODEL (post "not-Warhammer" correction):
//   • dice are a RENEWABLE hand, re-rolled each round, returned to pool after
//   • a contested territory resolves in ONE comparison — no attrition exchange
//   • territory control persists via an owner marker; the dice that took it
//     cycle back next round
//
// RESOLUTION
//   each contender's effective total = sum of the dice they committed here,
//   PLUS the terrain bonus IF they're the current owner (fortifications help
//   the defender). Highest effective total takes/holds control.
//   TIES favour the current owner (defender's edge).
//
// No casualties, no removing units one at a time. Fast, legible, one sitting.

export interface ContestInput {
  /** playerId → summed face value committed to this territory this round. */
  committed: Record<number, number>;
  /** Current owner of the territory, or null if neutral/unclaimed. */
  owner: number | null;
  /** Terrain defense bonus (added to the owner's effective total). */
  terrainBonus: number;
}

export interface ContestResult {
  /** Effective totals per contender (owner already includes terrainBonus). */
  effective: Record<number, number>;
  previousOwner: number | null;
  newOwner: number | null;
  /** Did control change hands this round? */
  changed: boolean;
  /** Was this territory actually fought over (≥2 sides, or an attack on an owner)? */
  contested: boolean;
}

export function resolveContest(input: ContestInput): ContestResult {
  const { committed, owner, terrainBonus } = input;
  const contenders = Object.keys(committed).map(Number);

  // Effective totals — owner gets the terrain bonus folded in.
  const effective: Record<number, number> = {};
  for (const pid of contenders) {
    effective[pid] = committed[pid]! + (pid === owner ? terrainBonus : 0);
  }
  // An undefended owner still "defends" with their fortifications.
  if (owner !== null && effective[owner] === undefined) {
    effective[owner] = terrainBonus;
  }

  const allSides = Object.keys(effective).map(Number);
  const contested =
    allSides.filter((p) => p !== owner).length > 0 && // someone other than the owner is pushing
    (allSides.length > 1 || owner === null);          // ...into a contested or neutral space

  // Find the strict maximum effective total. Ties resolve to "no change":
  //   • owned territory → the owner holds (defender's edge)
  //   • neutral territory → stays neutral (you must strictly out-commit to claim)
  // This removes the lower-seat bias that a "first-found max" tie-break caused.
  let maxVal = -1;
  let maxCount = 0;
  let maxPid = -1;
  for (const pid of allSides) {
    const v = effective[pid]!;
    if (v > maxVal) { maxVal = v; maxCount = 1; maxPid = pid; }
    else if (v === maxVal) { maxCount += 1; }
  }
  let best: number | null;
  if (owner !== null) {
    // Owner keeps it unless someone STRICTLY beats their effective total.
    best = (maxCount === 1 && maxPid !== owner && maxVal > (effective[owner] ?? 0)) ? maxPid : owner;
  } else {
    // Neutral: a unique strict leader claims it; a tie leaves it neutral.
    best = maxCount === 1 ? maxPid : null;
  }

  return {
    effective,
    previousOwner: owner,
    newOwner: best,
    changed: best !== owner,
    contested,
  };
}
