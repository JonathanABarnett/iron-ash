// Per-faction AI personality weights. Five entries (Warriors, Assassins,
// Mages, Necromancers, Merchants) match the spec verbatim. Three (Rangers,
// Paladins, Beastmasters) are tuned to roughly match faction identity until
// playtesting nails them down.

import type { FactionId } from '../engine/types';
import type { FactionWeights, FactionWeightsTable } from './types';

const W = (
  fortress: number,
  battle: number,
  engine: number,
  hoard: number,
  risk: number,
  goal: number,
  combo: number,
  merc: number,
): FactionWeights => ({
  fortressPriority: fortress,
  battlePriority: battle,
  enginePriority: engine,
  resourceHoarding: hoard,
  riskTolerance: risk,
  goalFocus: goal,
  combinationAffinity: combo,
  mercenaryAffinity: merc,
});

export const PERSONALITIES: FactionWeightsTable = {
  // Warriors: battlePriority 0.9→0.75 — raw aggression was too dominant in 1v1 (61.7%).
  // Still the most battle-focused faction; 0.75 keeps the identity without overrunning 1v1.
  warriors: W(0.9, 0.75, 0.4, 0.3, 0.7, 0.5, 0.4, 0.6),
  // Assassins: goalFocus 0.55→0.45, riskTolerance 0.5→0.4 — exhaustive 28-matchup test
  // confirmed +8.6pp in 1v1, +7.8pp in 3-player. Shadow Step + First Refusal combo is strong;
  // reducing goal-seeking and risk-taking to make plays more conservative.
  assassins: W(0.5, 0.6, 0.5, 0.4, 0.4, 0.45, 0.6, 0.55),
  // Mages: combinationAffinity dialled to 0.55 (was 0.65 → 0.45 was too aggressive, crashed to 30%).
  // enginePriority 0.55 (from 0.70) — still building engine, but spending resources faster
  // (resourceHoarding 0.35) to establish board presence earlier.
  mages: W(0.8, 0.65, 0.55, 0.35, 0.5, 0.65, 0.55, 0.6),
  // Necromancers: gold passive reverted; keeping improved personality (fortress 0.7, engine 0.6,
  // mercenaryAffinity 0.65). Without gold passive, they're more dependent on region income
  // for mercs — which is correct; Soul Conversion is a reward for smart play, not free gold.
  necromancers: W(0.7, 0.6, 0.6, 0.6, 0.5, 0.6, 0.5, 0.65),
  // Merchants: enginePriority 0.9→0.75, goalFocus 0.8→0.65 — gold compounding was too
  // efficient in 3-player (44.4% wins). They should be flexible traders, not pure engine builders.
  merchants: W(0.4, 0.3, 0.75, 0.7, 0.3, 0.65, 0.5, 0.6),
  // Rangers: goalFocus 0.5→0.35 — were winning at 67.5% in 1v1 despite earlier nerfs.
  // Pathfinder now gives +gold+essence (dropped iron to stop stacking with +1 iron passive).
  // Lower goalFocus makes them scouts/skirmishers rather than round-goal hunters.
  rangers: W(0.5, 0.5, 0.65, 0.4, 0.5, 0.35, 0.5, 0.5),
  // Paladins: minor defensive tweak — their active nerf not needed, just trim battlePriority.
  paladins: W(0.7, 0.6, 0.6, 0.4, 0.5, 0.6, 0.6, 0.6),
  // Beastmasters: combinationAffinity 0.75→0.6 — was 37% in 4-player (+12pp).
  // Wild Surge combines are strong but shouldn't dominate every turn; balanced back.
  beastmasters: W(0.5, 0.5, 0.6, 0.5, 0.6, 0.7, 0.6, 0.4),
};

export function weightsFor(factionId: FactionId): FactionWeights {
  const w = PERSONALITIES[factionId];
  if (!w) throw new Error(`No personality weights for faction ${factionId}`);
  return w;
}
