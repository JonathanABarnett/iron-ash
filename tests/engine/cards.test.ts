import { describe, expect, it } from 'vitest';
import {
  applyDraft,
  applyPlay,
  canDraft,
  canPlayCard,
  endOfRoundHandCleanup,
  HAND_LIMIT,
  MARKET_SIZE,
  refreshMarket,
} from '@engine/cards';
import { Rng } from '@engine/rng';
import { createGame } from '@engine/setup';
import {
  parseCards,
  parseFactions,
  parseRegions,
  parseRoundGoals,
  parseRules,
  parseSecretGoals,
} from '@engine/config-loader';
import cardsJson from '@config/cards.json';
import factionsJson from '@config/factions.json';
import regionsJson from '@config/regions.json';
import roundGoalsJson from '@config/round-goals.json';
import rulesJson from '@config/rules.json';
import secretGoalsJson from '@config/secret-goals.json';

function setup(seed = 'cards-test') {
  const factions = parseFactions(factionsJson);
  const regions = parseRegions(regionsJson);
  const rules = parseRules(rulesJson);
  const roundGoals = parseRoundGoals(roundGoalsJson);
  const secretGoals = parseSecretGoals(secretGoalsJson);
  const cards = parseCards(cardsJson);
  const state = createGame({
    seed,
    players: [
      { id: 'p1', factionId: 'merchants', isAI: true },
      { id: 'p2', factionId: 'mages', isAI: true },
    ],
    regions,
    factions,
    rules,
    roundGoals,
    secretGoals,
  });
  const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
  return { state, rng, cards };
}

describe('refreshMarket', () => {
  it('deals MARKET_SIZE cards from the pool', () => {
    const { state, rng, cards } = setup();
    const refreshed = refreshMarket(state, cards, rng);
    expect(refreshed.market.length).toBe(Math.min(MARKET_SIZE, cards.length));
  });
});

describe('canDraft / applyDraft', () => {
  it('returns false when player cannot afford', () => {
    const { state, rng, cards } = setup();
    const market = refreshMarket(state, cards, rng);
    // Force p1 to have zero of every resource.
    const broke = {
      ...market,
      players: {
        ...market.players,
        p1: {
          ...market.players.p1!,
          resources: { iron: 0, gold: 0, essence: 0 },
        },
      },
    };
    for (const id of broke.market) {
      expect(canDraft(broke, 'p1', id, cards)).toBe(false);
    }
  });

  it('moves the card from market to player hand and deducts cost', () => {
    const { state, rng, cards } = setup();
    const market = refreshMarket(state, cards, rng);
    const cardId = market.market.find((id) => {
      const card = cards.find((c) => c.id === id);
      return card && (card.cost.gold ?? 0) <= market.players.p1!.resources.gold;
    });
    if (!cardId) {
      // No affordable card in this seed — skip.
      return;
    }
    const card = cards.find((c) => c.id === cardId)!;
    const goldBefore = market.players.p1!.resources.gold;

    const next = applyDraft(market, 'p1', cardId, cards);
    expect(next.market).not.toContain(cardId);
    expect(next.players.p1!.hand).toContain(cardId);
    expect(next.players.p1!.resources.gold).toBe(goldBefore - (card.cost.gold ?? 0));
  });
});

describe('applyPlay', () => {
  it('applies gain-resource effect', () => {
    const { state, rng, cards } = setup();
    // Hand-craft a state with a known card in hand.
    const card = cards.find((c) => c.effect.kind === 'gain-resource')!;
    const seeded = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players.p1!,
          hand: [card.id],
        },
      },
    };
    const before = seeded.players.p1!.resources[
      card.effect.kind === 'gain-resource' ? card.effect.resource : 'iron'
    ];
    const next = applyPlay(seeded, 'p1', card.id, cards, rng);
    expect(next.players.p1!.hand).not.toContain(card.id);
    if (card.effect.kind === 'gain-resource') {
      expect(next.players.p1!.resources[card.effect.resource]).toBe(
        before + card.effect.amount,
      );
    }
  });

  it('canPlayCard returns false when card is not in hand', () => {
    const { state } = setup();
    expect(canPlayCard(state, 'p1', 'card-modifier-iron')).toBe(false);
  });
});

describe('endOfRoundHandCleanup', () => {
  it('trims hands to HAND_LIMIT', () => {
    const { state } = setup();
    const stuffed = {
      ...state,
      players: {
        ...state.players,
        p1: {
          ...state.players.p1!,
          hand: ['a', 'b', 'c', 'd'],
        },
      },
    };
    const next = endOfRoundHandCleanup(stuffed);
    expect(next.players.p1!.hand.length).toBe(HAND_LIMIT);
  });
});
