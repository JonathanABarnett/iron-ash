// Test skill-level variability across 1v1, 1v2, 1v3 configurations.
// Each scenario runs a fixed lineup with different per-position difficulty levels.
// Answers: "How much does skill matter?" and "Can a hard player beat N easy opponents?"
//
// Output: per-position win rate and average VP, grouped by scenario.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCards, parseCosts, parseFactions, parseRegions,
  parseRoundGoals, parseRules, parseSecretGoals, parseStructures,
} from '../src/engine/config-loader';
import { runOneGame } from '../src/simulation/runner';
import type { Difficulty } from '../src/ai/types';
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

// Run a single player-count group at a time to stay within Node memory limits.
// Usage:
//   npx tsx scripts/test-player-levels.ts            (runs 2-player group)
//   npx tsx scripts/test-player-levels.ts --count=3  (runs 3-player group)
//   npx tsx scripts/test-player-levels.ts --count=4  (runs 4-player group)
const ARG_COUNT = (() => {
  const a = process.argv.find((x) => x.startsWith('--count='));
  return a ? parseInt(a.split('=')[1]!, 10) : 2;
})();

const GAMES = 100;            // per scenario
const BASE_SEED = 'levels-v1';

// Representative lineup for each player count (balanced factions)
const LINEUP_2P: FactionId[] = ['warriors', 'mages'];
const LINEUP_3P: FactionId[] = ['warriors', 'merchants', 'mages'];
const LINEUP_4P: FactionId[] = ['warriors', 'assassins', 'merchants', 'mages'];

interface Scenario {
  label: string;          // Human-readable name
  tag: string;            // Short key for seed
  lineup: FactionId[];
  difficulties: Difficulty[];
}

const SCENARIOS: Scenario[] = [
  // ── Symmetric baselines ──────────────────────────────────────────────────
  { label: '1v1  — all Easy',   tag: '2p-eee', lineup: LINEUP_2P, difficulties: ['easy', 'easy'] },
  { label: '1v1  — all Medium', tag: '2p-mmm', lineup: LINEUP_2P, difficulties: ['medium', 'medium'] },
  { label: '1v1  — all Hard',   tag: '2p-hhh', lineup: LINEUP_2P, difficulties: ['hard', 'hard'] },

  // ── 1v1 skill gaps ───────────────────────────────────────────────────────
  { label: '1v1  — Hard vs Easy',   tag: '2p-he',  lineup: LINEUP_2P, difficulties: ['hard', 'easy'] },
  { label: '1v1  — Hard vs Medium', tag: '2p-hm',  lineup: LINEUP_2P, difficulties: ['hard', 'medium'] },
  { label: '1v1  — Medium vs Easy', tag: '2p-me',  lineup: LINEUP_2P, difficulties: ['medium', 'easy'] },

  // ── 3-player mixed ───────────────────────────────────────────────────────
  { label: '1v2  — all Medium',          tag: '3p-mmm', lineup: LINEUP_3P, difficulties: ['medium', 'medium', 'medium'] },
  { label: '1v2  — Hard vs 2 Easy',      tag: '3p-hee', lineup: LINEUP_3P, difficulties: ['hard', 'easy', 'easy'] },
  { label: '1v2  — Hard vs 2 Medium',    tag: '3p-hmm', lineup: LINEUP_3P, difficulties: ['hard', 'medium', 'medium'] },
  { label: '1v2  — Medium + Easy + Easy',tag: '3p-mee', lineup: LINEUP_3P, difficulties: ['medium', 'easy', 'easy'] },
  { label: '1v2  — Hard + Medium + Easy',tag: '3p-hme', lineup: LINEUP_3P, difficulties: ['hard', 'medium', 'easy'] },

  // ── 4-player mixed ───────────────────────────────────────────────────────
  { label: '1v3  — all Medium',       tag: '4p-mmmm', lineup: LINEUP_4P, difficulties: ['medium', 'medium', 'medium', 'medium'] },
  { label: '1v3  — Hard vs 3 Easy',   tag: '4p-heee', lineup: LINEUP_4P, difficulties: ['hard', 'easy', 'easy', 'easy'] },
  { label: '1v3  — Hard vs 3 Medium', tag: '4p-hmmm', lineup: LINEUP_4P, difficulties: ['hard', 'medium', 'medium', 'medium'] },
  { label: '1v3  — Mixed H/M/E/E',    tag: '4p-hmee', lineup: LINEUP_4P, difficulties: ['hard', 'medium', 'easy', 'easy'] },
];

