import { describe, expect, it } from 'vitest';
import {
  applyHireMerc,
  clearMercDicePostRound,
  isSlotAvailable,
  mercCost,
  refreshMercPool,
} from '@engine/mercenaries';
import { createGame } from '@engine/setup';
import { Rng } from '@engine/rng';
import {
  parseFactions,
  parseRegions,
  parseRoundGoals,
  parseRules,
  parseSecretGoals,
} from '@engine/config-loader';
import factionsJson from '@config/factions.json';
import regionsJson from '@config/regions.json';
import roundGoalsJson from '@config/round-goals.json';
import rulesJson from '@config/rules.json';
import secretGoalsJson from '@config/secret-goals.json';

function newGame(seed = 'merc-test') {
  const factions = parseFactions(factionsJson);
  const regions = parseRegions(regionsJson);
  const rules = parseRules(rulesJson);
  const roundGoals = parseRoundGoals(roundGoalsJson);
  const secretGoals = parseSecretGoals(secretGoalsJson);
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
  return { state, rules, rng };
}

describe('refreshMercPool', () => {
  it('mints a Low (1-3), High (3-6), and Specialist die at the round value', () => {
    const { state, rng } = newGame();
    const refreshed = refreshMercPool(state, rng);
    expect(refreshed.mercs.low?.range).toBe('1-3');
    expect(refreshed.mercs.low?.faceValue).not.toBeNull();
    expect(refreshed.mercs.low?.faceValue!).toBeGreaterThanOrEqual(1);
    expect(refreshed.mercs.low?.faceValue!).toBeLessThanOrEqual(3);

    expect(refreshed.mercs.high?.range).toBe('3-6');
    expect(refreshed.mercs.high?.faceValue!).toBeGreaterThanOrEqual(3);
    expect(refreshed.mercs.high?.faceValue!).toBeLessThanOrEqual(6);

    expect(refreshed.mercs.specialist?.faceValue).toBe(refreshed.mercs.specialistValue);
    expect(refreshed.mercs.specialist?.mercSource).toBe('specialist');
  });
});

describe('mercCost', () => {
  it('is 3 by default', () => {
    const { state, rules } = newGame();
    expect(mercCost(state, rules)).toBe(3);
  });

  it('is 0 during free-for-all when allMercsFree is set', () => {
    const { state, rules } = newGame();
    const ffaState = { ...state, freeForAll: true };
    expect(mercCost(ffaState, rules)).toBe(0);
  });
});

describe('applyHireMerc', () => {
  it('transfers the die to the hirer and deducts gold', () => {
    const { state, rules, rng } = newGame();
    const refreshed = refreshMercPool(state, rng);
    expect(isSlotAvailable(refreshed, 'low')).toBe(true);
    const hired = applyHireMerc(refreshed, 'p1', 'low', rules);
    expect(hired.players.p1!.dice.some((d) => d.mercSource === 'low')).toBe(true);
    expect(hired.mercs.low).toBeNull();
    expect(hired.mercs.claimed.low).toBe('p1');
    expect(hired.players.p1!.resources.gold).toBe(state.players.p1!.resources.gold - 3);
    expect(hired.players.p1!.progress.mercsHiredThisGame).toBe(1);
  });

  it('throws if slot already claimed', () => {
    const { state, rules, rng } = newGame();
    const refreshed = refreshMercPool(state, rng);
    const once = applyHireMerc(refreshed, 'p1', 'low', rules);
    expect(() => applyHireMerc(once, 'p2', 'low', rules)).toThrow();
  });

  it('throws on insufficient gold', () => {
    const { state, rules, rng } = newGame();
    const refreshed = refreshMercPool(state, rng);
    const broke = {
      ...refreshed,
      players: {
        ...refreshed.players,
        p1: { ...refreshed.players.p1!, resources: { iron: 0, gold: 0, essence: 0 } },
      },
    };
    expect(() => applyHireMerc(broke, 'p1', 'low', rules)).toThrow();
  });
});

describe('clearMercDicePostRound', () => {
  it('refunds gold for an unused merc die in barracks', () => {
    const { state, rules, rng } = newGame();
    const refreshed = refreshMercPool(state, rng);
    const goldBefore = refreshed.players.p1!.resources.gold;
    const hired = applyHireMerc(refreshed, 'p1', 'low', rules);
    expect(hired.players.p1!.resources.gold).toBe(goldBefore - 3);

    const cleared = clearMercDicePostRound(hired);
    expect(cleared.players.p1!.dice.some((d) => d.mercSource)).toBe(false);
    expect(cleared.players.p1!.resources.gold).toBe(goldBefore); // refunded
    expect(cleared.mercs.low).toBeNull();
    expect(cleared.mercs.high).toBeNull();
    expect(cleared.mercs.specialist).toBeNull();
  });
});
