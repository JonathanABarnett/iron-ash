// ─── v2 balance AUTO-TUNER — simulated annealing over faction pools ──────────
//
// WHY: hand-tuning 6 factions × 3 player counts never converged. The diagnosis
// (scripts/v2-diagnose.ts) showed the imbalance is driven mostly by BOARD spoil-
// geometry, then pool composition — and the board-value pass showed gross VP is
// even while win-rate spread is huge, so it's a POSITIONAL / head-to-head margin
// problem, not a gross-power one. The shipped pools are power-NORMALISED (every
// faction ~equal strength); on an asymmetric board that's backwards. This tunes
// pools to be power-ASYMMETRIC — compensating each faction's board luck.
//
// IDENTITY IS LOCKED BY CONSTRUCTION. Each faction has a fixed CHARACTER:
//   • locked dice that define it (Warriors keep 2 Elites, Mages keep 2 Champions,
//     Necromancers keep 1 Elite anchor),
//   • a tunable swarm of "free" support dice drawn from an allowed tier set
//     (Paladins/Merchants/Rangers may only field light troops — no Elites/Champs).
// The tuner only moves POWER WITHIN character (support tier ratios + swarm size),
// so it can never homogenise the roster into elite/champion squads — it just
// makes a board-weak faction's troops a notch stronger and a board-strong one's
// a notch weaker. State = the free dice only; the full pool = locked + free.
//
// Common random numbers: every evaluation replays the SAME seed set.
//
// Single-process:  node --no-opt <bundle> --games=80 --iters=240 --validate=600
// Chunked (robust against the V8 codegen heisenbug): see scripts/v2-tune.sh

