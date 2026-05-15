// Move enumeration and application.
// Phase 1 supports: place, combine, pass.
// Card / merc / battle moves throw NotImplementedYet — added in Phase 2.

import { produce } from 'immer';
import type {
  CardDefinition,
  CostsConfig,
  Die,
  GameState,
  Move,
  Player,
  PlayerId,
  RulesConfig,
  StructureDefinition,
  Terrain,
} from './types';
import { nextDieRange, upgradeTerrainRequirement } from './types';
import type { Rng } from './rng';
import { Rng as RngClass, makeIdFactory } from './rng';
import { canAfford, spend } from './resources';
import { canCombineDice, canPlaceDie, playerControlsTerrain } from './map';
import { applyGarrison } from './fortresses';
import { applyHireMerc, isSlotAvailable, mercCost } from './mercenaries';
import {
  applyDraft,
  applyPlay as applyPlayCardEffect,
  draftableCards,
  playableCards,
} from './cards';
import { applyBattle, canBattle } from './battle';
import { applyActive, canUseActive } from './factions/abilities';
import { applyBuildStructure, canBuildStructure } from './structures';

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
  costs?: CostsConfig;
  structures?: StructureDefinition[];
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

  // hire-merc — check per-slot cost (Assassins get Low for free, etc.)
  if (ctx) {
    for (const slot of ['low', 'high', 'specialist'] as const) {
      if (!isSlotAvailable(state, slot)) continue;
      const slotCost = mercCost(state, ctx.rules, player.id, slot);
      if (player.resources.gold >= slotCost) {
        moves.push({ kind: 'hire-merc', mercSlot: slot });
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

  // battle — non-fortress region with at least one enemy die
  for (const die of player.dice) {
    if (die.location.kind !== 'barracks') continue;
    if (die.faceValue === null) continue;
    for (const region of Object.values(state.regionDefs)) {
      if (canBattle(state, die, region.id)) {
        moves.push({ kind: 'battle', attackerDieId: die.id, targetRegionId: region.id });
      }
    }
  }

  // upgrade-die — for each barracks die that has a next tier, player can afford,
  // AND any advanced terrain requirement is satisfied (2-5→3-6 needs mountain/fortress).
  if (ctx?.costs && canAfford(player, ctx.costs.dieUpgrade)) {
    for (const die of player.dice) {
      if (die.location.kind !== 'barracks') continue;
      const targetRange = nextDieRange(die.range);
      if (!targetRange) continue;
      const terrainReq = upgradeTerrainRequirement(targetRange);
      if (terrainReq && !playerControlsTerrain(state, player.id, terrainReq)) continue;
      moves.push({ kind: 'upgrade-die', dieId: die.id });
    }
  }

  // expand-barracks — if below faction max and affordable
  if (ctx?.costs && canAfford(player, ctx.costs.barracksExpand)) {
    if (player.dice.length < player.barracksMax) {
      moves.push({ kind: 'expand-barracks' });
    }
  }

  // use-active — once per round, if not yet used
  if (canUseActive(state, player.id)) {
    moves.push({ kind: 'use-active' });
  }

  // build-structure — for each structure the player can afford on a region they occupy
  if (ctx?.structures) {
    for (const structure of ctx.structures) {
      for (const region of Object.values(state.regionDefs)) {
        if (canBuildStructure(state, player.id, region.id, structure)) {
          moves.push({ kind: 'build-structure', structureId: structure.id, regionId: region.id });
        }
      }
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
      return applyHire(state, move, ctx);
    }
    case 'battle':
      return applyBattleMove(state, move, ctx?.rules?.resourceCap ?? 8);
    case 'upgrade-die': {
      if (!ctx?.costs) throw new IllegalMove('upgrade-die requires MoveContext.costs');
      return applyUpgradeDie(state, move, ctx.costs);
    }
    case 'expand-barracks': {
      if (!ctx?.costs || !ctx.rng) throw new IllegalMove('expand-barracks requires MoveContext.costs + rng');
      return applyExpandBarracks(state, ctx.costs, ctx.rng);
    }
    case 'use-active': {
      return applyActiveMove(state, move);
    }
    case 'build-structure': {
      if (!ctx?.structures) throw new IllegalMove('build-structure requires MoveContext.structures');
      return applyBuildStructureMove(state, move, ctx.structures);
    }
  }
}

function applyBattleMove(
  state: GameState,
  move: { kind: 'battle'; attackerDieId: string; targetRegionId: string },
  resourceCap = 8,
): GameState {
  const { state: next } = applyBattle(
    state,
    state.activePlayerId,
    move.attackerDieId,
    move.targetRegionId,
    resourceCap,
  );
  return produce(next, (draft) => {
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
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
  move: { kind: 'play-card'; cardId: string; targetDieId?: string; targetRegionId?: string },
  cards: CardDefinition[],
  rng: Rng,
): GameState {
  const next = applyPlayCardEffect(
    state,
    state.activePlayerId,
    move.cardId,
    cards,
    rng,
    move.targetDieId,
    move.targetRegionId,
  );
  return produce(next, (draft) => {
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
}

function applyHire(
  state: GameState,
  move: { kind: 'hire-merc'; mercSlot: 'low' | 'high' | 'specialist' },
  ctx: MoveContext,
): GameState {
  // Pass rng so Mages can reroll the hired die (Arcane Analysis perk).
  const next = applyHireMerc(state, state.activePlayerId, move.mercSlot, ctx.rules, ctx.rng);
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
    // Consume combine bonus if it was active.
    draft.players[player.id]!.hasCombineBonus = false;
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

function applyUpgradeDie(
  state: GameState,
  move: { kind: 'upgrade-die'; dieId: string },
  costs: CostsConfig,
): GameState {
  const player = getActivePlayer(state);
  const die = getDie(state, player.id, move.dieId);
  const next = nextDieRange(die.range);
  if (!next) throw new IllegalMove(`Die ${die.id} (${die.range}) cannot be upgraded further`);
  if (!canAfford(player, costs.dieUpgrade)) {
    throw new IllegalMove(`Cannot afford die upgrade (need ${JSON.stringify(costs.dieUpgrade)})`);
  }
  const terrainReq = upgradeTerrainRequirement(next);
  if (terrainReq && !playerControlsTerrain(state, player.id, terrainReq)) {
    throw new IllegalMove(
      `Upgrading to ${next} requires controlling a ${terrainReq.join(' or ')} region`,
    );
  }
  return produce(state, (draft) => {
    const dp = draft.players[player.id]!;
    Object.assign(dp, spend(dp, costs.dieUpgrade));
    const d = dp.dice.find((x) => x.id === die.id)!;
    d.range = next;
    // Reroll with the new range immediately so the new face is valid.
    // (The die stays in barracks; it will be properly rolled next round.)
    // For now just null the face — it will re-roll at start of next round.
    d.faceValue = null;
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
}

function applyExpandBarracks(
  state: GameState,
  costs: CostsConfig,
  rng: CostsConfig extends object ? InstanceType<typeof RngClass> : never,
): GameState {
  const player = getActivePlayer(state);
  if (player.dice.length >= player.barracksMax) {
    throw new IllegalMove('Barracks already at faction maximum');
  }
  if (!canAfford(player, costs.barracksExpand)) {
    throw new IllegalMove('Cannot afford barracks expansion');
  }
  const dieId = makeIdFactory(rng as InstanceType<typeof RngClass>, `expand`);
  return produce(state, (draft) => {
    const dp = draft.players[player.id]!;
    Object.assign(dp, spend(dp, costs.barracksExpand));
    const newDie = {
      id: dieId(),
      range: '1-3' as const,
      faceValue: null,
      ownerId: player.id,
      location: { kind: 'barracks' as const },
    };
    dp.dice.push(newDie);
    appendLog(draft, { kind: 'move', move: { kind: 'expand-barracks' } });
    advanceTurn(draft);
  });
}

function applyActiveMove(
  state: GameState,
  move: { kind: 'use-active'; dieId?: string; targetValue?: number; targetRegionId?: string },
): GameState {
  const playerId = state.activePlayerId;
  const next = applyActive(state, playerId, move.dieId, move.targetValue, move.targetRegionId);
  return produce(next, (draft) => {
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
}

function applyBuildStructureMove(
  state: GameState,
  move: { kind: 'build-structure'; structureId: string; regionId: string },
  structures: StructureDefinition[],
): GameState {
  const structure = structures.find((s) => s.id === move.structureId);
  if (!structure) throw new IllegalMove(`Unknown structure: ${move.structureId}`);
  if (!canBuildStructure(state, state.activePlayerId, move.regionId, structure)) {
    throw new IllegalMove(`Cannot build ${move.structureId} on ${move.regionId}`);
  }
  const next = applyBuildStructure(state, state.activePlayerId, move.regionId, structure);
  return produce(next, (draft) => {
    appendLog(draft, { kind: 'move', move });
    advanceTurn(draft);
  });
}
