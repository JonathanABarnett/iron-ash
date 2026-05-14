// Card system: market refreshed each round, draft (pay cost, take card),
// play (apply effect), end-of-round hand cleanup (keep up to 2 free, discard rest).
//
// Phase 2C uses simplified data-driven effects (gain-resource, gain-vp,
// reroll-die, modify-die). Richer per-kind effects (lock, steal, etc.) layer
// on later by extending CardEffect — keep the configuration data, swap the
// runtime handler.

import { produce } from 'immer';
import type {
  CardDefinition,
  CardEffect,
  CardId,
  Die,
  GameState,
  PlayerId,
} from './types';
import { Rng } from './rng';
import { rollDie } from './dice';
import { canAfford, spend } from './resources';

const HAND_LIMIT = 2;
const MARKET_SIZE = 4;

/** Refresh the market — discard whatever is there and deal MARKET_SIZE fresh cards. */
export function refreshMarket(
  state: GameState,
  cards: CardDefinition[],
  rng: Rng,
): GameState {
  const shuffled = rng.shuffle(cards);
  const drawn = shuffled.slice(0, MARKET_SIZE);
  return produce(state, (draft) => {
    draft.market = drawn.map((c) => c.id);
  });
}

export function canDraft(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cards: CardDefinition[],
): boolean {
  if (!state.market.includes(cardId)) return false;
  const card = cards.find((c) => c.id === cardId);
  if (!card) return false;
  const player = state.players[playerId];
  if (!player) return false;
  return canAfford(player, card.cost);
}

export function applyDraft(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cards: CardDefinition[],
): GameState {
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}`);
  if (!canDraft(state, playerId, cardId, cards)) {
    throw new Error(`Cannot draft card ${cardId}`);
  }
  return produce(state, (draft) => {
    const player = draft.players[playerId]!;
    Object.assign(player, spend(player, card.cost));
    player.hand.push(cardId);
    const idx = draft.market.indexOf(cardId);
    if (idx >= 0) draft.market.splice(idx, 1);
  });
}

export function canPlayCard(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
): boolean {
  const player = state.players[playerId];
  return !!player && player.hand.includes(cardId);
}

export function applyPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cards: CardDefinition[],
  rng: Rng,
): GameState {
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}`);
  if (!canPlayCard(state, playerId, cardId)) {
    throw new Error(`Cannot play card ${cardId}`);
  }
  return produce(state, (draft) => {
    const player = draft.players[playerId]!;
    const idx = player.hand.indexOf(cardId);
    if (idx >= 0) player.hand.splice(idx, 1);
    applyEffect(draft, playerId, card.effect, rng);
  });
}

function applyEffect(
  draft: GameState,
  playerId: PlayerId,
  effect: CardEffect,
  rng: Rng,
): void {
  const player = draft.players[playerId]!;
  switch (effect.kind) {
    case 'gain-resource':
      player.resources[effect.resource] += effect.amount;
      break;
    case 'gain-vp':
      player.vp += effect.amount;
      break;
    case 'reroll-die': {
      const eligible = player.dice.filter(
        (d) => d.location.kind === 'barracks' && d.faceValue !== null,
      );
      if (eligible.length === 0) return;
      const target = rng.pick(eligible);
      const diceCopy: Die[] = player.dice.map((d) => (d.id === target.id ? rollDie(d, rng) : d));
      player.dice = diceCopy;
      break;
    }
    case 'modify-die': {
      const eligible = player.dice.filter(
        (d) => d.location.kind === 'barracks' && d.faceValue !== null,
      );
      if (eligible.length === 0) return;
      const target = rng.pick(eligible);
      const die = player.dice.find((d) => d.id === target.id)!;
      if (die.faceValue === null) return;
      const next = Math.max(1, Math.min(6, die.faceValue + effect.delta));
      die.faceValue = next;
      break;
    }
  }
}

/**
 * End-of-round hand cleanup.
 * - Each player may keep up to HAND_LIMIT cards free.
 * - Extra cards cost 1 gold each to keep (per cardKeep cost in config).
 * - Cards the player can't afford to keep are discarded first.
 * - Random / AI strategy: keep up to what they can afford, front of hand priority.
 */
export function endOfRoundHandCleanup(
  state: GameState,
  costPerExtra?: { gold: number; iron: number; essence: number },
): GameState {
  return produce(state, (draft) => {
    for (const player of Object.values(draft.players)) {
      if (player.hand.length <= HAND_LIMIT) continue;

      const extra = player.hand.length - HAND_LIMIT;
      if (!costPerExtra || extra <= 0) {
        // No cost config or nothing extra — just trim.
        player.hand = player.hand.slice(0, HAND_LIMIT);
        continue;
      }

      // Determine how many extras the player can afford to pay for.
      const goldPerCard = costPerExtra.gold;
      const affordable = goldPerCard > 0
        ? Math.floor(player.resources.gold / goldPerCard)
        : extra;
      const keep = Math.min(extra, affordable);
      const totalKept = HAND_LIMIT + keep;

      // Spend gold for kept extras.
      player.resources.gold = Math.max(0, player.resources.gold - keep * goldPerCard);
      player.hand = player.hand.slice(0, totalKept);
      if (keep > 0) {
        player.progress.cardsKeptThisGame += keep;
      }
    }
  });
}

/** Convenience: cost helper used by enumerate to filter affordable drafts. */
export function draftableCards(
  state: GameState,
  playerId: PlayerId,
  cards: CardDefinition[],
): CardId[] {
  const out: CardId[] = [];
  for (const id of state.market) {
    if (canDraft(state, playerId, id, cards)) out.push(id);
  }
  return out;
}

export function playableCards(state: GameState, playerId: PlayerId): CardId[] {
  return state.players[playerId]?.hand.slice() ?? [];
}

// re-export so tests can introspect
export { HAND_LIMIT, MARKET_SIZE };
