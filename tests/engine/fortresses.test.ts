import { describe, expect, it } from 'vitest';
import {
  applyGarrison,
  canGarrisonOrUsurp,
  garrisonSum,
  placementSum,
} from '@engine/fortresses';
import { produce } from 'immer';
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

function mkState(): GameState {
  const fortress: Region = {
    id: 'f',
    name: 'F',
    terrain: 'fortress',
    isFortress: true,
    valueRequirement: { kind: 'min', value: 1 },
    vp: 3,
    adjacency: [],
  };
  const runtime: RegionRuntime = {
    regionId: 'f',
    placedDieIds: [],
    garrisonedDieIds: [],
    heldRounds: 0,
  };
  return {
    round: 1,
    turn: 0,
    phase: 'action',
    activePlayerId: 'p1',
    turnOrder: ['p1', 'p2'],
    players: { p1: mkPlayer('p1'), p2: mkPlayer('p2') },
    regions: { f: runtime },
    regionDefs: { f: fortress },
    market: [],
    mercs: { low: null, high: null, specialist: null, specialistValue: 6, claimed: {} },
    threatTrack: 0,
    roundGoals: [],
    secretGoalsByPlayer: { p1: [], p2: [] },
    rngSeed: 's',
    rngState: '',
    log: [],
    freeForAll: false,
    lockedRegions: {},
  };
}

describe('placementSum / garrisonSum', () => {
  it('sums placements ignoring null faces', () => {
    expect(placementSum([mkDie('a', 'p', 3), mkDie('b', 'p', 4)])).toBe(7);
    expect(placementSum([mkDie('a', 'p', 3), mkDie('b', 'p', null)])).toBe(3);
  });

  it('garrisonSum returns 0 for an unowned fortress', () => {
    const state = mkState();
    expect(garrisonSum(state, 'f')).toBe(0);
  });
});

describe('canGarrisonOrUsurp', () => {
  it('any value is fine when fortress is empty', () => {
    const state = mkState();
    const r = canGarrisonOrUsurp(state, 'f', 'p1', 1);
    expect(r.ok).toBe(true);
    expect(r.usurp).toBe(false);
  });

  it('owner can stack additional dice without usurp', () => {
    const state = mkState();
    state.players.p1!.dice.push(mkDie('d1', 'p1', 4));
    state.regions.f!.garrisonedDieIds.push('d1');
    state.regions.f!.garrisonOwnerId = 'p1';
    const r = canGarrisonOrUsurp(state, 'f', 'p1', 2);
    expect(r.ok).toBe(true);
    expect(r.usurp).toBe(false);
  });

  it('opponent must beat defenderSum + 1 to usurp', () => {
    const state = mkState();
    state.players.p1!.dice.push(mkDie('d1', 'p1', 4));
    state.regions.f!.garrisonedDieIds.push('d1');
    state.regions.f!.garrisonOwnerId = 'p1';
    expect(canGarrisonOrUsurp(state, 'f', 'p2', 5).ok).toBe(false);
    expect(canGarrisonOrUsurp(state, 'f', 'p2', 6).ok).toBe(true);
  });
});

describe('applyGarrison', () => {
  it('places attacker dice and updates owner; usurp evicts defender', () => {
    const initial = mkState();
    initial.players.p1!.dice.push(mkDie('d1', 'p1', 4));
    initial.players.p2!.dice.push(mkDie('d2', 'p2', 6));
    initial.regions.f!.garrisonedDieIds.push('d1');
    initial.regions.f!.garrisonOwnerId = 'p1';

    const next = produce(initial, (draft) => {
      const result = applyGarrison(draft, 'f', 'p2', ['d2']);
      expect(result.usurpedFrom).toBe('p1');
    });

    expect(next.regions.f!.garrisonOwnerId).toBe('p2');
    expect(next.regions.f!.garrisonedDieIds).toEqual(['d2']);
    expect(next.players.p1!.dice[0]!.location.kind).toBe('barracks');
    expect(next.players.p1!.dice[0]!.faceValue).toBeNull();
    expect(next.players.p2!.dice[0]!.location).toEqual({ kind: 'garrison', regionId: 'f' });
  });

  it('updates progress.maxFortressesSimultaneous', () => {
    const initial = mkState();
    initial.players.p1!.dice.push(mkDie('d1', 'p1', 4));
    const next = produce(initial, (draft) => {
      applyGarrison(draft, 'f', 'p1', ['d1']);
    });
    expect(next.players.p1!.progress.maxFortressesSimultaneous).toBe(1);
  });
});
