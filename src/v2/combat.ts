// ─── Iron & Ash v2 — combat resolution ──────────────────────────────────────
//
// This is the LINCHPIN of the v2 redesign. In v1, dice were placed on
// number-slots — no drama. Here, dice are FORCES you commit to a fight, and
// you ROLL FOR territory with real stakes. A good roll is a rush; a bad one
// hurts. That is the emotional core v1 was missing.
//
// RESOLUTION
//   attackerTotal = sum(attacker dice)
//   defenderTotal = sum(defender dice) + terrain defenseBonus
//   higher total wins; TIES go to the DEFENDER (classic defender's edge)
//
// CASUALTIES (deliberately punchy for the first prototype — tune via sim)
//   loser:  all committed dice are lost (the assault is broken / the garrison falls)
//   winner: loses their single weakest committed die (the vanguard who fell)
//
// The winner-still-bleeds rule is what makes attacking a real DECISION: even a
// won fight costs you a die, so you can't just swing at everything for free.

export interface Combatant {
  /** Face values of the dice committed to this fight. */
  dice: number[];
}

export interface BattleResult {
  attackerTotal: number;
  defenderTotal: number;
  defenseBonus: number;
  winner: 'attacker' | 'defender';
  /** Face values the attacker KEEPS after the fight. */
  attackerSurviving: number[];
  /** Face values the defender KEEPS after the fight. */
  defenderSurviving: number[];
  attackerLosses: number;
  defenderLosses: number;
  /** True when the attacker takes the territory. */
  territoryCaptured: boolean;
  /** Margin of victory (winner total − loser total) — drives narration drama. */
  margin: number;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

/** Drop the single lowest value from a list (the vanguard who fell). */
function dropLowest(xs: number[]): number[] {
  if (xs.length === 0) return [];
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.slice(1);
}

export function resolveBattle(
  attacker: Combatant,
  defender: Combatant,
  defenseBonus: number,
): BattleResult {
  const attackerTotal = sum(attacker.dice);
  const defenderTotal = sum(defender.dice) + defenseBonus;

  // Ties favour the defender.
  const attackerWins = attackerTotal > defenderTotal;
  const winner: 'attacker' | 'defender' = attackerWins ? 'attacker' : 'defender';
  const margin = Math.abs(attackerTotal - defenderTotal);

  let attackerSurviving: number[];
  let defenderSurviving: number[];

  if (attackerWins) {
    // Attacker wins: keeps all but their weakest die; defender is wiped.
    attackerSurviving = dropLowest(attacker.dice);
    defenderSurviving = [];
  } else {
    // Defender holds: keeps all but their weakest die; attacker's assault breaks.
    attackerSurviving = [];
    defenderSurviving = dropLowest(defender.dice);
  }

  return {
    attackerTotal,
    defenderTotal,
    defenseBonus,
    winner,
    attackerSurviving,
    defenderSurviving,
    attackerLosses: attacker.dice.length - attackerSurviving.length,
    defenderLosses: defender.dice.length - defenderSurviving.length,
    territoryCaptured: attackerWins,
    margin,
  };
}

/** Human-readable one-liner for the combat log / UI banner. */
export function describeBattle(r: BattleResult, attackerName: string, defenderName: string, territory: string): string {
  const def = r.defenseBonus > 0 ? ` (+${r.defenseBonus} terrain)` : '';
  const score = `${r.attackerTotal} vs ${r.defenderTotal}${def}`;
  if (r.territoryCaptured) {
    const rout = r.margin >= 5 ? ' — a rout!' : r.margin <= 1 ? ' — barely!' : '';
    return `${attackerName} stormed ${territory} ${score}${rout} ${defenderName} was wiped; ${attackerName} lost ${r.attackerLosses} die.`;
  }
  const hold = r.margin >= 5 ? ' — held with ease.' : r.margin === 0 ? ' — held on a tie!' : ' — held the line.';
  return `${defenderName} defended ${territory} ${score}${hold} ${attackerName}'s assault broke (${r.attackerLosses} lost).`;
}
