import { describe, expect, it } from 'vitest';
import { evaluateSpecialistHire } from '@ai/specialist-merc';
import type { GameState, RulesConfig } from '@engine/types';

const rules: RulesConfig = {
  totalRounds: 7,
  resourceCap: 8,
  specialistSequence: [6, 5, 4, 3, 2, 1, 1],
  freeForAllRound: 7,
  freeForAllToggles: {
    free: true,
    allMercsFree: true,
    halfPriceCards: true,
    specialistChoosable: true,
    waiveCardHandLimit: false,
  },
  threatTrackThreshold: 8,
};

function emptyState(round: number): GameState {
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
    mercs: { low: null, high: null, specialist: null, specialistValue: 6, claimed: {} },
    threatTrack: 0,
    roundGoals: [],
    secretGoalsByPlayer: {},
    rngSeed: 's',
    rngState: '',
    log: [],
    freeForAll: false,
    mercHireLog: [],
    lockedRegions: {},
  };
}

describe('evaluateSpecialistHire', () => {
  it('Warriors strongly prefer high specialist values', () => {
    const state = emptyState(1);
    const score6 = evaluateSpecialistHire(6, state, 'warriors', rules);
    const score2 = evaluateSpecialistHire(2, state, 'warriors', rules);
    expect(score6).toBeGreaterThan(score2);
  });

  it('Assassins strongly prefer low specialist values', () => {
    const state = emptyState(5);
    const score1 = evaluateSpecialistHire(2, state, 'assassins', rules);
    const score6 = evaluateSpecialistHire(6, state, 'assassins', rules);
    expect(score1).toBeGreaterThan(score6);
  });

  it('Mages give consistent moderate value across the curve', () => {
    const state = emptyState(2);
    const score = evaluateSpecialistHire(4, state, 'mages', rules);
    expect(score).toBeGreaterThan(0);
  });
});
