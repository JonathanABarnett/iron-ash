// Phase 4 sim runner CLI.
// Delegates batching + stats + warnings to src/simulation/runner.ts;
// this script just parses flags, loads configs, and prints/writes output.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseCards,
  parseFactions,
  parseRegions,
  parseRoundGoals,
  parseRules,
  parseSecretGoals,
} from '../src/engine/config-loader';
import { runSimulation } from '../src/simulation/runner';
import { writeResultToFile } from '../src/simulation/output';
import type { Difficulty } from '../src/ai/types';

interface CliFlags {
  games: number;
  seed: string;
  difficulty: Difficulty;
  output?: string;
  quiet: boolean;
}

function parseFlags(argv: readonly string[]): CliFlags {
  const flags: CliFlags = {
    games: 1,
    seed: 'sim-default',
    difficulty: 'medium',
    quiet: false,
  };
  for (const arg of argv) {
    const [key, val] = arg.split('=');
    if (key === '--games' && val) flags.games = Number(val);
    else if (key === '--seed' && val) flags.seed = val;
    else if (key === '--output' && val) flags.output = val;
    else if (arg === '--quiet') flags.quiet = true;
    else if (key === '--difficulty' && val) {
      if (val === 'easy' || val === 'medium' || val === 'hard') flags.difficulty = val;
      else throw new Error(`--difficulty must be easy|medium|hard (got ${val})`);
    }
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
  const roundGoals = parseRoundGoals(
    JSON.parse(readFileSync(resolve(root, 'config/round-goals.json'), 'utf8')),
  );
  const secretGoals = parseSecretGoals(
    JSON.parse(readFileSync(resolve(root, 'config/secret-goals.json'), 'utf8')),
  );
  const cards = parseCards(
    JSON.parse(readFileSync(resolve(root, 'config/cards.json'), 'utf8')),
  );
  return { factions, regions, rules, roundGoals, secretGoals, cards };
}

function main() {
  const flags = parseFlags(process.argv.slice(2));
  const configs = loadConfigs();
  const { games, seed, difficulty, output, quiet } = flags;

  if (!quiet) {
    console.log(
      `[iron-ash] Running ${games} game${games === 1 ? '' : 's'} (difficulty=${difficulty}) seed="${seed}"`,
    );
  }

  const result = runSimulation({
    numGames: games,
    difficulty,
    seed,
    configs,
  });

  if (output) {
    const here = dirname(fileURLToPath(import.meta.url));
    const root = resolve(here, '..');
    const outPath = resolve(root, output);
    writeResultToFile(result, outPath);
    if (!quiet) console.log(`[iron-ash] Wrote ${outPath}`);
  }

  if (quiet) return;

  console.log(
    `[iron-ash] Done. ${result.gamesRun} games in ${result.elapsedMs}ms (${(result.gamesRun / Math.max(1, result.elapsedMs / 1000)).toFixed(1)} games/sec)`,
  );
  console.log(`  avg game length: ${result.rulePressure.avgGameLength.toFixed(2)} rounds`);
  console.log(`  round-7 reach:   ${(result.rulePressure.round7ReachRate * 100).toFixed(1)}%`);
  console.log(
    `  fortress turn:   ${(result.rulePressure.fortressTurnoverRate * 100).toFixed(1)}%`,
  );
  console.log(
    `  combine rate:    ${(result.rulePressure.combineActionRate * 100).toFixed(1)}%`,
  );
  console.log(
    `  merc hire rate:  ${(result.rulePressure.mercenaryHireRate * 100).toFixed(2)}%`,
  );
  console.log(
    `  specialist by round: ${result.rulePressure.specialistClaimByRound
      .map((v) => (v === null ? 'n/a' : `${(v * 100).toFixed(0)}%`))
      .join('  ')}`,
  );
  console.log('');
  console.log('  Faction stats:');
  for (const f of Object.values(result.factionStats)) {
    if (f.playCount === 0) continue;
    console.log(
      `    ${f.factionId.padEnd(13)} plays=${String(f.playCount).padStart(4)}  win=${(f.winRate * 100).toFixed(1).padStart(5)}%  avgVP=${f.avgVP.toFixed(1).padStart(5)}`,
    );
  }
  if (result.warnings.length > 0) {
    console.log('');
    console.log('  Warnings:');
    for (const w of result.warnings) console.log(`    - ${w}`);
  }
}

main();
