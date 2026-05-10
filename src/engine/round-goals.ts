// Round-goal measure functions. Each returns a number per player; the goal's
// `direction` decides whether highest or lowest wins. Ties share full VP.

import type { GameState, Move, PlayerId, RoundGoalId, Terrain } from './types';

export type RoundGoalMeasure = (state: GameState, playerId: PlayerId) => number;

const RESOURCE_KEYS: Array<'iron' | 'gold' | 'essence'> = ['iron', 'gold', 'essence'];

function totalResources(state: GameState, pid: PlayerId): number {
  const p = state.players[pid]!;
  return p.resources.iron + p.resources.gold + p.resources.essence;
}

function countMovesThisRound(
  state: GameState,
  pid: PlayerId,
  pred: (m: Move) => boolean,
): number {
  let n = 0;
  for (const entry of state.log) {
    if (entry.round !== state.round) continue;
    if (entry.playerId !== pid) continue;
    if (entry.event.kind !== 'move') continue;
    if (pred(entry.event.move)) n += 1;
  }
  return n;
}

function placedDieFaceValuesThisRound(state: GameState, pid: PlayerId): number[] {
  const out: number[] = [];
  for (const entry of state.log) {
    if (entry.round !== state.round) continue;
    if (entry.playerId !== pid) continue;
    if (entry.event.kind !== 'move') continue;
    const m = entry.event.move;
    if (m.kind === 'place') {
      const die = state.players[pid]!.dice.find((d) => d.id === m.dieId);
      if (die?.faceValue !== null && die?.faceValue !== undefined) out.push(die.faceValue);
    } else if (m.kind === 'combine') {
      for (const id of m.dieIds) {
        const die = state.players[pid]!.dice.find((d) => d.id === id);
        if (die?.faceValue !== null && die?.faceValue !== undefined) out.push(die.faceValue);
      }
    }
  }
  return out;
}

export const ROUND_GOAL_MEASURES: Record<RoundGoalId, RoundGoalMeasure> = {
  'most-fortresses': (state, pid) => {
    let n = 0;
    for (const rt of Object.values(state.regions)) {
      if (rt.garrisonOwnerId === pid) n += 1;
    }
    return n;
  },
  'most-regions': (state, pid) => {
    const set = new Set<string>();
    for (const rt of Object.values(state.regions)) {
      const ids = [...rt.placedDieIds, ...rt.garrisonedDieIds];
      for (const id of ids) {
        const die = state.players[pid]?.dice.find((d) => d.id === id);
        if (die) {
          set.add(rt.regionId);
          break;
        }
      }
    }
    return set.size;
  },
  'most-combines': (state, pid) => countMovesThisRound(state, pid, (m) => m.kind === 'combine'),
  'least-resources': totalResources,
  'most-low-placements': (state, pid) =>
    placedDieFaceValuesThisRound(state, pid).filter((v) => v <= 2).length,
  'most-high-placements': (state, pid) =>
    placedDieFaceValuesThisRound(state, pid).filter((v) => v >= 5).length,
  'most-dice-placed': (state, pid) => {
    const p = state.players[pid]!;
    return p.dice.filter((d) => d.location.kind !== 'barracks').length;
  },
  'equal-resources': (state, pid) => {
    const p = state.players[pid]!;
    return Math.min(...RESOURCE_KEYS.map((k) => p.resources[k]));
  },
  'most-iron': (state, pid) => state.players[pid]!.resources.iron,
  'most-gold': (state, pid) => state.players[pid]!.resources.gold,
  'most-essence': (state, pid) => state.players[pid]!.resources.essence,
  'most-passes': (state, pid) => countMovesThisRound(state, pid, (m) => m.kind === 'pass'),
};

/** Distinct terrains a player has dice placed/garrisoned on right now. */
export function currentlyPlacedTerrains(state: GameState, pid: PlayerId): Terrain[] {
  const set = new Set<Terrain>();
  for (const rt of Object.values(state.regions)) {
    const def = state.regionDefs[rt.regionId];
    if (!def) continue;
    const ids = [...rt.placedDieIds, ...rt.garrisonedDieIds];
    for (const id of ids) {
      const die = state.players[pid]?.dice.find((d) => d.id === id);
      if (die) {
        set.add(def.terrain);
        break;
      }
    }
  }
  return Array.from(set);
}