interface PositionStats {
  wins: number;
  totalVP: number;
  plays: number;
}

function runScenario(
  s: Scenario,
  configs: ReturnType<typeof loadConfigs>,
): PositionStats[] {
  const stats: PositionStats[] = s.lineup.map(() => ({ wins: 0, totalVP: 0, plays: 0 }));

  for (let i = 0; i < GAMES; i++) {
    const seed = `${BASE_SEED}-${s.tag}-${i}`;
    // fixed-rotate rotates lineup each game — each player sits in each seat roughly equally
    const offset = i % s.lineup.length;
    const rotated = [...s.lineup.slice(offset), ...s.lineup.slice(0, offset)];
    const rotatedDiffs = [...s.difficulties.slice(offset), ...s.difficulties.slice(0, offset)];

    let final;
    try {
      final = runOneGame(seed, configs, 'medium', 'fixed-rotate', rotated, i, rotatedDiffs);
    } catch {
      continue; // skip crashed games rather than aborting the whole scenario
    }
    // Immediately extract what we need; let the large state object be GC'd.
    const winnerId   = final.winnerId;
    const playerSnap = Object.fromEntries(
      Object.entries(final.players).map(([id, p]) => [id, { vp: p.vp, factionId: p.factionId }]),
    );

    // Map result back to original positions by faction
    for (let pos = 0; pos < s.lineup.length; pos++) {
      const factionId = s.lineup[pos]!;
      const pid = Object.keys(playerSnap).find(
        (id) => playerSnap[id]?.factionId === factionId,
      );
      if (!pid) continue;
      const p = playerSnap[pid]!;
      stats[pos]!.plays += 1;
      stats[pos]!.totalVP += p.vp;
      if (winnerId === pid) stats[pos]!.wins += 1;
    }
  }
  return stats;
}

function diffLabel(d: Difficulty): string {
  return d === 'easy' ? 'Easy  ' : d === 'medium' ? 'Medium' : 'Hard  ';
}

