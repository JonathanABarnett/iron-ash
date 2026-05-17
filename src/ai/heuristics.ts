// Heuristic estimates fed into scoreMove. Each function is intentionally
// lightweight — refined estimates land during the Phase 4 balance pass once
// sim results expose which heuristics matter.

import type {
  CardDefinition,
  CardEffect,
  GameState,
  Move,
  PlayerId,
  Region,
  RoundGoalDefinition,
  SecretGoalDefinition,
} from '../engine/types';
import { defenderSum } from '../engine/battle';
import { meetsRequirement, isRegionUnlocked } from '../engine/map';
import { ROUND_GOAL_MEASURES } from '../engine/round-goals';
import { SECRET_GOAL_CHECKS } from '../engine/secret-goals';

/** Direct VP a move is expected to add this turn. */
export function estimateVPGain(move: Move, state: GameState): number {
  switch (move.kind) {
    case 'place': {
      const region = state.regionDefs[move.regionId];
      if (!region) return 0;
      // Garrisoning a fortress is a per-round VP plus end-game.
      if (region.isFortress) return 1 + region.vp * 0.3;
      return region.vp * 0.4;
    }
    case 'combine': {
      const region = state.regionDefs[move.regionId];
      if (!region) return 0;
      if (region.isFortress) return 1.5 + region.vp * 0.3;
      return region.vp * 0.6;
    }
    case 'battle': {
      // 1 VP for winning + war spoils (+1 iron) + threat-track tick is a hidden cost.
      const winChance = estimateBattleWinChance(state, move);
      return (1 + 0.4) * winChance; // 1 VP + ~0.4 iron-equivalent
    }
    case 'hire-merc':
      // A hired merc die is worth roughly one future placement.
      // Specialist gets a value-aware bump in score.ts via evaluateSpecialistHire.
      return move.mercSlot === 'specialist' ? 1.5 : 1.0;
    case 'draft-card':
      // Drafting a card is always incrementally valuable — having options matters.
      return 0.3;
    case 'play-card':
      // Scored by scorePlayCard below; return 0 here so the resource path handles it.
      return 0;
    case 'upgrade-die':
      return 1.5;
    case 'expand-barracks':
      return 1.0;
    case 'use-active':
      // Active abilities are generally worth using — rough estimate.
      return 1.2;
    case 'build-structure':
      return 2; // structures yield 2-4 VP; use a conservative estimate
    case 'pass':
      return 0;
  }
}

