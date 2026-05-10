// Secret-goal predicates evaluated at game end. Each returns true if the player completed it.

import type { GameState, PlayerId, SecretGoalId, Terrain } from './types';

export type SecretGoalCheck = (state: GameState, playerId: PlayerId) => boolean;

const TERRAINS: Terrain[] = ['fortress', 'forest', 'mountain', 'swamp', 'plains', 'ruins'];

function fortressesHeld(state: GameState, pid: PlayerId): number {
  let n = 0;
  for (const rt of Object.values(state.regions)) {
    if (rt.garrisonOwnerId === pid) n += 1;
  }
  return n;
}

function diceInBarracks(state: GameState, pid: PlayerId): number {
  return state.players[pid]!.dice.filter((d) => d.location.kind === 'barracks').length;
}

function regionsControlledByTerrain(state: GameState, pid: PlayerId): Map<Terrain, number> {
  const counts = new Map<Terrain, number>();
  for (const rt of Object.values(state.regions)) {
    const def = state.regionDefs[rt.regionId];
    if (!def) continue;
    const ids = [...rt.placedDieIds, ...rt.garrisonedDieIds];
    let owned = false;
    for (const id of ids) {
      const die = state.players[pid]?.dice.find((d) => d.id === id);
      if (die) {
        owned = true;
        break;
      }
    }
    if (owned) counts.set(def.terrain, (counts.get(def.terrain) ?? 0) + 1);
  }
  return counts;
}

export const SECRET_GOAL_CHECKS: Record<SecretGoalId, SecretGoalCheck> = {
  'held-3-fortresses': (state, pid) => state.players[pid]!.progress.maxFortressesSimultaneous >= 3,

  'combined-5-times': (state, pid) => state.players[pid]!.progress.combinesThisGame >= 5,

  'controls-4-same-terrain': (state, pid) => {
    const counts = regionsControlledByTerrain(state, pid);
    for (const v of counts.values()) if (v >= 4) return true;
    return false;
  },

  'max-resource-6plus': (state, pid) => {
    const r = state.players[pid]!.resources;
    return r.iron >= 6 || r.gold >= 6 || r.essence >= 6;
  },

  'all-dice-deployed': (state, pid) => {
    const p = state.players[pid]!;
    return p.progress.maxDicePlacedAtRoundEnd >= p.dice.length;
  },

  'placed-on-all-terrains': (state, pid) => {
    const placed = new Set(state.players[pid]!.progress.terrainsPlacedOn);
    return TERRAINS.every((t) => placed.has(t));
  },

  'fortress-end-game': (state, pid) => fortressesHeld(state, pid) >= 2,

  'no-dice-in-barracks-end': (state, pid) => diceInBarracks(state, pid) === 0,

  'won-3-battles': (state, pid) => state.players[pid]!.progress.battlesWonThisGame >= 3,

  'hired-3-mercs': (state, pid) => state.players[pid]!.progress.mercsHiredThisGame >= 3,
};
