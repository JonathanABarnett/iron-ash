import { describe, expect, it } from 'vitest';
import {
  applyBattle,
  canBattle,
  defenderSum,
  hasEnemyDefender,
} from '@engine/battle';
import type { Die, GameState, Player, Region, RegionRuntime } from '@engine/types';

function mkDie(id: string, ownerId: string, faceValue: number | null = null): Die {
  return {
    id,
    range: '1-6',
    faceValue,
    ownerId,
    location: { kind: 'barracks' },
  };
}

function mkPlayer(id: string, dice: Die[] = []): Player {
  return {
    id,
    factionId: 'warriors',
    isAI: true,
    resources: { iron: 0, gold: 0, essence: 0 },
    dice,
    barracksMax: 5,
    hand: [],
    vp: 0,
    secretGoals: [],
    passedThisRound: false,
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

function mkBattleState(): GameState {
  const region: Region = {
    id: 'r',
    name: 'R',
    terrain: 'plains',
    isFortress: false,
    valueRequirement: { kind: 'min', value: 1 },
    vp: 1,
    adjacency: [],
  };
  const runtime: RegionRuntime = {
    regionId: 'r',
    placedDieIds: [],
    garrisonedDieIds: [],
    heldRounds: 0,
  };
  const attackerDie = mkDie('a1', 'p1', 5);
  const defenderDie = { ...mkDie('d1', 'p2', 3), location: { kind: 'region' as const, regionId: 'r' } };
  return {
    round: 1,
    turn: 1,
    phase: 'action',
    activePlayerId: 'p1',
    turnOrder: ['p1', 'p2'],
    players: {
      p1: mkPlayer('p1', [attackerDie]),
      p2: mkPlayer('p2', [defenderDie]),
    },
    regions: {
      r: { ...runtime, placedDieIds: ['d1'] },
    },
    regionDefs: { r: region },
    market: [],
    mercs: { low: null, high: null, specialist: null, specialistValue: 6, claimed: {} },
    threatTrack: 0,
    roundGoals: [],
    secretGoalsByPlayer: { p1: [], p2: [] },
    rngSeed: 's',
    rngState: '',
    log: [],
    freeForAll: false,
  };
}

describe('battle predicates', () => {
  it('hasEnemyDefender detects opponents on the region', () => {
    const state = mkBattleState();
    expect(hasEnemyDefender(state, 'r', 'p1')).toBe(true);
    expect(hasEnemyDefender(state, 'r', 'p2')).toBe(false);
  });

  it('defenderSum sums enemy face values only', () => {
    const state = mkBattleState();
    expect(defenderSum(state, 'r', 'p1')).toBe(3);
  });

  it('canBattle rejects fortress regions', () => {
    const state = mkBattleState();
    state.regionDefs.r!.isFortress = true;
    const die = state.players.p1!.dice[0]!;
    expect(canBattle(state, die, 'r')).toBe(false);
  });

  it('canBattle requires barracks die with face value', () => {
    const state = mkBattleState();
    const die = state.players.p1!.dice[0]!;
    expect(canBattle(state, die, 'r')).toBe(true);
    const placed: Die = { ...die, location: { kind: 'region', regionId: 'r' } };
    expect(canBattle(state, placed, 'r')).toBe(false);
  });
});

describe('applyBattle', () => {
  it('attacker (5) beats defender sum (3 + 1 = 4): wins', () => {
    const state = mkBattleState();
    const { state: next, result } = applyBattle(state, 'p1', 'a1', 'r');
    expect(result.attackerWon).toBe(true);
    expect(next.players.p1!.vp).toBe(1);
    expect(next.players.p1!.progress.battlesWonThisGame).toBe(1);
    // Attacker's die is now on the region.
    expect(next.players.p1!.dice[0]!.location).toEqual({ kind: 'region', regionId: 'r' });
    // Defender's die is back in barracks, face cleared.
    expect(next.players.p2!.dice[0]!.location.kind).toBe('barracks');
    expect(next.players.p2!.dice[0]!.faceValue).toBeNull();
    expect(next.threatTrack).toBe(1);
  });

  it('attacker fails when value <= defenderSum + 1', () => {
    const state = mkBattleState();
    state.players.p1!.dice[0]!.faceValue = 4; // 4 <= 3 + 1
    const { state: next, result } = applyBattle(state, 'p1', 'a1', 'r');
    expect(result.attackerWon).toBe(false);
    // Attacker's die back to barracks, face cleared
    expect(next.players.p1!.dice[0]!.location.kind).toBe('barracks');
    expect(next.players.p1!.dice[0]!.faceValue).toBeNull();
    // Defender unchanged
    expect(next.players.p2!.dice[0]!.location).toEqual({ kind: 'region', regionId: 'r' });
    expect(next.players.p2!.dice[0]!.faceValue).toBe(3);
    expect(next.threatTrack).toBe(1);
  });
});
