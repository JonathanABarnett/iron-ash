import { describe, expect, it } from 'vitest';
import { createGame } from '@engine/setup';
import { endOfRound, isRoundOver, rollPhase } from '@engine/rounds';
import { apply, enumerate } from '@engine/moves';
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

const MAX_TURNS_PER_ROUND = 100;

function configs() {
  return {
    factions: parseFactions(factionsJson),
    regions: parseRegions(regionsJson),
    rules: parseRules(rulesJson),
    roundGoals: parseRoundGoals(roundGoalsJson),
    secretGoals: parseSecretGoals(secretGoalsJson),
  };
}

describe('round loop', () => {
  it('plays a single round to completion with random AI', () => {
    const { factions, regions, rules, roundGoals, secretGoals } = configs();

    let state = createGame({
      seed: 'round-smoke',
      players: [
        { id: 'p1', factionId: 'warriors', isAI: true },
        { id: 'p2', factionId: 'mages', isAI: true },
      ],
      regions,
      factions,
      rules,
      roundGoals,
      secretGoals,
    });

    const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
    state = rollPhase(state, rng);
    expect(state.phase).toBe('action');

    let turns = 0;
    while (!isRoundOver(state) && turns < MAX_TURNS_PER_ROUND) {
      const moves = enumerate(state);
      const choice = rng.pick(moves);
      state = apply(state, choice);
      turns += 1;
    }

    expect(turns).toBeLessThan(MAX_TURNS_PER_ROUND);
    expect(isRoundOver(state)).toBe(true);

    const after = endOfRound(state, { rules, roundGoals, secretGoals });
    expect(after.round).toBe(2);
    expect(after.phase).toBe('roll');
    for (const player of Object.values(after.players)) {
      for (const die of player.dice) {
        expect(['barracks', 'garrison']).toContain(die.location.kind);
      }
      expect(player.passedThisRound).toBe(false);
    }
  });

  it('a full game runs to phase=finished, picks a winner, and assigns positive VP', () => {
    const { factions, regions, rules, roundGoals, secretGoals } = configs();

    let state = createGame({
      seed: 'full-game-smoke',
      players: [
        { id: 'p1', factionId: 'warriors', isAI: true },
        { id: 'p2', factionId: 'mages', isAI: true },
        { id: 'p3', factionId: 'merchants', isAI: true },
      ],
      regions,
      factions,
      rules,
      roundGoals,
      secretGoals,
    });

    const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
    let totalTurns = 0;
    while (state.phase !== 'finished' && totalTurns < 5000) {
      if (state.phase === 'roll') {
        state = rollPhase(state, rng);
        continue;
      }
      if (isRoundOver(state)) {
        state = endOfRound(state, { rules, roundGoals, secretGoals });
        continue;
      }
      const moves = enumerate(state);
      const choice = rng.pick(moves);
      state = apply(state, choice);
      totalTurns += 1;
    }

    expect(state.phase).toBe('finished');
    expect(state.scoreBreakdown).toBeDefined();
    expect(state.winnerId).toBeDefined();
    // At least the winner must have non-zero VP after a full game.
    const winner = state.scoreBreakdown!.perPlayer[state.winnerId!]!;
    expect(winner.total).toBeGreaterThan(0);
    expect(totalTurns).toBeLessThan(5000);
  });

  it('threat track ends the game early when threshold is met before final round', () => {
    const { factions, regions, roundGoals, secretGoals } = configs();
    const lowThresholdRules = {
      ...parseRules(rulesJson),
      threatTrackThreshold: 3,
      totalRounds: 7,
    };

    let state = createGame({
      seed: 'threat-end',
      players: [
        { id: 'p1', factionId: 'warriors', isAI: true },
        { id: 'p2', factionId: 'mages', isAI: true },
      ],
      regions,
      factions,
      rules: lowThresholdRules,
      roundGoals,
      secretGoals,
    });

    const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
    while (state.phase !== 'finished') {
      if (state.phase === 'roll') {
        state = rollPhase(state, rng);
        continue;
      }
      if (isRoundOver(state)) {
        state = endOfRound(state, {
          rules: lowThresholdRules,
          roundGoals,
          secretGoals,
        });
        continue;
      }
      const moves = enumerate(state);
      state = apply(state, rng.pick(moves));
    }
    expect(state.threatTrack).toBeGreaterThanOrEqual(3);
    expect(state.round).toBeLessThanOrEqual(3);
  });
});