/** Net resource swing as a VP-equivalent value (1 resource ≈ 0.4 VP for now). */
export function estimateResourceGain(
  move: Move,
  _state: GameState,
  cards?: CardDefinition[],
): number {
  switch (move.kind) {
    case 'draft-card': {
      if (!cards) return 0;
      const card = cards.find((c) => c.id === move.cardId);
      if (!card) return 0;
      const cost =
        (card.cost.iron ?? 0) + (card.cost.gold ?? 0) + (card.cost.essence ?? 0);
      // Drafting is "resource invested for future value"; treat as a small loss
      // unless effect is gain-resource greater than cost.
      let payoff = 0;
      if (card.effect.kind === 'gain-resource') payoff = card.effect.amount;
      if (card.effect.kind === 'gain-vp') payoff = card.effect.amount * 2.5;
      return (payoff - cost) * 0.4;
    }
    case 'play-card': {
      if (!cards) return 0;
      const card = cards.find((c) => c.id === move.cardId);
      if (!card) return 0;
      switch (card.effect.kind) {
        case 'gain-resource':
          return card.effect.amount * 0.4;
        case 'gain-vp':
          return card.effect.amount;
        case 'modify-die':
        case 'reroll-die':
          return 0.3;
      }
      return 0;
    }
    case 'hire-merc':
      // Spending 3 gold for a die that may place; rough -1 VP swing.
      return -1;
    case 'build-structure':
      // Building a structure costs 3-5 resources; deduct opportunity cost.
      return -1.0;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Play-card VP scoring helpers
// ---------------------------------------------------------------------------

/**
 * Count how many regions in `state.regionDefs` the player's barracks die with
 * `faceValue` would newly be able to place on after a `delta` modification.
 * "Newly reachable" means the region is legal with `faceValue + delta` but not
 * with the original `faceValue`.
 */
function newlyReachableCount(
  faceValue: number,
  delta: number,
  state: GameState,
  ownerId: PlayerId,
): number {
  const modified = faceValue + delta;
  let count = 0;
  for (const region of Object.values(state.regionDefs) as Region[]) {
    if (!isRegionUnlocked(region, state.round)) continue;
    const lockOwner = state.lockedRegions[region.id];
    if (lockOwner && lockOwner !== ownerId) continue;
    const wasOk = meetsRequirement(faceValue, region.valueRequirement);
    const isOk = meetsRequirement(modified, region.valueRequirement);
    if (!wasOk && isOk) count += 1;
  }
  return count;
}

/**
 * Score the VP-equivalent of playing a specific card effect given the current
 * game state. Returns a value in [0, 2.0] compatible with the rest of the
 * scoring scale.
 */
export function scorePlayCard(
  effect: CardEffect,
  state: GameState,
  playerId: PlayerId,
): number {
  const player = state.players[playerId];
  if (!player) return 0;

  switch (effect.kind) {
    case 'modify-die': {
      const delta = effect.delta;
      if (delta < 0) {
        // Whisper Step (-1): situational but occasionally useful for max-restricted regions.
        return 0.3;
      }
      // Find the best barracks die (highest face value, or most likely to benefit).
      const barracksDice = player.dice.filter(
        (d) => d.location.kind === 'barracks' && d.faceValue !== null,
      );
      if (barracksDice.length === 0) return 0.2;
      // Score based on how much the die changes relative to its range, plus newly
      // reachable region bonus.
      let bestScore = 0;
      for (const die of barracksDice) {
        if (die.faceValue === null) continue;
        const reachable = newlyReachableCount(die.faceValue, delta, state, playerId);
        const reach = Math.min(reachable * 0.15, 0.6);
        const base = 0.4 + (delta / 6) * 1.5;
        const s = Math.min(base + reach, 2.0);
        if (s > bestScore) bestScore = s;
      }
      return bestScore;
    }

    case 'reroll-die': {
      // Second Wind: valuable when dice show low values relative to their range midpoint.
      const barracksDice = player.dice.filter(
        (d) => d.location.kind === 'barracks' && d.faceValue !== null,
      );
      if (barracksDice.length === 0) return 0.2;
      const rangeMax: Record<string, number> = { '1-3': 3, '2-5': 5, '3-6': 6, '1-6': 6 };
      const rangeMin: Record<string, number> = { '1-3': 1, '2-5': 2, '3-6': 3, '1-6': 1 };
      let wastedCount = 0;
      for (const die of barracksDice) {
        if (die.faceValue === null) continue;
        const max = rangeMax[die.range] ?? 6;
        const min = rangeMin[die.range] ?? 1;
        const mid = (max + min) / 2;
        if (die.faceValue < mid) wastedCount += 1;
      }
      return wastedCount >= 2 ? 0.7 : wastedCount >= 1 ? 0.4 : 0.2;
    }

    case 'combine-bonus': {
      // Tactical Synergy: high value if a legal combine is available right now.
      const barracksDice = player.dice.filter(
        (d) => d.location.kind === 'barracks' && d.faceValue !== null,
      );
      if (barracksDice.length < 2) return 0.2;
      // Check whether any pair of barracks dice together meets any region requirement.
      const regions = Object.values(state.regionDefs) as Region[];
      for (let i = 0; i < barracksDice.length; i++) {
        for (let j = i + 1; j < barracksDice.length; j++) {
          const a = barracksDice[i]!;
          const b = barracksDice[j]!;
          if (a.faceValue === null || b.faceValue === null) continue;
          const sum = a.faceValue + b.faceValue;
          for (const region of regions) {
            if (!isRegionUnlocked(region, state.round)) continue;
            const lockOwner = state.lockedRegions[region.id];
            if (lockOwner && lockOwner !== playerId) continue;
            if (meetsRequirement(sum, region.valueRequirement)) {
              return 0.8; // at least one legal combine exists
            }
          }
        }
      }
      return 0.2;
    }

    case 'forced-march': {
      // Valuable when we have placed dice in contested regions (repositioning value).
      let contestedPlaced = 0;
      let hasGarrison = false;
      for (const [regionId, rt] of Object.entries(state.regions)) {
        const def = state.regionDefs[regionId];
        if (!def) continue;
        const myDiceHere = rt.placedDieIds.some((id) =>
          player.dice.some((d) => d.id === id),
        );
        if (!myDiceHere) continue;
        // Check if opponent also has dice here.
        const hasOpponent = rt.placedDieIds.some((id) =>
          !player.dice.some((d) => d.id === id),
        );
        if (hasOpponent) contestedPlaced += 1;
        if (def.isFortress && rt.garrisonOwnerId === playerId) hasGarrison = true;
      }
      const base = contestedPlaced > 0 ? 0.6 : 0.2;
      const garrisonBonus = hasGarrison ? 0.4 : 0;
      return Math.min(base + garrisonBonus, 2.0);
    }

    case 'lock-region': {
      // Sealed Ground: score based on highest-VP region the opponent is threatening.
      let maxThreatenedVP = 0;
      for (const [regionId, _rt] of Object.entries(state.regions)) {
        const def = state.regionDefs[regionId];
        if (!def) continue;
        // A region is "threatened" if any opponent has a legal placement there.
        for (const [oppId, opp] of Object.entries(state.players)) {
          if (oppId === playerId) continue;
          for (const die of opp.dice) {
            if (die.location.kind !== 'barracks' || die.faceValue === null) continue;
            const lockOwner = state.lockedRegions[regionId];
            if (lockOwner && lockOwner !== oppId) continue;
            if (!isRegionUnlocked(def, state.round)) continue;
            if (meetsRequirement(die.faceValue, def.valueRequirement)) {
              if (def.vp > maxThreatenedVP) maxThreatenedVP = def.vp;
            }
          }
        }
      }
      return Math.min(0.3 + maxThreatenedVP * 0.1, 1.0);
    }

    case 'steal-resource': {
      // Hand of the Thief: score = (best stealable amount) / 6, up to ~0.5.
      let maxStealable = 0;
      for (const [oppId, opp] of Object.entries(state.players)) {
        if (oppId === playerId) continue;
        for (const res of ['iron', 'gold', 'essence'] as const) {
          if ((opp.resources[res] ?? 0) > maxStealable) {
            maxStealable = opp.resources[res] ?? 0;
          }
        }
      }
      return Math.min(maxStealable / 6, 0.5);
    }

    case 'gain-resource':
      // Already handled in estimateResourceGain; return 0 here to avoid double-count.
      return 0;

    case 'gain-vp':
      // Also handled via estimateResourceGain (gain-vp is a direct VP value there).
      return 0;
  }
}

/** Approximate VP we deny opponents by taking this move. */
export function estimateDenialValue(move: Move, state: GameState, pid: PlayerId): number {
  if (move.kind === 'battle') {
    const region = state.regionDefs[move.targetRegionId];
    if (!region) return 0;
    return region.vp * 0.5; // pushes enemy off region
  }
  if (move.kind === 'place' || move.kind === 'combine') {
    const regionId = move.regionId;
    const rt = state.regions[regionId];
    if (!rt) return 0;
    // Fortress usurp denies the previous garrison's VP stream.
    const region = state.regionDefs[regionId];
    if (region?.isFortress && rt.garrisonOwnerId && rt.garrisonOwnerId !== pid) {
      return region.vp * 0.6;
    }
    // Non-fortress: tiny denial when we land on a contested space.
    return rt.placedDieIds.length > 0 ? 0.5 : 0;
  }
  return 0;
}

/** Does this move advance the active round goal? */
export function roundGoalAlignment(
  move: Move,
  state: GameState,
  pid: PlayerId,
  roundGoals: RoundGoalDefinition[],
): number {
  const slot = state.roundGoals.find((s) => s.forRound === state.round);
  if (!slot) return 0;
  const goal = roundGoals.find((g) => g.id === slot.goalId);
  if (!goal) return 0;
  const measure = ROUND_GOAL_MEASURES[goal.id];
  if (!measure) return 0;

  // Estimate goal-progress delta if we apply this move.
  // We cheat by using a simple heuristic per move kind rather than running apply().
  switch (move.kind) {
    case 'place':
    case 'combine':
      if (goal.id === 'most-regions' || goal.id === 'most-dice-placed') return 1;
      if (goal.id === 'most-fortresses') {
        const region = state.regionDefs[
          move.kind === 'place' ? move.regionId : move.regionId
        ];
        return region?.isFortress ? 1.5 : 0;
      }
      if (goal.id === 'most-low-placements') {
        // Look at die value if we can.
        const dieIds =
          move.kind === 'place' ? [move.dieId] : [move.dieIds[0], move.dieIds[1]];
        const player = state.players[pid];
        if (!player) return 0;
        let n = 0;
        for (const id of dieIds) {
          const die = player.dice.find((d) => d.id === id);
          if (die?.faceValue !== null && die?.faceValue !== undefined && die.faceValue <= 2) {
            n += 1;
          }
        }
        return n;
      }
      if (goal.id === 'most-high-placements') {
        const dieIds =
          move.kind === 'place' ? [move.dieId] : [move.dieIds[0], move.dieIds[1]];
        const player = state.players[pid];
        if (!player) return 0;
        let n = 0;
        for (const id of dieIds) {
          const die = player.dice.find((d) => d.id === id);
          if (die?.faceValue !== null && die?.faceValue !== undefined && die.faceValue >= 5) {
            n += 1;
          }
        }
        return n;
      }
      return 0;
    case 'pass':
      return goal.id === 'most-passes' ? 1 : 0;
    case 'play-card':
    case 'draft-card':
    case 'hire-merc':
    case 'battle':
    case 'upgrade-die':
    case 'expand-barracks':
    case 'use-active':
    case 'build-structure':
      return 0;
  }
}

/** Does this move move the player closer to ANY of their secret goals? */
export function secretGoalAlignment(
  move: Move,
  state: GameState,
  pid: PlayerId,
  _secretGoals: SecretGoalDefinition[],
): number {
  const player = state.players[pid];
  if (!player) return 0;
  const ownGoals = player.secretGoals;
  if (ownGoals.length === 0) return 0;

  let alignment = 0;
  for (const goalId of ownGoals) {
    if (SECRET_GOAL_CHECKS[goalId] && SECRET_GOAL_CHECKS[goalId](state, pid)) continue;
    // Simple heuristic per goal: any move that advances its progress dimension.
    switch (goalId) {
      case 'held-3-fortresses':
        if (move.kind === 'place' || move.kind === 'combine') {
          const r = state.regionDefs[move.regionId];
          if (r?.isFortress) alignment += 1.2;
        }
        break;
      case 'combined-5-times':
        if (move.kind === 'combine') alignment += 1;
        break;
      case 'won-3-battles':
        if (move.kind === 'battle') alignment += 0.7;
        break;
      case 'hired-3-mercs':
        if (move.kind === 'hire-merc') alignment += 1;
        break;
      case 'controls-4-same-terrain':
      case 'placed-on-all-terrains':
        if (move.kind === 'place' || move.kind === 'combine') alignment += 0.5;
        break;
      case 'all-dice-deployed':
      case 'no-dice-in-barracks-end':
        if (move.kind === 'place' || move.kind === 'combine') alignment += 0.3;
        break;
      case 'fortress-end-game':
        if (move.kind === 'place' || move.kind === 'combine') {
          const r = state.regionDefs[move.regionId];
          if (r?.isFortress) alignment += 0.8;
        }
        break;
      case 'max-resource-6plus':
        // Hoarding-friendly but we don't model that here.
        break;
    }
  }
  return alignment;
}

/** Cheap estimate for battle win chance: attacker vs defenderSum + 1. */
export function estimateBattleWinChance(
  state: GameState,
  move: { kind: 'battle'; attackerDieId: string; targetRegionId: string },
): number {
  const attacker = state.players[state.activePlayerId];
  if (!attacker) return 0;
  const die = attacker.dice.find((d) => d.id === move.attackerDieId);
  if (!die || die.faceValue === null) return 0;
  const def = defenderSum(state, move.targetRegionId, attacker.id);
  if (die.faceValue > def + 1) return 1;
  return 0;
}

/** "Expected loss" — purely a risk discount in the score. */
export function expectedLoss(move: Move, state: GameState): number {
  if (move.kind === 'battle') {
    return 1 - estimateBattleWinChance(state, move);
  }
  if (move.kind === 'hire-merc') {
    // Risk that we don't get to use the merc this round.
    return 0.3;
  }
  return 0;
}
