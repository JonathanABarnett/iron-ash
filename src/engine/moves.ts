// Move enumeration and application.
// Phase 1 supports: place, combine, pass.
// Card / merc / battle moves throw NotImplementedYet — added in Phase 2.

import { produce } from 'immer';
import type { Die, GameState, Move, Player, PlayerId } from './types';
import { canCombineDice, canPlaceDie } from './map';

export class NotImplementedYet extends Error {
  constructor(feature: string) {
    super(`Not implemented yet (Phase 2+): ${feature}`);
    this.name = 'NotImplementedYet';
  }
}

export class IllegalMove extends Error {
  constructor(reason: string) {
    super(`Illegal move: ${reason}`);
    this.name = 'IllegalMove';
  }
}

export function getActivePlayer(state: GameState): Player {
  const p = state.players[state.activePlayerId];
  if (!p) throw new Error(`Active player not found: ${state.activePlayerId}`);
  return p;
}

export function getDie(state: GameState, ownerId: PlayerId, dieId: string): Die {
  const player = state.players[ownerId];
  if (!player) throw new Error(`Player not found: ${ownerId}`);
  const die = player.dice.find((d) => d.id === dieId);
  if (!die) throw new Error(`Die not found on player ${ownerId}: ${dieId}`);
  return die;
}

/** All legal moves for the active player given current state. Phase 1 scope. */
export function enumerate(state: GameState): Move[] {
  if (state.phase !== 'action') return [];
  const player = getActivePlayer(state);
  const moves: Move[] = [];

  // place
  for (const die of player.dice) {
    if (die.location.kind !== 'barracks') continue;
    if (die.faceValue === null) continue;
    for (const region of Object.values(state.regionDefs)) {
      if (canPlaceDie(die, region, state)) {
        moves.push({ kind: 'place', dieId: die.id, regionId: region.id });
      }
    }
  }

  // combine — pairs of barracks dice that together meet a region requirement
  const barracksDice = player.dice.filter(
    (d) => d.location.kind === 'barracks' && d.faceValue !== null,
  );
  for (let i = 0; i < barracksDice.length; i++) {
    for (let j = i + 1; j < barracksDice.length; j++) {
      const a = barracksDice[i]!;
      const b = barracksDice[j]!;
      for (const region of Object.values(state.regionDefs)) {
        if (canCombineDice(a, b, region, state)) {
          moves.push({ kind: 'combine', dieIds: [a.id, b.id], regionId: region.id });
        }
      }
    }
  }

  // pass is always legal
  moves.push({ kind: 'pass' });

  return moves;
}

/** Apply a move; returns new state. Throws IllegalMove if invalid. */
export function apply(state: GameState, move: Move): GameState {
  if (state.phase !== 'action') {
    throw new IllegalMove(`apply() called in phase ${state.phase}`);
  }
  switch (move.kind) {
    case 'place':
      return applyPlace(state, move);
    case 'combine':
      return applyCombine(state, move);
    case 'pass':
      return applyPass(state);
    case 'play-card':
      throw new NotImplementedYet('play-card');
    case 'hire-merc':
      throw new NotImplementedYet('hire-merc');
  }
}

function applyPlace(
  state: GameState,
  move: { kind: 'place'; dieId: string; regionId: string },
): GameState {
  const player = getActivePlayer(state);
  const die = getDie(state, player.id, move.dieId);
  const region = state.regionDefs[move.regionId];
  if (!region) throw new IllegalMove(`Unknown region: ${move.regionId}`);
  if (!canPlaceDie(die, region, state)) {
    throw new IllegalMove(`Cannot place die ${die.id} on region ${region.id}`);
  }

  return produce(state, (draft) => {
    const dp = draft.players[player.id]!;
    const dd = dp.dice.find((d) => d.id === die.id)!;
    dd.location = { kind: 'region', regionId: region.id };
    const rt = draft.regions[region.id]!;
    rt.placedDieIds.push(die.id);
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
}

function applyCombine(
  state: GameState,
  move: { kind: 'combine'; dieIds: [string, string]; regionId: string },
): GameState {
  const player = getActivePlayer(state);
  const a = getDie(state, player.id, move.dieIds[0]);
  const b = getDie(state, player.id, move.dieIds[1]);
  const region = state.regionDefs[move.regionId];
  if (!region) throw new IllegalMove(`Unknown region: ${move.regionId}`);
  if (!canCombineDice(a, b, region, state)) {
    throw new IllegalMove(`Cannot combine ${a.id}+${b.id} on ${region.id}`);
  }

  return produce(state, (draft) => {
    const dp = draft.players[player.id]!;
    for (const dieId of move.dieIds) {
      const dd = dp.dice.find((d) => d.id === dieId)!;
      dd.location = { kind: 'region', regionId: region.id };
    }
    const rt = draft.regions[region.id]!;
    rt.placedDieIds.push(...move.dieIds);
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
}

function applyPass(state: GameState): GameState {
  return produce(state, (draft) => {
    const dp = draft.players[draft.activePlayerId]!;
    dp.passedThisRound = true;
    appendLog(draft, { kind: 'move', move: { kind: 'pass' } });
    advanceTurn(draft);
  });
}

function appendLog(
  draft: GameState,
  event: GameState['log'][number]['event'],
): void {
  draft.log.push({
    round: draft.round,
    turn: draft.turn,
    playerId: draft.activePlayerId,
    event,
  });
}

/** Rotate to next non-passed player. End-of-round detection lives in rounds.ts. */
function advanceTurn(draft: GameState): void {
  draft.turn += 1;
  const order = draft.turnOrder;
  let idx = order.indexOf(draft.activePlayerId);
  for (let i = 0; i < order.length; i++) {
    idx = (idx + 1) % order.length;
    const candidate = order[idx]!;
    if (!draft.players[candidate]!.passedThisRound) {
      draft.activePlayerId = candidate;
      return;
    }
  }
  // Everyone passed; leave activePlayerId as-is. rounds.ts detects round-over.
}
