// Structure building: players can spend resources to erect a permanent structure
// on any region where they currently have at least one die (placed or garrisoned).
// One structure per region. Structures persist across rounds and award their
// printed VP to the builder at end-of-game.

import { produce } from 'immer';
import type { GameState, PlayerId, RegionId, StructureDefinition } from './types';
import { canAfford, spend } from './resources';

/**
 * Can `playerId` build `structure` on `regionId`?
 * Requirements:
 *   - Player has at least one die on the region (placed or garrisoned)
 *   - Region has no existing structure
 *   - Structure is allowed on this terrain
 *   - Player can afford the cost
 */
export function canBuildStructure(
  state: GameState,
  playerId: PlayerId,
  regionId: RegionId,
  structure: StructureDefinition,
): boolean {
  const player = state.players[playerId];
  if (!player) return false;
  const rt = state.regions[regionId];
  if (!rt) return false;
  const region = state.regionDefs[regionId];
  if (!region) return false;

  // Terrain allowed?
  if (!structure.allowedTerrains.includes(region.terrain)) return false;

  // No existing structure on this region.
  if (rt.structure) return false;

  // Player has a die on this region.
  const hasPresence =
    rt.placedDieIds.some((id) => player.dice.some((d) => d.id === id)) ||
    rt.garrisonedDieIds.some((id) => player.dice.some((d) => d.id === id));
  if (!hasPresence) return false;

  // Can afford?
  return canAfford(player, {
    iron: structure.cost.iron ?? 0,
    gold: structure.cost.gold ?? 0,
    essence: structure.cost.essence ?? 0,
  });
}

/** Apply a build-structure move. Returns new state. */
export function applyBuildStructure(
  state: GameState,
  playerId: PlayerId,
  regionId: RegionId,
  structure: StructureDefinition,
): GameState {
  return produce(state, (draft) => {
    const dp = draft.players[playerId]!;
    const rt = draft.regions[regionId]!;

    // Deduct cost.
    Object.assign(
      dp,
      spend(dp, {
        iron: structure.cost.iron ?? 0,
        gold: structure.cost.gold ?? 0,
        essence: structure.cost.essence ?? 0,
      }),
    );

    // Place structure.
    rt.structure = { structureId: structure.id, ownerId: playerId };
  });
}

/** Collect VP from all built structures for end-of-game scoring. */
export function scoreStructures(
  state: GameState,
  structures: StructureDefinition[],
): GameState {
  return produce(state, (draft) => {
    for (const rt of Object.values(draft.regions)) {
      if (!rt.structure) continue;
      const { structureId, ownerId } = rt.structure;
      const def = structures.find((s) => s.id === structureId);
      if (!def) continue;
      const player = draft.players[ownerId];
      if (player) player.vp += def.vp;
    }
  });
}
