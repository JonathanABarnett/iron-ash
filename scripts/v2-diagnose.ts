// ─── v2 balance DIAGNOSIS — where does the imbalance come from? ───────────────
//
// Hand-tuning the 6 factions never converged (Paladins ~75% / Merchants ~23%
// at 2p). Before building an auto-tuner we must know WHICH lever drives it:
// pools, abilities, board spoil-geography, or hidden objectives. Each variant
// neutralises ONE suspected driver and we watch what flattens.
//
// Common random numbers: every variant replays the SAME seed set, so a win-rate
// delta reflects the config change, not RNG.
//
// Run:  npx tsx scripts/v2-diagnose.ts

import {
  createGameV2, rollHand, resolveRound, scoreRound, ROUNDS,
  setAbilitiesEnabled,
  type Deployments,
} from '../src/v2/game';
import { pickOneDie, type CommittedSums } from '../src/v2/ai';
import { scoreObjectives } from '../src/v2/objectives';
import { FACTIONS, RING, validCombos, type FactionId } from '../src/v2/factions';
import type { UnitRange } from '../src/v2/units';
import { Rng } from '../src/engine/rng';

const GAMES_PER_COMBO = 300;

// ── one game, sequential turn-by-turn deploy (mirrors the sandbox + sim) ──
function toSums(commit: Record<string, Record<number, number[]>>): CommittedSums {
  const out: CommittedSums = {};
  for (const tid of Object.keys(commit)) {
    out[tid] = {};
    for (const k of Object.keys(commit[tid]!)) {
      out[tid]![Number(k)] = commit[tid]![Number(k)]!.reduce((a, b) => a + b, 0);
    }
  }
  return out;
}

function runGame(factionIds: FactionId[], seed: string, useObjectives: boolean): number {
  const rng = new Rng(seed);
  const game = createGameV2(factionIds, seed);
  const N = game.players.length;

  for (let round = 1; round <= ROUNDS; round++) {
    game.round = round;
    const remaining: number[][] = [];
    for (let p = 0; p < N; p++) remaining[p] = rollHand(game, p, rng).map((d) => d.value);

    const commit: Record<string, Record<number, number[]>> = {};
    const passed = new Set<number>();
    let turn = (round - 1) % N;
    let safety = 1000;
    while (safety-- > 0) {
      if (Array.from({ length: N }, (_, p) => p).every((p) => passed.has(p) || remaining[p]!.length === 0)) break;
      const p = turn;
      if (!passed.has(p) && remaining[p]!.length > 0) {
        const choice = pickOneDie(game, p, remaining[p]!, toSums(commit));
        if (choice) {
          ((commit[choice.tid] ??= {})[p] ??= []).push(choice.dieValue);
          const idx = remaining[p]!.indexOf(choice.dieValue);
          if (idx >= 0) remaining[p]!.splice(idx, 1);
        } else passed.add(p);
      } else passed.add(p);
      let nxt = -1;
      for (let s = 1; s <= N; s++) { const q = (p + s) % N; if (!passed.has(q) && remaining[q]!.length > 0) { nxt = q; break; } }
      if (nxt === -1) break;
      turn = nxt;
    }

    const deployments: Deployments = {};
    for (const tid of Object.keys(commit)) {
      deployments[tid] = {};
      for (const k of Object.keys(commit[tid]!)) deployments[tid]![Number(k)] = commit[tid]![Number(k)]!.reduce((a, b) => a + b, 0);
    }
    resolveRound(game, deployments);
    scoreRound(game);
  }
  if (useObjectives) scoreObjectives(game);

  // winner index
  let b = 0;
  for (let i = 1; i < N; i++) if (game.players[i]!.vp > game.players[b]!.vp) b = i;
  return b;
}

// ── win-rate table across all valid combos at a player count ──
function winRates(N: number, useObjectives: boolean): Record<FactionId, number> {
  const wins: Record<string, number> = {};
  const plays: Record<string, number> = {};
  for (const combo of validCombos(N)) {
    for (let g = 0; g < GAMES_PER_COMBO; g++) {
      const seed = `diag-${N}-${combo.join('')}-${g}`; // SAME across variants
      const w = runGame(combo, seed, useObjectives);
      wins[combo[w]!] = (wins[combo[w]!] ?? 0) + 1;
      for (const f of combo) plays[f] = (plays[f] ?? 0) + 1;
    }
  }
  const out = {} as Record<FactionId, number>;
  for (const fid of RING) out[fid] = plays[fid] ? Math.round(((wins[fid] ?? 0) / plays[fid]!) * 100) : 0;
  return out;
}

function spread(wr: Record<FactionId, number>, N: number): string {
  const vals = RING.map((f) => wr[f]);
  const fair = Math.round(100 / N);
  const dev = Math.max(...vals.map((v) => Math.abs(v - fair)));
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - fair) ** 2, 0) / vals.length);
  return `maxDev ${dev}  stdev ${sd.toFixed(1)}  (fair ${fair}%)`;
}

function printRow(label: string, wr: Record<FactionId, number>, N: number) {
  const cells = RING.map((f) => `${FACTIONS[f].name.slice(0, 4)} ${String(wr[f]).padStart(2)}`).join(' · ');
  console.log(`  ${label.padEnd(22)} ${cells}   [${spread(wr, N)}]`);
}

// ── pool override helpers (FACTIONS.pool is data; safe to swap in a script) ──
const ORIGINAL_POOLS: Record<FactionId, readonly UnitRange[]> = {} as never;
for (const f of RING) (ORIGINAL_POOLS as never as Record<FactionId, readonly UnitRange[]>)[f] = FACTIONS[f].pool;
function setAllPools(ranges: UnitRange[]) { for (const f of RING) (FACTIONS[f] as { pool: readonly UnitRange[] }).pool = ranges.slice(); }
function restorePools() { for (const f of RING) (FACTIONS[f] as { pool: readonly UnitRange[] }).pool = ORIGINAL_POOLS[f]; }

console.log('\n══ v2 balance diagnosis — isolating the imbalance driver ══');
console.log(`   ${GAMES_PER_COMBO} games/combo · common random seeds across variants\n`);

for (const N of [2, 3, 4]) {
  console.log(`\n─── ${N} players ───`);

  // A. BASELINE — everything as shipped.
  setAbilitiesEnabled(true); restorePools();
  printRow('A. baseline', winRates(N, true), N);

  // B. NO ABILITIES — pools + board + objectives only.
  setAbilitiesEnabled(false); restorePools();
  printRow('B. abilities OFF', winRates(N, true), N);

  // C. IDENTICAL POOLS — every faction fields the same 5 dice (abilities back on).
  //    Isolates board spoil-geography + abilities (pool shape neutralised).
  setAbilitiesEnabled(true); setAllPools(['3-6', '2-5', '2-5', '1-3', '1-3']);
  printRow('C. identical pools', winRates(N, true), N);

  // D. IDENTICAL POOLS + NO ABILITIES — only board geography + objectives remain.
  setAbilitiesEnabled(false); setAllPools(['3-6', '2-5', '2-5', '1-3', '1-3']);
  printRow('D. ident pool, abil OFF', winRates(N, true), N);

  // E. D minus objectives — PURE board spoil-geography + position.
  setAbilitiesEnabled(false); setAllPools(['3-6', '2-5', '2-5', '1-3', '1-3']);
  printRow('E. + objectives OFF', winRates(N, false), N);

  setAbilitiesEnabled(true); restorePools();
}

console.log('\nReading: if a row FLATTENS (low maxDev), the driver it removed mattered.');
console.log('If E is still skewed, the board/seating geometry itself is asymmetric.\n');
