// ─── Iron & Ash v2 — combat resolution ──────────────────────────────────────
//
// THE LINCHPIN of the redesign. Units (ranged dice) are committed to a fight
// and ROLLED at the moment of clash — that's where the dice drama lands.
//
// RESOLUTION
//   each side rolls every committed unit
//   attackerTotal = Σ attacker rolls
//   defenderTotal = Σ defender rolls + terrain defenseBonus
//   higher total wins; TIES go to the DEFENDER (the classic defender's edge)
//
// CASUALTIES — margin-driven, so combat has texture instead of a flat coin-flip:
//   margin M = winnerTotal − loserTotal
//   LOSER  removes their weakest-rolled units one at a time until the removed
//          rolls sum to ≥ M (a blowout kills many; a squeaker kills ~1)
//   WINNER bleeds ONLY in a close fight (M ≤ CLOSE_MARGIN): loses 1 unit.
//          A decisive win (M ≥ 3) is clean — you crush them and walk away.
//
// Why this shape:
//   • Attacking decisively is REWARDED (no losses) → counters defender bias.
//   • Grinding, near-even fights bleed BOTH sides → attrition texture that an
//     attrition faction (Necromancers) can build a whole identity around.
//   • Losses are real (units are persistent) but a single fight rarely wipes
//     a stack outright → no instant death spiral.

import type { Rng } from '../engine/rng';
import { rollUnit, type Unit } from './units';

const CLOSE_MARGIN = 2; // fights won by ≤ this also cost the winner a unit

export interface Combatant {
  units: Unit[];
}

export interface RolledUnit {
  unit: Unit;
  roll: number;
}

export interface BattleResult {
  attackerRolls: RolledUnit[];
  defenderRolls: RolledUnit[];
  attackerTotal: number;
  defenderTotal: number; // includes terrain bonus
  defenseBonus: number;
  winner: 'attacker' | 'defender';
  margin: number;
  /** Units each side KEEPS after the fight. */
  attackerSurvivors: Unit[];
  defenderSurvivors: Unit[];
  attackerLosses: number;
  defenderLosses: number;
  territoryCaptured: boolean;
}

function rollSide(units: Unit[], rng: Rng): RolledUnit[] {
  return units.map((unit) => ({ unit, roll: rollUnit(unit, rng) }));
}

/** Remove weakest-rolled units until removed rolls sum to ≥ margin (min 1 unit). */
function applyLoserCasualties(rolled: RolledUnit[], margin: number): Unit[] {
  const byWeakest = [...rolled].sort((a, b) => a.roll - b.roll);
  let removedValue = 0;
  let removed = 0;
  for (const r of byWeakest) {
    if (removed >= 1 && removedValue >= margin) break;
    removedValue += r.roll;
    removed += 1;
  }
  // Survivors = the strongest (rolled.length - removed) units.
  return byWeakest.slice(removed).map((r) => r.unit);
}

/** A close win costs the winner their single weakest-rolled unit. */
function applyWinnerCasualties(rolled: RolledUnit[], margin: number): Unit[] {
  if (margin > CLOSE_MARGIN || rolled.length === 0) return rolled.map((r) => r.unit);
  const byWeakest = [...rolled].sort((a, b) => a.roll - b.roll);
  return byWeakest.slice(1).map((r) => r.unit);
}

export function resolveBattle(
  attacker: Combatant,
  defender: Combatant,
  defenseBonus: number,
  rng: Rng,
): BattleResult {
  const attackerRolls = rollSide(attacker.units, rng);
  const defenderRolls = rollSide(defender.units, rng);

  const attackerTotal = attackerRolls.reduce((s, r) => s + r.roll, 0);
  const defenderTotal = defenderRolls.reduce((s, r) => s + r.roll, 0) + defenseBonus;

  const attackerWins = attackerTotal > defenderTotal; // ties → defender
  const margin = Math.abs(attackerTotal - defenderTotal);

  let attackerSurvivors: Unit[];
  let defenderSurvivors: Unit[];

  if (attackerWins) {
    defenderSurvivors = applyLoserCasualties(defenderRolls, margin);
    attackerSurvivors = applyWinnerCasualties(attackerRolls, margin);
  } else {
    attackerSurvivors = applyLoserCasualties(attackerRolls, margin);
    defenderSurvivors = applyWinnerCasualties(defenderRolls, margin);
  }

  return {
    attackerRolls,
    defenderRolls,
    attackerTotal,
    defenderTotal,
    defenseBonus,
    winner: attackerWins ? 'attacker' : 'defender',
    margin,
    attackerSurvivors,
    defenderSurvivors,
    attackerLosses: attacker.units.length - attackerSurvivors.length,
    defenderLosses: defender.units.length - defenderSurvivors.length,
    territoryCaptured: attackerWins,
  };
}

/** Human-readable one-liner for the combat log / UI banner. */
export function describeBattle(r: BattleResult, attackerName: string, defenderName: string, territory: string): string {
  const def = r.defenseBonus > 0 ? ` (incl +${r.defenseBonus} terrain)` : '';
  const score = `${r.attackerTotal} vs ${r.defenderTotal}${def}`;
  if (r.territoryCaptured) {
    const flavor = r.margin >= 6 ? ' — a rout!' : r.margin <= 2 ? ' — by a hair!' : '';
    return `${attackerName} took ${territory}, ${score}${flavor} (${defenderName} lost ${r.defenderLosses}, ${attackerName} lost ${r.attackerLosses}).`;
  }
  const flavor = r.margin >= 6 ? ' — crushed the assault.' : r.margin === 0 ? ' — held on a tie!' : ' — held.';
  return `${defenderName} kept ${territory}, ${score}${flavor} (${attackerName} lost ${r.attackerLosses}, ${defenderName} lost ${r.defenderLosses}).`;
}
