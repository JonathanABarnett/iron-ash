// runSimulation: batch-run AI-vs-AI games and emit a SimulationResult.
// Used by scripts/run-sim.ts and (in Phase 5) the /sim UI route.

import { createGame } from '../engine/setup';
import { Rng } from '../engine/rng';
import { apply } from '../engine/moves';
import { endOfRound, isRoundOver, rollPhase } from '../engine/rounds';
import { pickMove } from '../ai/decide';
import type { FactionId, GameState } from '../engine/types';
import type { RunOptions, SimulationResult } from './types';
import { StatsAccumulator } from './stats';
import { generateWarnings } from './warnings';

const TURN_BUDGET = 20000;

function pickLineup(
  ids: FactionId[],
  rng: Rng,
  mode: RunOptions['lineupMode'],
  fixed: FactionId[] | undefined,
  gameIndex: number,
): FactionId[] {
  if (mode === 'fixed-rotate' && fixed && fixed.length >= 2) {
    const offset = gameIndex % fixed.length;
    const rotated = [...fixed.slice(offset), ...fixed.slice(0, offset)];
    return rotated.slice(0, Math.min(4, fixed.length));
  }
  // Default: random 2-4 factions.
  const shuffled = rng.shuffle(ids);
  const count = rng.nextInt(2, 4);
  return shuffled.slice(0, count);
}

export function runOneGame(
  seed: string,
  configs: RunOptions['configs'],
  difficulty: RunOptions['difficulty'],
  lineupMode: RunOptions['lineupMode'] = 'random',
  fixedLineup: FactionId[] | undefined = undefined,
  gameIndex = 0,
): GameState {
  const { factions, regions, rules, roundGoals, secretGoals, cards } = configs;
  const setupRng = new Rng(`${seed}-lineup`);
  const lineup = pickLineup(
    factions.map((f) => f.id),
    setupRng,
    lineupMode,
    fixedLineup,
    gameIndex,
  );

  let state = createGame({
    seed,
    players: lineup.map((factionId, i) => ({
      id: `p${i + 1}`,
      factionId,
      isAI: true,
    })),
    regions,
    factions,
    rules,
    roundGoals,
    secretGoals,
  });

  const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
  let totalTurns = 0;

  while (state.phase !== 'finished' && totalTurns < TURN_BUDGET) {
    if (state.phase === 'roll') {
      state = rollPhase(state, { rng, cards });
      continue;
    }
    if (isRoundOver(state)) {
      state = endOfRound(state, { rules, roundGoals, secretGoals });
      continue;
    }
    const { move } = pickMove(state, {
      rules,
      cards,
      roundGoals,
      secretGoals,
      rng,
      difficulty,
    });
    state = apply(state, move, { rules, cards, rng });
    totalTurns += 1;
  }
  if (state.phase !== 'finished') {
    throw new Error(`Game did not finish within ${TURN_BUDGET} turns (seed=${seed})`);
  }
  return state;
}

export function runSimulation(opts: RunOptions): SimulationResult {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const acc = new StatsAccumulator(opts.configs.rules.totalRounds);

  for (let i = 0; i < opts.numGames; i++) {
    const seed = `${opts.seed}-${i.toString(16)}`;
    const final = runOneGame(
      seed,
      opts.configs,
      opts.difficulty,
      opts.lineupMode ?? 'random',
      opts.fixedLineup,
      i,
    );
    acc.record(final);
  }

  const { factionStats, rulePressure } = acc.finalize();
  const warnings = generateWarnings(factionStats, rulePressure);

  return {
    simulationId: `${opts.seed}-${opts.difficulty}-${opts.numGames}`,
    gamesRun: opts.numGames,
    difficulty: opts.difficulty,
    seed: opts.seed,
    startedAt,
    elapsedMs: Date.now() - t0,
    factionStats,
    rulePressure,
    warnings,
  };
}