import {
  createGameV2, rollHand, resolveRound, scoreRound, ROUNDS, setAbilitiesEnabled,
  type Deployments,
} from '../src/v2/game';
import { pickOneDie, type CommittedSums } from '../src/v2/ai';
import { scoreObjectives } from '../src/v2/objectives';
import { FACTIONS, RING, validCombos, type FactionId } from '../src/v2/factions';
import { UNIT_PROFILE, type UnitRange } from '../src/v2/units';
import { Rng } from '../src/engine/rng';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// ── CLI ──
const arg = (k: string, d: number) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? Number(m.split('=')[1]) : d;
};
const strArg = (k: string, d: string) => {
  const m = process.argv.find((a) => a.startsWith(`--${k}=`));
  return m ? m.split('=').slice(1).join('=') : d;
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const GAMES = arg('games', 100);
const ITERS = arg('iters', 500);     // iterations THIS run/chunk
const TOTAL = arg('total', ITERS);   // total across all chunks (drives cooling)
const START = arg('start', 0);       // global iteration this chunk begins at
const VALIDATE_GAMES = arg('validate', 400);
const SEEDV = arg('seed', 1);
const RESUME = strArg('resume', '');
const REPORT = flag('report');

const COUNTS = [2, 3, 4] as const;
const COUNT_WEIGHT: Record<number, number> = { 2: 1.6, 3: 1.0, 4: 0.7 }; // 2p hurts most

type Pools = Record<FactionId, UnitRange[]>;
type Free = Record<FactionId, UnitRange[]>; // tunable support dice only

const power = (p: UnitRange[]) => p.reduce((a, r) => a + UNIT_PROFILE[r].avg, 0);
const ORIGINAL: Pools = {} as Pools;
for (const f of RING) ORIGINAL[f] = FACTIONS[f].pool.slice();

// ── CHARACTER — locked identity + a tunable light-support swarm ──
// locked: dice that DEFINE the faction (never touched). free count band + the
// tiers the free dice may take. This guarantees, e.g., Paladins can never grow
// an Elite, Warriors always keep their two Elites, Mages always their two Champs.
const CHAR: Record<FactionId, { locked: UnitRange[]; min: number; max: number; tiers: UnitRange[] }> = {
  warriors:     { locked: ['3-6', '3-6'], min: 3, max: 3, tiers: ['1-3', '2-5'] },        // 2 Elites + 3 support
  merchants:    { locked: [],             min: 6, max: 7, tiers: ['1-3', '2-5'] },        // broad light swarm
  rangers:      { locked: [],             min: 5, max: 7, tiers: ['1-3', '2-5'] },        // light skirmisher swarm
  necromancers: { locked: ['3-6'],        min: 3, max: 4, tiers: ['1-3', '2-5'] },        // Elite anchor + support
  mages:        { locked: ['1-6', '1-6'], min: 3, max: 3, tiers: ['1-3', '2-5', '3-6'] }, // 2 Champions + support
  paladins:     { locked: [],             min: 4, max: 6, tiers: ['1-3', '2-5'] },         // reliable soldier line
};

// full pool = locked + free
const reconstruct = (free: Free): Pools => {
  const out = {} as Pools;
  for (const f of RING) out[f] = [...CHAR[f].locked, ...free[f]];
  return out;
};
// strip the locked dice off a full pool to get its free portion (originals are valid by construction)
function freeOf(full: UnitRange[], locked: UnitRange[]): UnitRange[] {
  const rest = full.slice();
  for (const l of locked) { const i = rest.indexOf(l); if (i >= 0) rest.splice(i, 1); }
  return rest;
}
const ORIGINAL_FREE: Free = {} as Free;
for (const f of RING) ORIGINAL_FREE[f] = freeOf(ORIGINAL[f], CHAR[f].locked);

// ── deterministic search RNG (Date.now is banned). Seed includes START so each
//    chunk explores a fresh stream. ──
const search = new Rng(`v2-tune-search-${SEEDV}-${START}`);
const randInt = (n: number) => Math.floor(search.next() * n);
const choice = <T,>(xs: readonly T[]): T => xs[randInt(xs.length)]!;

// ── apply a candidate (free dice) to the live FACTIONS table ──
function applyFree(free: Free) {
  const full = reconstruct(free);
  for (const f of RING) (FACTIONS[f] as { pool: readonly UnitRange[] }).pool = full[f];
}

// ── one game → winner index (sequential turn-by-turn deploy, matches sandbox) ──
function toSums(commit: Record<string, Record<number, number[]>>): CommittedSums {
  const out: CommittedSums = {};
  for (const tid of Object.keys(commit)) {
    out[tid] = {};
    for (const k of Object.keys(commit[tid]!)) out[tid]![Number(k)] = commit[tid]![Number(k)]!.reduce((a, b) => a + b, 0);
  }
  return out;
}
function runGame(factionIds: FactionId[], seed: string): number {
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
        const ch = pickOneDie(game, p, remaining[p]!, toSums(commit));
        if (ch) { ((commit[ch.tid] ??= {})[p] ??= []).push(ch.dieValue); const i = remaining[p]!.indexOf(ch.dieValue); if (i >= 0) remaining[p]!.splice(i, 1); }
        else passed.add(p);
      } else passed.add(p);
      let nxt = -1;
      for (let s = 1; s <= N; s++) { const q = (p + s) % N; if (!passed.has(q) && remaining[q]!.length > 0) { nxt = q; break; } }
      if (nxt === -1) break;
      turn = nxt;
    }
    const dep: Deployments = {};
    for (const tid of Object.keys(commit)) { dep[tid] = {}; for (const k of Object.keys(commit[tid]!)) dep[tid]![Number(k)] = commit[tid]![Number(k)]!.reduce((a, b) => a + b, 0); }
    resolveRound(game, dep);
    scoreRound(game);
  }
  scoreObjectives(game);
  let b = 0; for (let i = 1; i < N; i++) if (game.players[i]!.vp > game.players[b]!.vp) b = i;
  return b;
}

function winRates(N: number, games: number): Record<FactionId, number> {
  const wins: Record<string, number> = {}, plays: Record<string, number> = {};
  for (const combo of validCombos(N)) {
    for (let g = 0; g < games; g++) {
      const w = runGame(combo, `tune-${N}-${combo.join('')}-${g}`); // fixed seed → CRN
      wins[combo[w]!] = (wins[combo[w]!] ?? 0) + 1;
      for (const f of combo) plays[f] = (plays[f] ?? 0) + 1;
    }
  }
  const out = {} as Record<FactionId, number>;
  for (const f of RING) out[f] = plays[f] ? ((wins[f] ?? 0) / plays[f]!) * 100 : 0;
  return out;
}

