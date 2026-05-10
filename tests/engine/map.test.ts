import { describe, expect, it } from 'vitest';
import { canCombineDice, canPlaceDie, isRegionUnlocked, meetsRequirement } from '@engine/map';
import type { Die, GameState, Region } from '@engine/types';

function emptyState(round = 1): GameState {
  return {
    round,
    turn: 0,
    phase: 'action',
    activePlayerId: 'p1',
    turnOrder: ['p1'],
    players: {},
    regions: {},
    regionDefs: {},
    market: [],
    mercs: { low: null, high: null, specialistValue: 6, claimed: {} },
    threatTrack: 0,
    roundGoals: [],
    secretGoalsByPlayer: {},
    rngSeed: 's',
    rngState: '',
    log: [],
    freeForAll: false,
  };
}

function region(partial: Partial<Region>): Region {
  return {
    id: 'r1',
    name: 'R1',
    terrain: 'plains',
    isFortress: false,
    valueRequirement: { kind: 'min', value: 3 },
    vp: 1,
    adjacency: [],
    ...partial,
  };
}

function die(faceValue: number, id = 'd1'): Die {
  return {
    id,
    range: '1-6',
    faceValue,
    ownerId: 'p1',
    location: { kind: 'barracks' },
  };
}

describe('meetsRequirement', () => {
  it('handles min', () => {
    expect(meetsRequirement(3, { kind: 'min', value: 3 })).toBe(true);
    expect(meetsRequirement(2, { kind: 'min', value: 3 })).toBe(false);
  });
  it('handles max', () => {
    expect(meetsRequirement(2, { kind: 'max', value: 2 })).toBe(true);
    expect(meetsRequirement(3, { kind: 'max', value: 2 })).toBe(false);
  });
  it('handles exact', () => {
    expect(meetsRequirement(4, { kind: 'exact', value: 4 })).toBe(true);
    expect(meetsRequirement(3, { kind: 'exact', value: 4 })).toBe(false);
    expect(meetsRequirement(5, { kind: 'exact', value: 4 })).toBe(false);
  });
  it('handles minSum like min for single values', () => {
    expect(meetsRequirement(7, { kind: 'minSum', value: 7 })).toBe(true);
    expect(meetsRequirement(6, { kind: 'minSum', value: 7 })).toBe(false);
  });
});

describe('isRegionUnlocked', () => {
  it('returns true when no unlock round is set', () => {
    expect(isRegionUnlocked(region({}), 1)).toBe(true);
  });
  it('respects unlock round', () => {
    expect(isRegionUnlocked(region({ unlocksRound: 3 }), 2)).toBe(false);
    expect(isRegionUnlocked(region({ unlocksRound: 3 }), 3)).toBe(true);
    expect(isRegionUnlocked(region({ unlocksRound: 3 }), 5)).toBe(true);
  });
});

describe('canPlaceDie', () => {
  it('rejects null face value', () => {
    const d = { ...die(0), faceValue: null };
    expect(canPlaceDie(d, region({}), emptyState())).toBe(false);
  });
  it('rejects dice already on a region', () => {
    const d: Die = { ...die(5), location: { kind: 'region', regionId: 'r1' } };
    expect(canPlaceDie(d, region({}), emptyState())).toBe(false);
  });
  it('accepts when value meets min requirement', () => {
    expect(canPlaceDie(die(3), region({ valueRequirement: { kind: 'min', value: 3 } }), emptyState())).toBe(true);
    expect(canPlaceDie(die(2), region({ valueRequirement: { kind: 'min', value: 3 } }), emptyState())).toBe(false);
  });
  it('rejects when region is not yet unlocked', () => {
    expect(
      canPlaceDie(
        die(5),
        region({ unlocksRound: 3, valueRequirement: { kind: 'min', value: 4 } }),
        emptyState(2),
      ),
    ).toBe(false);
  });
});

describe('canCombineDice', () => {
  it('rejects same die twice', () => {
    const d = die(3, 'x');
    expect(canCombineDice(d, d, region({}), emptyState())).toBe(false);
  });
  it('rejects different owners', () => {
    const a = die(3, 'a');
    const b: Die = { ...die(3, 'b'), ownerId: 'p2' };
    expect(canCombineDice(a, b, region({}), emptyState())).toBe(false);
  });
  it('accepts when sum satisfies minSum', () => {
    const r = region({ valueRequirement: { kind: 'minSum', value: 7 } });
    expect(canCombineDice(die(3, 'a'), die(4, 'b'), r, emptyState())).toBe(true);
    expect(canCombineDice(die(3, 'a'), die(3, 'b'), r, emptyState())).toBe(false);
  });
});
