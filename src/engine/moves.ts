// Move enumeration and application.
// Phase 1 supports: place, combine, pass.
// Card / merc / battle moves throw NotImplementedYet — added in Phase 2.

import { produce } from 'immer';
import type {
  CardDefinition,
  Die,
  GameState,
  Move,
  Player,
  PlayerId,
  RulesConfig,
  Terrain,
} from './types';
import type { Rng } from './rng';
import { canCombineDice, canPlaceDie } from './map';
import { applyGarrison } from './fortresses';
import { applyHireMerc, isSlotAvailable, mercCost } from './mercenaries';
import {
  applyDraft,
  applyPlay as applyPlayCardEffect,
  draftableCards,
  playableCards,
} from './cards';

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

export interface MoveContext {
  rules: RulesConfig;
  cards?: CardDefinition[];
  rng?: Rng;
}

/** All legal moves for the active player given current state. */
export function enumerate(state: GameState, ctx?: MoveContext): Move[] {
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

  // hire-merc — only if rules supplied (cost depends on rules + freeForAll)
  if (ctx) {
    const cost = mercCost(state, ctx.rules);
    if (player.resources.gold >= cost) {
      for (const slot of ['low', 'high', 'specialist'] as const) {
        if (isSlotAvailable(state, slot)) {
          moves.push({ kind: 'hire-merc', mercSlot: slot });
        }
      }
    }
  }

  // draft-card / play-card require cards definitions
  if (ctx?.cards) {
    for (const id of draftableCards(state, player.id, ctx.cards)) {
      moves.push({ kind: 'draft-card', cardId: id });
    }
    for (const id of playableCards(state, player.id)) {
      moves.push({ kind: 'play-card', cardId: id });
    }
  }

  // pass is always legal
  moves.push({ kind: 'pass' });

  return moves;
}

/** Apply a move; returns new state. Throws IllegalMove if invalid. */
export function apply(state: GameState, move: Move, ctx?: MoveContext): GameState {
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
    case 'draft-card': {
      if (!ctx?.cards) throw new IllegalMove('draft-card requires MoveContext.cards');
      return applyDraftMove(state, move, ctx.cards);
    }
    case 'play-card': {
      if (!ctx?.cards) throw new IllegalMove('play-card requires MoveContext.cards');
      if (!ctx.rng) throw new IllegalMove('play-card requires MoveContext.rng');
      return applyPlayMove(state, move, ctx.cards, ctx.rng);
    }
    case 'hire-merc': {
      if (!ctx) throw new IllegalMove('hire-merc requires MoveContext (rules)');
      return applyHire(state, move, ctx.rules);
    }
  }
}

function applyDraftMove(
  state: GameState,
  move: { kind: 'draft-card'; cardId: string },
  cards: CardDefinition[],
): GameState {
  const next = applyDraft(state, state.activePlayerId, move.cardId, cards);
  return produce(next, (draft) => {
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
}

function applyPlayMove(
  state: GameState,
  move: { kind: 'play-card'; cardId: string },
  cards: CardDefinition[],
  rng: Rng,
): GameState {
  const next = applyPlayCardEffect(state, state.activePlayerId, move.cardId, cards, rng);
  return produce(next, (draft) => {
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
}

function applyHire(
  state: GameState,
  move: { kind: 'hire-merc'; mercSlot: 'low' | 'high' | 'specialist' },
  rules: RulesConfig,
): GameState {
  const next = applyHireMerc(state, state.activePlayerId, move.mercSlot, rules);
  return produce(next, (draft) => {
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
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
    if (region.isFortress) {
      applyGarrison(draft, region.id, player.id, [die.id]);
    } else {
      const dp = draft.players[player.id]!;
      const dd = dp.dice.find((d) => d.id === die.id)!;
      dd.location = { kind: 'region', regionId: region.id };
      const rt = draft.regions[region.id]!;
      rt.placedDieIds.push(die.id);
    }
    trackTerrainProgress(draft, player.id, region.terrain);
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
    if (region.isFortress) {
      applyGarrison(draft, region.id, player.id, move.dieIds);
    } else {
      const dp = draft.players[player.id]!;
      for (const dieId of move.dieIds) {
        const dd = dp.dice.find((d) => d.id === dieId)!;
        dd.location = { kind: 'region', regionId: region.id };
      }
      const rt = draft.regions[region.id]!;
      rt.placedDieIds.push(...move.dieIds);
    }
    draft.players[player.id]!.progress.combinesThisGame += 1;
    trackTerrainProgress(draft, player.id, region.terrain);
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

function trackTerrainProgress(draft: GameState, playerId: PlayerId, terrain: Terrain): void {
  const list = draft.players[playerId]!.progress.terrainsPlacedOn;
  if (!list.includes(terrain)) list.push(terrain);
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
