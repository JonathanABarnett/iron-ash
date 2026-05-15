// Test sim across 1v1 (2-player), 1v2 (3-player), 1v3 (4-player) configurations.
// For each config, we run 300 games and look at:
//   - Faction balance within that player count
//   - Game length distribution
//   - Threat track behaviour
//   - Issues specific to that count (fortresses per player ratio, etc.)

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCards, parseCosts, parseFactions, parseRegions,
  parseRoundGoals, parseRules, parseSecretGoals, parseStructures,
} from '../src/engine/config-loader';
import { runSimulation } from '../src/simulation/runner';
import type { FactionId } from '../src/engine/types';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function loadConfigs() {
  const r = (f: string) => JSON.parse(readFileSync(resolve(root, f), 'utf8'));
  return {
    factions:    parseFactions(r('config/factions.json')),
    regions:     parseRegions(r('config/regions.json')),
    rules:       parseRules(r('config/rules.json')),
    roundGoals:  parseRoundGoals(r('config/round-goals.json')),
    secretGoals: parseSecretGoals(r('config/secret-goals.json')),
    cards:       parseCards(r('config/cards.json')),
    costs:       parseCosts(r('config/costs.json')),
    structures:  parseStructures(r('config/structures.json')),
  };
}

// Representative faction lineups for each player count
// Chosen to spread resource types and strategies evenly
// Lineups are designed so each faction faces a balanced spread of opponents:
// - Every faction appears in exactly 2 lineups per player count
// - No faction is exclusively matched against the weakest or strongest peers
// 2-player: balanced pairings — warriors faces mid-tier foes (merchants + beastmasters)
// 3-player: each faction appears 2-3 times across 6 three-way lineups
// 4-player: each faction appears in 2 of 4 four-way lineups
const LINEUPS: Record<number, FactionId[][]> = {
  2: [
    ['warriors',     'merchants'],    // warriors vs strong
    ['rangers',      'assassins'],
    ['mages',        'necromancers'],
    ['paladins',     'beastmasters'],
    ['warriors',     'beastmasters'], // warriors vs mid-tier
    ['rangers',      'mages'],
    ['assassins',    'necromancers'],
    ['merchants',    'paladins'],
  ],
  // 3-player: strong factions (assassins, necromancers) face each other in at least 1 lineup.
  // Mages faces mixed-strength opponents (not always the strongest factions).
  3: [
    ['warriors',      'mages',         'rangers'],
    ['assassins',     'necromancers',  'paladins'],   // strong vs strong
    ['merchants',     'beastmasters',  'warriors'],
    ['mages',         'assassins',     'beastmasters'],
    ['necromancers',  'rangers',       'merchants'],
    ['warriors',      'paladins',      'assassins'],
  ],
  // 4-player: balanced so no faction only faces the weakest opponents.
  // Beastmasters faces strong factions (mages, merchants, paladins, rangers) rather than
  // always the weakest. Necromancers faces mid-tier factions for a fair reading.
  4: [
    ['warriors',      'mages',        'beastmasters', 'necromancers'],
    ['assassins',     'paladins',     'rangers',      'merchants'],
    ['warriors',      'assassins',    'merchants',    'beastmasters'],
    ['mages',         'paladins',     'rangers',      'necromancers'],
  ],
};

const GAMES_PER_LINEUP_2P = 20;  // 28 matchups × 20 = 560 games (exhaustive round-robin)
const GAMES_PER_LINEUP = 50;     // 3-player and 4-player (fixed representative lineups)
const DIFFICULTY = 'medium' as const;

interface CountResults {
  playerCount: number;
  factionWins: Record<string, number>;
  factionPlays: Record<string, number>;
  roundLengths: number[];
  round7Count: number;
  fortressTurnovers: number;
  totalGames: number;
  warnings: string[];
}

/** Generate all C(n,k) combinations of a given size from an array. */
function combinations<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [first, ...rest] = arr as [T, ...T[]];
  return [
    ...combinations(rest, size - 1).map((c) => [first, ...c]),
    ...combinations(rest, size),
  ];
}

function analyseCount(playerCount: number, configs: ReturnType<typeof loadConfigs>): CountResults {
  // 2-player: exhaustive round-robin across ALL 28 matchups (C(8,2) = 28)
  // 3/4-player: fixed representative lineups (too many combinations otherwise)
  const allFactionIds: FactionId[] = [
    'warriors','assassins','mages','necromancers',
    'merchants','rangers','paladins','beastmasters',
  ];
  const lineups = playerCount === 2
    ? combinations(allFactionIds, 2) as FactionId[][]
    : LINEUPS[playerCount]!;
  const gamesPerLineup = playerCount === 2 ? GAMES_PER_LINEUP_2P : GAMES_PER_LINEUP;

  const res: CountResults = {
    playerCount,
    factionWins: {}, factionPlays: {},
    roundLengths: [], round7Count: 0,
    fortressTurnovers: 0, totalGames: 0,
    warnings: [],
  };

  for (const lineup of lineups) {
    // v2 prefix gives fresh seeds — avoids replaying identical seeded games
    const result = runSimulation({
      numGames: gamesPerLineup,
      difficulty: DIFFICULTY,
      seed: `v2-test-${playerCount}p-${lineup.join('-')}`,
      lineupMode: 'fixed-rotate',
      fixedLineup: lineup,
      configs,
    });

    res.totalGames += result.gamesRun;
    res.round7Count += Math.round(result.rulePressure.round7ReachRate * result.gamesRun);
    res.fortressTurnovers += Math.round(result.rulePressure.fortressTurnoverRate * result.gamesRun);
    res.roundLengths.push(result.rulePressure.avgGameLength);

    for (const [fid, stats] of Object.entries(result.factionStats)) {
      if (stats.playCount === 0) continue;
      res.factionWins[fid]  = (res.factionWins[fid]  ?? 0) + Math.round(stats.winRate * stats.playCount);
      res.factionPlays[fid] = (res.factionPlays[fid] ?? 0) + stats.playCount;
    }
  }

  return res;
}

