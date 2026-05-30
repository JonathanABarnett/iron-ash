// ─── v2 board-geometry tuner — balance via POSITION, not power ───────────────
//
// The diagnosis (v2-diagnose / v2-board-value) showed the dominant imbalance is
// board spoil-geometry: a faction whose core ground (home/choke) carries spoils
// its neighbours value MORE than it does keeps losing that ground. Pools can't
// fix it cleanly — one pool serves all player counts, but the board bias is
// count-dependent (Paladins dominate 2p, fine at 4p).
//
// LEVER: per-faction positional STURDINESS, tuned PER PLAYER COUNT. Each
// faction's home + choke gets a defense delta in [-3,+3]; board-disadvantaged
// factions get sturdier ground, over-strong ones softer. Pools, abilities and
// the spoil web are untouched — pure IDENTITY. This is the count-aware knob
// pools lacked, and it's how asymmetric games (Scythe/Root) balance position.
//
// The game is the FULL shipped game (abilities on, real pools, objectives on),
// so this compensates the TOTAL imbalance, leaving everything else as identity.
//
// Run via:  TUNE_SRC=scripts/v2-tune-board.ts bash scripts/v2-tune.sh 240 15 80 400 1

import {
  createGameV2, rollHand, resolveRound, scoreRound, ROUNDS, setAbilitiesEnabled,
  type Deployments,
} from '../src/v2/game';
import { setFactionDefenseAdj } from '../src/v2/board';
import { pickOneDie, type CommittedSums } from '../src/v2/ai';
import { scoreObjectives } from '../src/v2/objectives';
import { FACTIONS, RING, validCombos, type FactionId } from '../src/v2/factions';
import { Rng } from '../src/engine/rng';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// ── CLI (shared protocol with v2-tune.ts) ──
const arg = (k: string, d: number) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? Number(m.split('=')[1]) : d; };
const strArg = (k: string, d: string) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=').slice(1).join('=') : d; };
const flag = (k: string) => process.argv.includes(`--${k}`);
const GAMES = arg('games', 80);
const ITERS = arg('iters', 240);
const TOTAL = arg('total', ITERS);
const START = arg('start', 0);
const VALIDATE_GAMES = arg('validate', 400);
const SEEDV = arg('seed', 1);
const RESUME = strArg('resume', '');
const REPORT = flag('report');
// Game-seed namespace. The search/validation use 'tuneb'; pass --ns=holdout to
// re-validate found adjustments on a DISJOINT seed set (overfit check).
const SEED_NS = strArg('ns', 'tuneb');

const COUNTS = [2, 3, 4] as const;
const COUNT_WEIGHT: Record<number, number> = { 2: 1.6, 3: 1.0, 4: 0.7 };
const ADJ_MIN = -3, ADJ_MAX = 3;

// per-count, per-faction defense delta. {} entries = 0 (shipped board).
type Adj = Record<number, Partial<Record<FactionId, number>>>;
const zeroAdj = (): Adj => ({ 2: {}, 3: {}, 4: {} });

// ── search RNG (Date.now banned); seed includes START so chunks diverge ──
const search = new Rng(`v2-tuneboard-${SEEDV}-${START}`);
const randInt = (n: number) => Math.floor(search.next() * n);
const choice = <T,>(xs: readonly T[]): T => xs[randInt(xs.length)]!;

