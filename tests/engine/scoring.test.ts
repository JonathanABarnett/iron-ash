import { describe, expect, it } from 'vitest';
import {
  computeEndGameScore,
  scoreFortressPerRound,
  scoreRoundGoal,
} from '@engine/scoring';
import type { GameState, Player, Region, RegionRuntime } from '@engine/types';

function mkPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    factionId: 'warriors',
    isAI: true,
    resources: { iron: 0, gold: 0, essence: 0 },
    dice: [],
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
    ...overrides,
  };
}

function mkRegion(overrides: Partial<Region> = {}): Region {
  return {
    id: 'r',
    name: 'R',
    terrain: 'plains',
    isFortress: false,
    valueRequirement: { kind: 'min', value: 1 },
    vp: 1,
    adjacency: [],
    ...overrides,
  };
}

function mkRuntime(regionId: string, overrides: Partial<RegionRuntime> = {}): RegionRuntime {
  return {
    regionId,
    placedDieIds: [],
    garrisonedDieIds: [],
    heldRounds: 0,
    ...overrides,
  };
}

function mkState(players: Player[], regions: Region[], overrides: Partial<GameState> = {}): GameState {
  const playerMap: Record<string, Player> = {};
  for (const p of players) playerMap[p.id] = p;
  const regionDefs: Record<string, Region> = {};
  const regionRuntimes: Record<string, RegionRuntime> = {};
  for (const r of regions) {
    regionDefs[r.id] = r;
    regionRuntimes[r.id] = mkRuntime(r.id);
  }
  return {
    round: 1,
    turn: 0,
    phase: 'end-of-round',
    activePlayerId: players[0]!.id,
    turnOrder: players.map((p) => p.id),
    players: playerMap,
    regions: regionRuntimes,
    regionDefs,
    market: [],
    mercs: { low: null, high: null, specialistValue: 6, claimed: {} },
    threatTrack: 0,
    roundGoals: [],
    secretGoalsByPlayer: Object.fromEntries(players.map((p) => [p.id, []])),
    rngSeed: 's',
    rngState: '',
    log: [],
    freeForAll: false,
    ...overrides,
  };
}

describe('scoreRoundGoal', () => {
  it('awards 3/2/1 across distinct ranks (highest direction)', () => {
    const p1 = mkPlayer({ id: 'p1', resources: { iron: 5, gold: 0, essence: 0 } });
    const p2 = mkPlayer({ id: 'p2', resources: { iron: 3, gold: 0, essence: 0 } });
    const p3 = mkPlayer({ id: 'p3', resources: { iron: 1, gold: 0, essence: 0 } });
    const state = mkState([p1, p2, p3], []);
    const next = scoreRoundGoal(state, {
      id: 'most-iron',
      name: '',
      description: '',
      direction: 'highest',
    });
    expect(next.players.p1!.vp).toBe(3);
    expect(next.players.p2!.vp).toBe(2);
    expect(next.players.p3!.vp).toBe(1);
  });

  it('ties share full VP at the top', () => {
    const p1 = mkPlayer({ id: 'p1', resources: { iron: 5, gold: 0, essence: 0 } });
    const p2 = mkPlayer({ id: 'p2', resources: { iron: 5, gold: 0, essence: 0 } });
    const p3 = mkPlayer({ id: 'p3', resources: { iron: 1, gold: 0, essence: 0 } });
    const state = mkState([p1, p2, p3], []);
    const next = scoreRoundGoal(state, {
      id: 'most-iron',
      name: '',
      description: '',
      direction: 'highest',
    });
    expect(next.players.p1!.vp).toBe(3);
    expect(next.players.p2!.vp).toBe(3);
    // distinct second tier — p3 with 1 — gets 2 VP
    expect(next.players.p3!.vp).toBe(2);
  });

  it('honors the lowest direction', () => {
    const p1 = mkPlayer({ id: 'p1', resources: { iron: 5, gold: 0, essence: 0 } });
    const p2 = mkPlayer({ id: 'p2', resources: { iron: 1, gold: 0, essence: 0 } });
    const state = mkState([p1, p2], []);
    const next = scoreRoundGoal(state, {
      id: 'least-resources',
      name: '',
      description: '',
      direction: 'lowest',
    });
    expect(next.players.p2!.vp).toBe(3);
    expect(next.players.p1!.vp).toBe(2);
  });
});

describe('scoreFortressPerRound', () => {
  it('awards 1 VP per held fortress to its garrison owner', () => {
    const p1 = mkPlayer({ id: 'p1' });
    const p2 = mkPlayer({ id: 'p2' });
    const fortress = mkRegion({ id: 'f1', isFortress: true });
    const other = mkRegion({ id: 'r1' });
    const state = mkState([p1, p2], [fortress, other]);
    state.regions.f1 = mkRuntime('f1', {
      garrisonOwnerId: 'p1',
      garrisonedDieIds: ['d1'],
    });
    const next = scoreFortressPerRound(state);
    expect(next.players.p1!.vp).toBe(1);
    expect(next.players.p2!.vp).toBe(0);
  });
});

describe('computeEndGameScore', () => {
  it('produces a winnerId and per-player breakdown', () => {
    const p1 = mkPlayer({ id: 'p1', vp: 10 });
    const p2 = mkPlayer({ id: 'p2', vp: 5 });
    const r1 = mkRegion({ id: 'r1', vp: 2 });
    const state = mkState([p1, p2], [r1]);
    state.regions.r1 = mkRuntime('r1', { placedDieIds: ['d-from-p1'] });
    state.players.p1!.dice = [
      {
        id: 'd-from-p1',
        range: '1-6',
        faceValue: 5,
        ownerId: 'p1',
        location: { kind: 'region', regionId: 'r1' },
      },
    ];
    const breakdown = computeEndGameScore(state, []);
    expect(breakdown.winnerId).toBe('p1');
    expect(breakdown.perPlayer.p1!.total).toBeGreaterThan(breakdown.perPlayer.p2!.total);
    expect(breakdown.perPlayer.p1!.parts.regionControl).toBe(2);
  });
});
