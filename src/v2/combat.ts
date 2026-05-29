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

  // Pick the highest effective total; ties go to the current owner.
  let best: number | null = owner;
  let bestVal = owner !== null ? (effective[owner] ?? 0) : -1;
  for (const pid of allSides) {
    if (pid === owner) continue;
    const v = effective[pid]!;
    if (v > bestVal) { best = pid; bestVal = v; }
  }
  // Neutral territory with a single uncontested claimant → they take it.
  if (owner === null && allSides.length >= 1) {
    let topPid = allSides[0]!, topVal = effective[topPid]!;
    for (const pid of allSides) { if (effective[pid]! > topVal) { topPid = pid; topVal = effective[pid]!; } }
    best = topPid;
  }

  return {
    effective,
    previousOwner: owner,
    newOwner: best,
    changed: best !== owner,
    contested,
  };
}
