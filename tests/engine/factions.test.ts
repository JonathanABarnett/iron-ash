import { describe, expect, it } from 'vitest';
import {
  applyPassivesStartOfRound,
  FACTION_ABILITIES,
  getMercDiscount,
} from '@engine/factions/abilities';
import type { GameState, Player } from '@engine/types';

function mkPlayer(id: string, factionId: Player['factionId']): Player {
  return {
    id,
    factionId,
    isAI: true,
    resources: { iron: 0, gold: 0, essence: 0 },
    dice: [],
    barracksMax: 5,
    hand: [],
    vp: 0,
    secretGoals: [],
    passedThisRound: false,
      activeUsedThisRound: false,
      hasCombineBonus: false,
    progress: {
      maxFortressesSimultaneous: 0,
      combinesThisGame: 0,
      battlesWonThisGame: 0,
      mercsHiredThisGame: 0,
      cardsKeptThisGame: 0,
      terrainsPlacedOn: [],
      maxDicePlacedAtRoundEnd: 0,
    },
    factionState: {},
  };
}

function mkState(players: Player[]): GameState {
  const playerMap: Record<string, Player> = {};
  for (const p of players) playerMap[p.id] = p;
  return {
    round: 1,
    turn: 0,
    phase: 'roll',
    activePlayerId: players[0]!.id,
    turnOrder: players.map((p) => p.id),
    players: playerMap,
    regions: {},
    regionDefs: {},
    market: [],
    mercs: { low: null, high: null, specialist: null, specialistValue: 6, claimed: {} },
    threatTrack: 0,
    roundGoals: [],
    secretGoalsByPlayer: Object.fromEntries(players.map((p) => [p.id, []])),
    rngSeed: 's',
    rngState: '',
    log: [],
    freeForAll: false,
    lockedRegions: {},
  };
}

describe('FACTION_ABILITIES registry', () => {
  it('every faction has an entry', () => {
    const ids: Array<Player['factionId']> = [
      'warriors',
      'assassins',
      'mages',
      'necromancers',
      'merchants',
      'rangers',
      'paladins',
      'beastmasters',
    ];
    for (const id of ids) expect(FACTION_ABILITIES[id]).toBeDefined();
  });
});

describe('applyPassivesStartOfRound', () => {
  it('grants Warriors +1 iron and Merchants +2 gold', () => {
    const state = mkState([mkPlayer('p1', 'warriors'), mkPlayer('p2', 'merchants')]);
    const next = applyPassivesStartOfRound(state);
    expect(next.players.p1!.resources.iron).toBe(1);
    expect(next.players.p2!.resources.gold).toBe(2);
  });

  it('grants Mages +1 essence', () => {
    const state = mkState([mkPlayer('p1', 'mages')]);
    const next = applyPassivesStartOfRound(state);
    expect(next.players.p1!.resources.essence).toBe(1);
  });
});

describe('getMercDiscount', () => {
  it('Warriors get 1 gold off', () => {
    expect(getMercDiscount('warriors')).toBe(1);
  });
  it('Other factions default to 0', () => {
    expect(getMercDiscount('mages')).toBe(0);
    expect(getMercDiscount('rangers')).toBe(0);
  });
});
