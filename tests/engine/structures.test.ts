import { describe, expect, it } from 'vitest';
import { canBuildStructure, applyBuildStructure, scoreStructures } from '@engine/structures';
import type { GameState, RegionRuntime, StructureDefinition } from '@engine/types';

const watchtower: StructureDefinition = {
  id: 'watchtower',
  name: 'Watchtower',
  description: 'A stone tower.',
  cost: { iron: 3 },
  vp: 2,
  allowedTerrains: ['plains', 'fortress', 'forest', 'mountain', 'swamp', 'ruins'],
};

const citadel: StructureDefinition = {
  id: 'citadel',
  name: 'Citadel',
  description: 'Massive fortifications.',
  cost: { iron: 3, gold: 2 },
  vp: 4,
  allowedTerrains: ['fortress', 'mountain'],
};

function mkState(overrides?: Partial<GameState>): GameState {
  return {
    round: 1,
    turn: 1,
    phase: 'action',
    activePlayerId: 'p1',
    turnOrder: ['p1', 'p2'],
    players: {
      p1: {
        id: 'p1',
        factionId: 'warriors',
        isAI: true,
        resources: { iron: 5, gold: 3, essence: 0 },
        dice: [{ id: 'd1', range: '2-5', faceValue: 3, ownerId: 'p1', location: { kind: 'region', regionId: 'r1' } }],
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
      },
      p2: {
        id: 'p2',
        factionId: 'mages',
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
      },
    },
    regions: {
      r1: {
        regionId: 'r1',
        placedDieIds: ['d1'],
        garrisonedDieIds: [],
        heldRounds: 0,
      } satisfies RegionRuntime,
    },
    regionDefs: {
      r1: { id: 'r1', name: 'Plains Region', terrain: 'plains', isFortress: false, valueRequirement: { kind: 'min', value: 1 }, vp: 1, adjacency: [] },
      r2: { id: 'r2', name: 'Mountain Region', terrain: 'mountain', isFortress: false, valueRequirement: { kind: 'min', value: 3 }, vp: 2, adjacency: [] },
    },
    market: [],
    mercs: { low: null, high: null, specialist: null, specialistValue: 6, claimed: {} },
    threatTrack: 0,
    roundGoals: [],
    secretGoalsByPlayer: { p1: [], p2: [] },
    rngSeed: 'test',
    rngState: '',
    log: [],
    freeForAll: false,
    mercHireLog: [],
    lockedRegions: {},
    ...overrides,
  };
}

describe('canBuildStructure', () => {
  it('returns true when player has a die on the region and can afford', () => {
    const state = mkState();
    expect(canBuildStructure(state, 'p1', 'r1', watchtower)).toBe(true);
  });

  it('returns false when player has no die on the region', () => {
    const state = mkState();
    expect(canBuildStructure(state, 'p2', 'r1', watchtower)).toBe(false);
  });

  it('returns false when region already has a structure', () => {
    const state = mkState();
    state.regions.r1!.structure = { structureId: 'watchtower', ownerId: 'p1' };
    expect(canBuildStructure(state, 'p1', 'r1', watchtower)).toBe(false);
  });

  it('returns false when terrain not allowed (citadel on plains)', () => {
    const state = mkState();
    expect(canBuildStructure(state, 'p1', 'r1', citadel)).toBe(false);
  });

  it('returns false when player cannot afford', () => {
    const state = mkState();
    state.players.p1!.resources.iron = 1; // needs 3
    expect(canBuildStructure(state, 'p1', 'r1', watchtower)).toBe(false);
  });
});

describe('applyBuildStructure', () => {
  it('places the structure on the region and deducts cost', () => {
    const state = mkState();
    const next = applyBuildStructure(state, 'p1', 'r1', watchtower);
    expect(next.regions.r1!.structure).toEqual({ structureId: 'watchtower', ownerId: 'p1' });
    expect(next.players.p1!.resources.iron).toBe(2); // 5 - 3
  });
});

describe('scoreStructures', () => {
  it('awards VP to structure owners at end of game', () => {
    const state = mkState();
    state.regions.r1!.structure = { structureId: 'watchtower', ownerId: 'p1' };
    const next = scoreStructures(state, [watchtower]);
    expect(next.players.p1!.vp).toBe(2);
    expect(next.players.p2!.vp).toBe(0);
  });
});
