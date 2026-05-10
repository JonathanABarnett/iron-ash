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
  // Spec values
  warriors: W(0.9, 0.9, 0.4, 0.3, 0.7, 0.5, 0.4, 0.6),
  assassins: W(0.5, 0.6, 0.5, 0.4, 0.8, 0.7, 0.6, 0.7),
  mages: W(0.6, 0.5, 0.7, 0.5, 0.4, 0.7, 0.8, 0.6),
  necromancers: W(0.7, 0.6, 0.8, 0.6, 0.5, 0.6, 0.5, 0.5),
  merchants: W(0.4, 0.3, 0.9, 0.7, 0.3, 0.8, 0.5, 0.8),
  // Invented (revisit during balance pass)
  rangers: W(0.5, 0.4, 0.7, 0.5, 0.5, 0.7, 0.5, 0.5),
  paladins: W(0.7, 0.7, 0.6, 0.4, 0.5, 0.6, 0.6, 0.6),
  beastmasters: W(0.5, 0.5, 0.7, 0.5, 0.6, 0.7, 0.7, 0.4),
};

export function weightsFor(factionId: FactionId): FactionWeights {
  const w = PERSONALITIES[factionId];
  if (!w) throw new Error(`No personality weights for faction ${factionId}`);
  return w;
}