function bar(pct: number, width = 20): string {
  const filled = Math.round(pct * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function printScenario(s: Scenario, stats: PositionStats[]) {
  const fmt = (n: number) => n.toFixed(1).padStart(5);
  const n = stats.reduce((a, b) => a + b.plays, 0);
  console.log(`\n  ${s.label}  (${n} games)`);
  console.log('  ' + '─'.repeat(58));
  console.log(`  ${'Pos'.padEnd(4)} ${'Level'.padEnd(8)} ${'Faction'.padEnd(14)} ${'Win%'.padStart(6)}  ${'AvgVP'.padStart(6)}  Distribution`);

  for (let i = 0; i < s.lineup.length; i++) {
    const pos = stats[i]!;
    const d = s.difficulties[i]!;
    const wr = pos.plays > 0 ? pos.wins / pos.plays : 0;
    const avg = pos.plays > 0 ? pos.totalVP / pos.plays : 0;
    const expectedWR = 1 / s.lineup.length;
    const delta = (wr - expectedWR) * 100;
    const flag = Math.abs(delta) >= 10 ? (delta > 0 ? ' ▲' : ' ▼') : '  ';
    console.log(
      `  p${i + 1}   ${diffLabel(d)}  ${s.lineup[i]!.padEnd(14)} ` +
      `${fmt(wr * 100)}%  ${fmt(avg)} VP  ${bar(wr)} ${flag}`,
    );
  }

  // Skill advantage summary: Hard vs Easy delta if both present
  const hardIdx  = s.difficulties.indexOf('hard');
  const easyIdx  = s.difficulties.indexOf('easy');
  if (hardIdx >= 0 && easyIdx >= 0) {
    const hardWR  = stats[hardIdx]!.wins / stats[hardIdx]!.plays;
    const easyWR  = stats[easyIdx]!.wins / stats[easyIdx]!.plays;
    const hardVP  = stats[hardIdx]!.totalVP / stats[hardIdx]!.plays;
    const easyVP  = stats[easyIdx]!.totalVP / stats[easyIdx]!.plays;
    const skillGap = (hardWR - easyWR) * 100;
    const vpGap    = hardVP - easyVP;
    console.log(`\n  ⚡ Skill gap  Hard vs Easy: ${skillGap > 0 ? '+' : ''}${skillGap.toFixed(1)}pp win  /  ${vpGap > 0 ? '+' : ''}${vpGap.toFixed(1)} VP`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TAG = ARG_COUNT === 2 ? '1v1 (2-player)' : ARG_COUNT === 3 ? '1v2 (3-player)' : '1v3 (4-player)';
const activeScenarios = SCENARIOS.filter(s => s.lineup.length === ARG_COUNT);

console.log(`\n  Iron & Ash — Player Level Variability Test  ·  ${TAG}`);
console.log(`  ${GAMES} games × ${activeScenarios.length} scenarios = ${GAMES * activeScenarios.length} total\n`);

const configs = loadConfigs();

interface SkillSummary { tag: string; hardWR: number; easyWR: number; gap: number; vpGap: number }
const summaries: SkillSummary[] = [];

console.log(`${'═'.repeat(64)}`);
console.log(`  ${TAG}`);
console.log(`${'═'.repeat(64)}`);

for (const s of activeScenarios) {
  process.stdout.write(`  Running "${s.label}"…`);
  const stats = runScenario(s, configs);
  process.stdout.write(` done (${stats[0]!.plays} games each)\n`);
  printScenario(s, stats);

  const hardIdx = s.difficulties.indexOf('hard');
  const easyIdx = s.difficulties.indexOf('easy');
  if (hardIdx >= 0 && easyIdx >= 0) {
    const hWR = stats[hardIdx]!.wins / stats[hardIdx]!.plays;
    const eWR = stats[easyIdx]!.wins / stats[easyIdx]!.plays;
    const hVP = stats[hardIdx]!.totalVP / stats[hardIdx]!.plays;
    const eVP = stats[easyIdx]!.totalVP / stats[easyIdx]!.plays;
    summaries.push({ tag: s.label, hardWR: hWR, easyWR: eWR, gap: hWR - eWR, vpGap: hVP - eVP });
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
if (summaries.length > 0) {
  console.log(`\n${'═'.repeat(64)}`);
  console.log('  SKILL ADVANTAGE SUMMARY  (Hard vs Easy win-rate delta)');
  console.log(`${'═'.repeat(64)}`);
  console.log(`\n  ${'Scenario'.padEnd(36)} ${'Hard'.padStart(6)}  ${'Easy'.padStart(6)}  ${'Gap'.padStart(7)}  ${'VP +/-'.padStart(7)}`);
  console.log('  ' + '─'.repeat(62));

  summaries.sort((a, b) => b.gap - a.gap);
  for (const s of summaries) {
    const glyph = s.gap >= 0.15 ? '⚠ ' : s.gap >= 0.08 ? '△ ' : '✓ ';
    console.log(
      `  ${glyph}${s.tag.padEnd(34)} ` +
      `${(s.hardWR * 100).toFixed(1).padStart(5)}%  ` +
      `${(s.easyWR * 100).toFixed(1).padStart(5)}%  ` +
      `${(s.gap * 100 > 0 ? '+' : '')}${(s.gap * 100).toFixed(1).padStart(5)}pp  ` +
      `${s.vpGap > 0 ? '+' : ''}${s.vpGap.toFixed(1).padStart(5)} VP`,
    );
  }

  const avg = summaries.reduce((a, b) => a + b.gap, 0) / summaries.length;
  const avgVP = summaries.reduce((a, b) => a + b.vpGap, 0) / summaries.length;
  console.log('\n  ' + '─'.repeat(62));
  console.log(`  Mean Hard vs Easy edge: ${avg >= 0 ? '+' : ''}${(avg * 100).toFixed(1)}pp win  /  ${avgVP >= 0 ? '+' : ''}${avgVP.toFixed(1)} VP`);
}

console.log(`
  Legend:  ✓ <8pp  △ 8–15pp  ⚠ >15pp skill premium
  Run all groups:  --count=2  --count=3  --count=4
`);