// ── one game → winner index (FULL real game; defense adj set globally per count) ──
function toSums(commit: Record<string, Record<number, number[]>>): CommittedSums {
  const out: CommittedSums = {};
  for (const tid of Object.keys(commit)) { out[tid] = {}; for (const k of Object.keys(commit[tid]!)) out[tid]![Number(k)] = commit[tid]![Number(k)]!.reduce((a, b) => a + b, 0); }
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
    let turn = (round - 1) % N; let safety = 1000;
    while (safety-- > 0) {
      if (Array.from({ length: N }, (_, p) => p).every((p) => passed.has(p) || remaining[p]!.length === 0)) break;
      const p = turn;
      if (!passed.has(p) && remaining[p]!.length > 0) {
        const ch = pickOneDie(game, p, remaining[p]!, toSums(commit));
        if (ch) { ((commit[ch.tid] ??= {})[p] ??= []).push(ch.dieValue); const i = remaining[p]!.indexOf(ch.dieValue); if (i >= 0) remaining[p]!.splice(i, 1); }
        else passed.add(p);
      } else passed.add(p);
      let nxt = -1; for (let s = 1; s <= N; s++) { const q = (p + s) % N; if (!passed.has(q) && remaining[q]!.length > 0) { nxt = q; break; } }
      if (nxt === -1) break; turn = nxt;
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

function winRates(N: number, games: number, adjForN: Partial<Record<FactionId, number>>): Record<FactionId, number> {
  setFactionDefenseAdj(adjForN);
  const wins: Record<string, number> = {}, plays: Record<string, number> = {};
  for (const combo of validCombos(N)) {
    for (let g = 0; g < games; g++) {
      const w = runGame(combo, `${SEED_NS}-${N}-${combo.join('')}-${g}`);
      wins[combo[w]!] = (wins[combo[w]!] ?? 0) + 1;
      for (const f of combo) plays[f] = (plays[f] ?? 0) + 1;
    }
  }
  setFactionDefenseAdj({});
  const out = {} as Record<FactionId, number>;
  for (const f of RING) out[f] = plays[f] ? ((wins[f] ?? 0) / plays[f]!) * 100 : 0;
  return out;
}

// cost = imbalance + tiny penalty per point of |defense adj| (minimal intervention)
const REG_ADJ = 0.7;
function cost(adj: Adj, games: number): { total: number; bal: number; reg: number; byCount: Record<number, Record<FactionId, number>> } {
  let bal = 0, reg = 0;
  const byCount: Record<number, Record<FactionId, number>> = {};
  for (const N of COUNTS) {
    const wr = winRates(N, games, adj[N] ?? {});
    byCount[N] = wr;
    const fair = 100 / N;
    let sse = 0; for (const f of RING) sse += (wr[f] - fair) ** 2;
    bal += COUNT_WEIGHT[N]! * sse;
    for (const f of RING) reg += REG_ADJ * Math.abs(adj[N]?.[f] ?? 0);
  }
  return { total: bal + reg, bal, reg, byCount };
}

// mutate: nudge one (count, faction) defense delta by ±1 within [ADJ_MIN, ADJ_MAX]
function mutate(adj: Adj): Adj {
  const next: Adj = { 2: { ...adj[2] }, 3: { ...adj[3] }, 4: { ...adj[4] } };
  const N = choice(COUNTS);
  const f = choice(RING);
  const cur = next[N]![f] ?? 0;
  const step = search.next() < 0.5 ? -1 : 1;
  const v = Math.max(ADJ_MIN, Math.min(ADJ_MAX, cur + step));
  if (v === 0) delete next[N]![f]; else next[N]![f] = v;
  return next;
}

// ── printing ──
function table(byCount: Record<number, Record<FactionId, number>>) {
  for (const N of COUNTS) {
    const wr = byCount[N]!; const fair = 100 / N;
    const dev = Math.max(...RING.map((f) => Math.abs(wr[f] - fair)));
    const sd = Math.sqrt(RING.reduce((a, f) => a + (wr[f] - fair) ** 2, 0) / 6);
    const cells = RING.map((f) => `${FACTIONS[f].name.slice(0, 4)} ${String(Math.round(wr[f])).padStart(2)}`).join(' · ');
    console.log(`    ${N}p  ${cells}   [maxDev ${Math.round(dev)} · stdev ${sd.toFixed(1)}]`);
  }
}
function printAdj(adj: Adj) {
  console.log('\n── tuned per-faction defense adjustments (home + choke), by player count ──\n');
  console.log(`    ${'faction'.padEnd(13)} 2p   3p   4p`);
  for (const f of RING) {
    const c = (N: number) => { const v = adj[N]?.[f] ?? 0; return (v > 0 ? `+${v}` : `${v}`).padStart(3); };
    const any = [2, 3, 4].some((N) => (adj[N]?.[f] ?? 0) !== 0);
    console.log(`    ${FACTIONS[f].name.padEnd(13)} ${c(2)}  ${c(3)}  ${c(4)}${any ? '' : '   (unchanged)'}`);
  }
  console.log('\n  apply via setFactionDefenseAdj(...) per count, or bake into board.ts terrain.');
  console.log();
}

// ════════════════════════════════════════════════════════════════════════════
setAbilitiesEnabled(true);
interface SavedState { cur: Adj; best: Adj; curCost: number; bestCost: number; accepts: number; }
const T0 = 60, TEnd = 1.5;

if (RESUME && REPORT) {
  const st = JSON.parse(readFileSync(RESUME, 'utf8')) as SavedState;
  const before = cost(zeroAdj(), VALIDATE_GAMES);
  console.log('\nBEFORE (shipped board):');
  table(before.byCount);
  console.log(`  cost ${before.total.toFixed(0)}  (imbalance ${before.bal.toFixed(0)} + intervention ${before.reg.toFixed(0)})`);
  const finalC = cost(st.best, VALIDATE_GAMES);
  console.log('\nAFTER (tuned board defense):');
  table(finalC.byCount);
  console.log(`  cost ${finalC.total.toFixed(0)}  (imbalance ${finalC.bal.toFixed(0)} + intervention ${finalC.reg.toFixed(0)})`);
  printAdj(st.best);
  process.exit(0);
}

let cur: Adj = zeroAdj();
let best: Adj;
let curC: { total: number };
let bestC: { total: number };
let accepts = 0;

if (RESUME && existsSync(RESUME) && START > 0) {
  const st = JSON.parse(readFileSync(RESUME, 'utf8')) as SavedState;
  cur = st.cur; best = st.best; curC = { total: st.curCost }; bestC = { total: st.bestCost }; accepts = st.accepts;
  console.log(`▸ resume @it${START}/${TOTAL} · cur ${curC.total.toFixed(0)} · best ${bestC.total.toFixed(0)}`);
} else {
  const c0 = cost(cur, GAMES);
  curC = c0; best = cur; bestC = c0;
  console.log(`\n══ v2 BOARD tuner ══  games/combo ${GAMES} · total iters ${TOTAL} · seed ${SEEDV}`);
  console.log('BEFORE (shipped board):');
  table(c0.byCount);
  console.log(`  cost ${c0.total.toFixed(0)}  (imbalance ${c0.bal.toFixed(0)} + intervention ${c0.reg.toFixed(0)})\n`);
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
      const snap = COUNTS.map((N) => `${N}p{${RING.filter((f) => best[N]?.[f]).map((f) => `${f.slice(0, 2)}${best[N]![f]! > 0 ? '+' : ''}${best[N]![f]}`).join(',')}}`).join(' ');
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
console.log('\nAFTER (tuned board defense):');
table(finalC.byCount);
console.log(`  cost ${finalC.total.toFixed(0)}  (imbalance ${finalC.bal.toFixed(0)} + intervention ${finalC.reg.toFixed(0)})`);
printAdj(best);