function printResults(r: CountResults) {
  const tag = r.playerCount === 2 ? '1v1' : r.playerCount === 3 ? '1v2' : '1v3';
  const avgLen = r.roundLengths.reduce((a, b) => a + b, 0) / r.roundLengths.length;
  const r7pct  = (r.round7Count / r.totalGames * 100).toFixed(1);
  const ftPct  = (r.fortressTurnovers / r.totalGames * 100).toFixed(1);

  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  ${tag}  (${r.playerCount} players · ${r.totalGames} games)`);
  console.log(`${'═'.repeat(58)}`);
  console.log(`  avg length:       ${avgLen.toFixed(2)} rounds`);
  console.log(`  round-7 reach:    ${r7pct}%  ${Number(r7pct) > 50 ? '⚠ above 50%' : Number(r7pct) < 30 ? '⚠ below 30%' : '✓'}`);
  console.log(`  fortress turnover:${ftPct}%  ${Number(ftPct) < 60 ? '⚠ below 60%' : '✓'}`);

  // Faction win rates
  const factions = Object.keys(r.factionPlays).sort((a, b) => {
    const wa = r.factionWins[a]! / r.factionPlays[a]!;
    const wb = r.factionWins[b]! / r.factionPlays[b]!;
    return wb - wa;
  });

  const meanWin = factions.reduce((s, f) => s + r.factionWins[f]! / r.factionPlays[f]!, 0) / factions.length;

  console.log(`\n  Faction win rates (mean ${(meanWin*100).toFixed(1)}%):`);
  const issues: string[] = [];
  for (const f of factions) {
    const wr  = r.factionWins[f]! / r.factionPlays[f]!;
    const dev = (wr - meanWin) * 100;
    const bar = '█'.repeat(Math.round(wr * 40));
    const flag = Math.abs(dev) > 10 ? (dev > 0 ? ' ⚠ OVER' : ' ⚠ UNDER') : '';
    console.log(`    ${f.padEnd(14)} ${(wr*100).toFixed(1).padStart(5)}%  ${bar}${flag}`);
    if (Math.abs(dev) > 10) issues.push(`${f} ${dev > 0 ? '+' : ''}${dev.toFixed(1)}pp`);
  }

  if (issues.length) {
    console.log(`\n  ⚠  Balance issues: ${issues.join(', ')}`);
  } else {
    console.log(`\n  ✓  No faction balance warnings`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('\n  Iron & Ash — Player Count Balance Test');
const total1v1 = 28 * GAMES_PER_LINEUP_2P;        // exhaustive 28-matchup round-robin
const total3p  = 6  * GAMES_PER_LINEUP;
const total4p  = 4  * GAMES_PER_LINEUP;
console.log(`  1v1: ${total1v1} games (28 matchups × ${GAMES_PER_LINEUP_2P})  |  1v2: ${total3p}  |  1v3: ${total4p}  |  Total: ${total1v1+total3p+total4p}`);

const configs = loadConfigs();

const results: CountResults[] = [];
for (const count of [2, 3, 4]) {
  process.stdout.write(`  Running ${count}-player games…`);
  const r = analyseCount(count, configs);
  results.push(r);
  process.stdout.write(` done (${r.totalGames} games)\n`);
}

// Print all results
for (const r of results) printResults(r);

// Cross-count summary
console.log(`\n${'═'.repeat(58)}`);
console.log('  CROSS-COUNT SUMMARY');
console.log(`${'═'.repeat(58)}`);

const allFactions = [...new Set(results.flatMap(r => Object.keys(r.factionPlays)))];
console.log(`\n  ${'Faction'.padEnd(14)} ${'1v1'.padStart(7)} ${'1v2'.padStart(7)} ${'1v3'.padStart(7)}  Trend`);
console.log(`  ${'-'.repeat(46)}`);

for (const f of allFactions.sort()) {
  const rates = results.map(r => {
    if (!r.factionPlays[f]) return null;
    return (r.factionWins[f]! / r.factionPlays[f]! * 100);
  });
  const fmt = (v: number | null) => v === null ? '  —  ' : `${v.toFixed(1).padStart(5)}%`;
  const vals = rates.filter((v): v is number => v !== null);
  const trend = vals.length >= 2
    ? (vals[vals.length - 1]! - vals[0]!) > 5 ? '↑ better with more'
    : (vals[0]! - vals[vals.length - 1]!) > 5 ? '↓ worse with more'
    : '→ stable'
    : '';
  console.log(`  ${f.padEnd(14)} ${rates.map(fmt).join(' ')}  ${trend}`);
}

console.log('\n');
