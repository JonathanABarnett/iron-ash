import { describe, expect, it } from 'vitest';
import { createGame } from '@engine/setup';
import { endOfRound, isRoundOver, rollPhase } from '@engine/rounds';
import { apply, enumerate } from '@engine/moves';
import { Rng } from '@engine/rng';
import { parseFactions, parseRegions, parseRules } from '@engine/config-loader';
import factionsJson from '@config/factions.json';
import regionsJson from '@config/regions.json';
import rulesJson from '@config/rules.json';

const MAX_TURNS_PER_ROUND = 100;

describe('round loop', () => {
  it('plays a single round to completion with random AI', () => {
    const factions = parseFactions(factionsJson);
    const regions = parseRegions(regionsJson);
    const rules = parseRules(rulesJson);

    let state = createGame({
      seed: 'round-smoke',
      players: [
        { id: 'p1', factionId: 'warriors', isAI: true },
        { id: 'p2', factionId: 'mages', isAI: true },
      ],
      regions,
      factions,
      rules,
    });

    const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
    state = rollPhase(state, rng);
    expect(state.phase).toBe('action');

    let turns = 0;
    while (!isRoundOver(state) && turns < MAX_TURNS_PER_ROUND) {
      const moves = enumerate(state);
      // Random AI: deterministic via seeded rng
      const choice = rng.pick(moves);
      state = apply(state, choice);
      turns += 1;
    }

    expect(turns).toBeLessThan(MAX_TURNS_PER_ROUND);
    expect(isRoundOver(state)).toBe(true);

    const after = endOfRound(state, rules);
    expect(after.round).toBe(2);
    expect(after.phase).toBe('roll');
    // Every previously-region-placed die returned to barracks
    for (const player of Object.values(after.players)) {
      for (const die of player.dice) {
        expect(['barracks', 'garrison']).toContain(die.location.kind);
      }
      expect(player.passedThisRound).toBe(false);
    }
  });

  it('a full game runs to phase=finished within reasonable turns', () => {
    const factions = parseFactions(factionsJson);
    const regions = parseRegions(regionsJson);
    const rules = parseRules(rulesJson);

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
    });

    const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
    let totalTurns = 0;
    while (state.phase !== 'finished' && totalTurns < 5000) {
      if (state.phase === 'roll') {
        state = rollPhase(state, rng);
        continue;
      }
      if (isRoundOver(state)) {
        state = endOfRound(state, rules);
        continue;
      }
      const moves = enumerate(state);
      const choice = rng.pick(moves);
      state = apply(state, choice);
      totalTurns += 1;
    }

    expect(state.phase).toBe('finished');
    expect(state.round).toBe(rules.totalRounds);
    expect(totalTurns).toBeLessThan(5000);
  });
});