// ── cost = imbalance + a light power regulariser (character is hard-locked, so
//    the regulariser only nudges toward the shipped power level) ──
const REG = { size: 2, power: 1.0 };
function cost(free: Free, games: number): { total: number; bal: number; reg: number; byCount: Record<number, Record<FactionId, number>> } {
  applyFree(free);
  const full = reconstruct(free);
  let bal = 0;
  const byCount: Record<number, Record<FactionId, number>> = {};
  for (const N of COUNTS) {
    const wr = winRates(N, games);
    byCount[N] = wr;
    const fair = 100 / N;
    let sse = 0;
    for (const f of RING) sse += (wr[f] - fair) ** 2;
    bal += COUNT_WEIGHT[N]! * sse;
  }
  let reg = 0;
  for (const f of RING) {
    reg += REG.size * Math.abs(full[f].length - ORIGINAL[f].length);
    reg += REG.power * Math.abs(power(full[f]) - power(ORIGINAL[f]));
  }
  return { total: bal + reg, bal, reg, byCount };
}

// ── mutate the FREE dice only, respecting the character's tier set + size band ──
function mutate(free: Free): Free {
  const next: Free = {} as Free;
  for (const f of RING) next[f] = free[f].slice();
  const f = choice(RING);
  const c = CHAR[f];
  const p = next[f];
  const roll = search.next();
  if (roll < 0.6 && p.length > 0) {
    // retier a support die ±1 within the faction's allowed tier ladder
    const i = randInt(p.length);
    const idx = c.tiers.indexOf(p[i]!);
    const opts: UnitRange[] = [];
    if (idx > 0) opts.push(c.tiers[idx - 1]!);
    if (idx >= 0 && idx < c.tiers.length - 1) opts.push(c.tiers[idx + 1]!);
    p[i] = choice(opts.length ? opts : c.tiers);
  } else if (roll < 0.8 && p.length < c.max) {
    p.push(choice(c.tiers));        // grow the swarm
  } else if (p.length > c.min) {
    p.splice(randInt(p.length), 1); // shrink the swarm
  } else if (p.length > 0) {
    p[randInt(p.length)] = choice(c.tiers);
  }
  return next;
}

// ── printing ──
const fmtPool = (p: UnitRange[]) => {
  const order: Record<UnitRange, number> = { '3-6': 0, '1-6': 1, '2-5': 2, '1-3': 3 };
  return [...p].sort((a, b) => order[a] - order[b]).map((r) => `'${r}'`).join(', ');
};
function table(byCount: Record<number, Record<FactionId, number>>) {
  for (const N of COUNTS) {
    const wr = byCount[N]!;
    const fair = 100 / N;
    const dev = Math.max(...RING.map((f) => Math.abs(wr[f] - fair)));
    const sd = Math.sqrt(RING.reduce((a, f) => a + (wr[f] - fair) ** 2, 0) / 6);
    const cells = RING.map((f) => `${FACTIONS[f].name.slice(0, 4)} ${String(Math.round(wr[f])).padStart(2)}`).join(' · ');
    console.log(`    ${N}p  ${cells}   [maxDev ${Math.round(dev)} · stdev ${sd.toFixed(1)}]`);
  }
}
function printPools(free: Free) {
  const full = reconstruct(free);
  console.log('\n── tuned pools (paste into src/v2/factions.ts) ──\n');
  for (const f of RING) {
    const changed = fmtPool(full[f]) !== fmtPool(ORIGINAL[f]);
    console.log(`  ${FACTIONS[f].name.padEnd(13)} pool: [${fmtPool(full[f])}]${changed ? '  ← changed' : ''}`);
  }
  console.log('\n  (Δ vs shipped — size/power; champion & elite counts are LOCKED):');
  for (const f of RING) {
    const ds = full[f].length - ORIGINAL[f].length;
    const dp = power(full[f]) - power(ORIGINAL[f]);
    if (ds || Math.abs(dp) > 0.01) console.log(`    ${FACTIONS[f].name.padEnd(13)} Δsize ${ds >= 0 ? '+' : ''}${ds} · Δpower ${dp >= 0 ? '+' : ''}${dp.toFixed(1)}`);
  }
  console.log();
}

