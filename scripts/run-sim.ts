// Phase 1 sim runner: random AI, no scoring, no real metrics.
// Validates that engine + config + RNG wire up end-to-end.
// Replaced in Phase 4 by src/simulation/runner.ts (proper batch runner with stats).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import { createGame } from '../src/engine/setup';
import { Rng } from '../src/engine/rng';
import { apply, enumerate } from '../src/engine/moves';
import { endOfRound, isRoundOver, rollPhase } from '../src/engine/rounds';
import {
  parseFactions,
  parseRegions,
  parseRules,
} from '../src/engine/config-loader';
import type { FactionId, GameState } from '../src/engine/types';

interface CliFlags {
  games: number;
  debug: boolean;
  seed: string;
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = { games: 1, debug: false, seed: 'sim-default' };
  for (const arg of argv) {
    const [key, val] = arg.split('=');
    if (key === '--games' && val) flags.games = Number(val);
    else if (key === '--seed' && val) flags.seed = val;
    else if (arg === '--debug') flags.debug = true;
  }
  return flags;
}

function loadConfigs() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = resolve(here, '..');
  const factions = parseFactions(
    JSON.parse(readFileSync(resolve(root, 'config/factions.json'), 'utf8')),
  );
  const regions = parseRegions(
    JSON.parse(readFileSync(resolve(root, 'config/regions.json'), 'utf8')),
  );
  const rules = parseRules(
    JSON.parse(readFileSync(resolve(root, 'config/rules.json'), 'utf8')),
  );
  return { factions, regions, rules };
}

function chooseLineup(allFactionIds: FactionId[], rng: Rng): FactionId[] {
  const shuffled = rng.shuffle(allFactionIds);
  const count = rng.nextInt(2, 4);
  return shuffled.slice(0, count);
}

function runGame(seed: string, configs: ReturnType<typeof loadConfigs>): GameState {
  const { factions, regions, rules } = configs;
  const setupRng = new Rng(`${seed}-lineup`);
  const lineup = chooseLineup(
    factions.map((f) => f.id),
    setupRng,
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
  });

  const rng = Rng.fromSnapshot(JSON.parse(state.rngState));
  let totalTurns = 0;
  const TURN_BUDGET = 20000;

  while (state.phase !== 'finished' && totalTurns < TURN_BUDGET) {
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
  if (state.phase !== 'finished') {
    throw new Error(`Game did not finish within ${TURN_BUDGET} turns (seed=${seed})`);
  }
  return state;
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const configs = loadConfigs();
  const { games, seed, debug } = flags;

  console.log(
    `[iron-ash] Running ${games} game${games === 1 ? '' : 's'} with seed prefix "${seed}"`,
  );

  const startedAt = Date.now();
  const factionAppearances = new Map<FactionId, number>();
  let totalRoundsPlayed = 0;
  let placeMoves = 0;
  let combineMoves = 0;
  let passMoves = 0;

  for (let i = 0; i < games; i++) {
    const gameSeed = `${seed}-${i.toString(16)}`;
    const final = runGame(gameSeed, configs);
    totalRoundsPlayed += final.round;
    for (const p of Object.values(final.players)) {
      factionAppearances.set(
        p.factionId,
        (factionAppearances.get(p.factionId) ?? 0) + 1,
      );
    }
    for (const entry of final.log) {
      if (entry.event.kind === 'move') {
        if (entry.event.move.kind === 'place') placeMoves += 1;
        else if (entry.event.move.kind === 'combine') combineMoves += 1;
        else if (entry.event.move.kind === 'pass') passMoves += 1;
      }
    }
    if (debug && i === 0) {
      console.log(`\n--- Game 0 log (truncated to first 30 entries) ---`);
      for (const entry of final.log.slice(0, 30)) {
        console.log(JSON.stringify(entry));
      }
      console.log(`--- end log; total entries: ${final.log.length} ---\n`);
    }
  }

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[iron-ash] Done. ${games} games in ${elapsedMs}ms (${(games / Math.max(1, elapsedMs / 1000)).toFixed(1)} games/sec)`,
  );
  console.log(`  rounds total:   ${totalRoundsPlayed}`);
  console.log(
    `  moves:          place=${placeMoves}  combine=${combineMoves}  pass=${passMoves}`,
  );
  console.log(`  faction picks:  ${[...factionAppearances.entries()].map(([k, v]) => `${k}=${v}`).join('  ')}`);
}

main();
