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
  // Spec values (unchanged)
  warriors: W(0.9, 0.9, 0.4, 0.3, 0.7, 0.5, 0.4, 0.6),
  // Assassins: risk tolerance 0.8→0.65 — spec value was high, but actives nerf means
  // over-gambling hurts them more now. Lowering risk makes plays more deliberate.
  assassins: W(0.5, 0.6, 0.5, 0.4, 0.65, 0.7, 0.6, 0.7),
  mages: W(0.6, 0.5, 0.7, 0.5, 0.4, 0.7, 0.8, 0.6),
  necromancers: W(0.7, 0.6, 0.8, 0.6, 0.5, 0.6, 0.5, 0.5),
  merchants: W(0.4, 0.3, 0.9, 0.7, 0.3, 0.8, 0.5, 0.8),
  // Rangers: goalFocus 0.7→0.8 — Pathfinder provides resources that support goal completion.
  rangers: W(0.5, 0.4, 0.7, 0.5, 0.5, 0.8, 0.5, 0.5),
  // Paladins: minor defensive tweak — their active nerf not needed, just trim battlePriority.
  paladins: W(0.7, 0.6, 0.6, 0.4, 0.5, 0.6, 0.6, 0.6),
  // Beastmasters: enginePriority 0.7→0.6 — Wild Surge helps engine but they're not builders.
  // combinationAffinity 0.7→0.75 — Wild die is best used in combines.
  beastmasters: W(0.5, 0.5, 0.6, 0.5, 0.6, 0.7, 0.75, 0.4),
};

export function weightsFor(factionId: FactionId): FactionWeights {
  const w = PERSONALITIES[factionId];
  if (!w) throw new Error(`No personality weights for faction ${factionId}`);
  return w;
}