// ════════════════════════════════════════════════════════════════════════════
setAbilitiesEnabled(true);
interface SavedState { cur: Free; best: Free; curCost: number; bestCost: number; accepts: number; }
const T0 = 60, TEnd = 1.5;

// ── REPORT: validate the saved best at high game count + print pools ──
if (RESUME && REPORT) {
  const st = JSON.parse(readFileSync(RESUME, 'utf8')) as SavedState;
  const before = cost(ORIGINAL_FREE, VALIDATE_GAMES);
  console.log('\nBEFORE (shipped pools):');
  table(before.byCount);
  console.log(`  cost ${before.total.toFixed(0)}  (imbalance ${before.bal.toFixed(0)} + identity ${before.reg.toFixed(0)})`);
  const finalC = cost(st.best, VALIDATE_GAMES);
  console.log('\nAFTER (tuned pools):');
  table(finalC.byCount);
  console.log(`  cost ${finalC.total.toFixed(0)}  (imbalance ${finalC.bal.toFixed(0)} + identity ${finalC.reg.toFixed(0)})`);
  printPools(st.best);
  process.exit(0);
}

// ── CHUNK / single-process optimisation ──
let cur: Free = {} as Free;
let best: Free;
let curC: { total: number };
let bestC: { total: number };
let accepts = 0;

if (RESUME && existsSync(RESUME) && START > 0) {
  const st = JSON.parse(readFileSync(RESUME, 'utf8')) as SavedState;
  cur = st.cur; best = st.best; curC = { total: st.curCost }; bestC = { total: st.bestCost }; accepts = st.accepts;
  console.log(`▸ resume @it${START}/${TOTAL} · cur ${curC.total.toFixed(0)} · best ${bestC.total.toFixed(0)}`);
} else {
  for (const f of RING) cur[f] = ORIGINAL_FREE[f].slice();
  const c0 = cost(cur, GAMES);
  curC = c0; best = cur; bestC = c0;
  console.log(`\n══ v2 pool auto-tuner ══  games/combo ${GAMES} · total iters ${TOTAL} · seed ${SEEDV}`);
  console.log('BEFORE (shipped pools):');
  table(c0.byCount);
  console.log(`  cost ${c0.total.toFixed(0)}  (imbalance ${c0.bal.toFixed(0)} + identity ${c0.reg.toFixed(0)})\n`);
}

for (let k = 0; k < ITERS; k++) {
  const it = START + k;
  const T = T0 * Math.pow(TEnd / T0, it / TOTAL);
  const cand = mutate(cur);
  const cC = cost(cand, GAMES);
  const d = cC.total - curC.total;
  if (d < 0 || search.next() < Math.exp(-d / T)) {
    cur = cand; curC = cC; accepts++;
    if (cC.total < bestC.total) {
      best = cand; bestC = cC;
      const snap = RING.map((f) => `${f.slice(0, 4)}:[${reconstruct(best)[f].join(' ')}]`).join('  ');
      console.log(`  ✓ best ${bestC.total.toFixed(0)} @it${it}  ${snap}`);
    }
  }
}
console.log(`  …it ${START}→${START + ITERS} · cur ${curC.total.toFixed(0)} · best ${bestC.total.toFixed(0)} · acc ${Math.round((accepts / (START + ITERS)) * 100)}%`);

if (RESUME) {
  const out: SavedState = { cur, best, curCost: curC.total, bestCost: bestC.total, accepts };
  writeFileSync(RESUME, JSON.stringify(out));
  process.exit(0);
}

console.log(`\nValidating best at ${VALIDATE_GAMES} games/combo …`);
const finalC = cost(best, VALIDATE_GAMES);
console.log('\nAFTER (tuned pools):');
table(finalC.byCount);
console.log(`  cost ${finalC.total.toFixed(0)}  (imbalance ${finalC.bal.toFixed(0)} + identity ${finalC.reg.toFixed(0)})`);
printPools(best);
