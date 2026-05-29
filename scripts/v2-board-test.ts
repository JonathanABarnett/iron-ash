// ─── v2 validation — asymmetric factions + spoils ────────────────────────────
// THE THESIS: do factions fan out to their own spoils & clash with rivals on
// shared ones, while staying balanced and tight (45–90 min)?
//
// Run:  npx tsx scripts/v2-board-test.ts

import {
  createGameV2, rollHand, resolveRound, scoreRound, ROUNDS,
  type Deployments,
} from '../src/v2/game';
import { pickOneDie, type CommittedSums } from '../src/v2/ai';
import { scoreObjectives, objectiveById } from '../src/v2/objectives';
import {
  FACTIONS, RING, valueOf, validCombos, opposite, ringArc,
  type FactionId,
} from '../src/v2/factions';
import { Rng } from '../src/engine/rng';

function hr(label: string) {
  console.log('\n' + '─'.repeat(74));
  console.log('  ' + label);
  console.log('─'.repeat(74));
}

// ─── 1. Faction web sanity ────────────────────────────────────────────────────

hr('1. RIVALRY RING (each faction: primary + 2 secondaries; opposite shares none)');
console.log();
for (const fid of RING) {
  const f = FACTIONS[fid];
  console.log(`  ${f.name.padEnd(13)} want ${f.primary.padEnd(8)} + ${f.secondary.join(', ').padEnd(14)}  · opposite: ${FACTIONS[opposite(fid)].name}`);
}
console.log('\n  every spoil is wanted by exactly 3 factions (1 primary + 2 secondary):');
const wanters: Record<string, string[]> = {};
for (const fid of RING) {
  const f = FACTIONS[fid];
  for (const s of [f.primary, ...f.secondary]) (wanters[s] ??= []).push(f.name.slice(0, 4));
}
for (const [s, ws] of Object.entries(wanters)) console.log(`    ${s.padEnd(8)} ← ${ws.join(', ')}`);

interface GameResult {
  decisions: number; contested: number; changes: number;
  players: { faction: FactionId; visible: number; final: number; objVp: number;
             heldVals: number[]; heldPrimary: number; heldCount: number }[];
}

// Sum the live per-player commitments into the CommittedSums pickOneDie reads.
function toSums(commit: Record<string, Record<number, number[]>>): CommittedSums {
  const out: CommittedSums = {};
  for (const tid of Object.keys(commit)) {
    out[tid] = {};
    for (const k of Object.keys(commit[tid]!)) {
      const pid = Number(k);
      out[tid]![pid] = commit[tid]![pid]!.reduce((a, b) => a + b, 0);
    }
  }
  return out;
}

// Play ONE round in place: roll hands, sequential turn-by-turn deploy (start
// player rotates each round), resolve + score. Shared by runGame and the
// sample-game section so both exercise the real model.
function playRound(game: ReturnType<typeof createGameV2>, rng: Rng, round: number): {
  decisions: number; contested: number; changes: number;
} {
  game.round = round;
  const N = game.players.length;
  let decisions = 0;

  const remaining: number[][] = [];
  for (let p = 0; p < N; p++) {
    const hand = rollHand(game, p, rng);
    decisions += hand.length;
    remaining[p] = hand.map((d) => d.value);
  }

  const commit: Record<string, Record<number, number[]>> = {};
  const passed = new Set<number>();
  let turn = (round - 1) % N;
  let safety = 1000;
  while (safety-- > 0) {
    const allDone = Array.from({ length: N }, (_, p) => p).every(
      (p) => passed.has(p) || remaining[p]!.length === 0,
    );
    if (allDone) break;

    const p = turn;
    if (!passed.has(p) && remaining[p]!.length > 0) {
      const choice = pickOneDie(game, p, remaining[p]!, toSums(commit));
      if (choice) {
        ((commit[choice.tid] ??= {})[p] ??= []).push(choice.dieValue);
        const idx = remaining[p]!.indexOf(choice.dieValue);
        if (idx >= 0) remaining[p]!.splice(idx, 1);
      } else {
        passed.add(p);
      }
    } else {
      passed.add(p);
    }
    let nxt = -1;
    for (let s = 1; s <= N; s++) {
      const q = (p + s) % N;
      if (!passed.has(q) && remaining[q]!.length > 0) { nxt = q; break; }
    }
    if (nxt === -1) break;
    turn = nxt;
  }

  const deployments: Deployments = {};
  for (const tid of Object.keys(commit)) {
    deployments[tid] = {};
    for (const k of Object.keys(commit[tid]!)) {
      const pid = Number(k);
      deployments[tid]![pid] = commit[tid]![pid]!.reduce((a, b) => a + b, 0);
    }
  }
  const results = resolveRound(game, deployments);
  scoreRound(game);
  return {
    decisions,
    contested: results.filter((r) => r.contested).length,
    changes: results.filter((r) => r.changed).length,
  };
}

function runGame(factionIds: FactionId[], seed: string): GameResult {
  const rng = new Rng(seed);
  const game = createGameV2(factionIds, seed);
  let decisions = 0, contested = 0, changes = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    const m = playRound(game, rng, round);
    decisions += m.decisions; contested += m.contested; changes += m.changes;
  }
  const visible = game.players.map((p) => p.vp);
  scoreObjectives(game);

  const players = game.players.map((p, i) => {
    const heldVals: number[] = [];
    let heldPrimary = 0;
    for (const [tid, o] of Object.entries(game.owner)) {
      if (o !== i) continue;
      const terr = game.board.territories[tid]!;
      if (terr.role === 'center') continue;
      heldVals.push(valueOf(FACTIONS[p.faction], terr.spoil));
      if (terr.spoil === FACTIONS[p.faction].primary) heldPrimary++;
    }
    return { faction: p.faction, visible: visible[i]!, final: p.vp, objVp: p.objectiveVp,
             heldVals, heldPrimary, heldCount: heldVals.length };
  });
  return { decisions, contested, changes, players };
}

function argmax(xs: number[]): number { let b = 0; for (let i = 1; i < xs.length; i++) if (xs[i]! > xs[b]!) b = i; return b; }

// ─── 2. Fan-out thesis ────────────────────────────────────────────────────────

hr('2. FAN-OUT — do factions hold tiles VALUED BY THEM? (avg held-tile value, 1.0 = random)');
{
  const valByFaction: Record<string, { sum: number; n: number; prim: number; held: number }> = {};
  for (const combo of validCombos(3)) {
    for (let g = 0; g < 120; g++) {
      const r = runGame(combo, `fan-${combo.join('')}-${g}`);
      for (const pl of r.players) {
        const e = (valByFaction[pl.faction] ??= { sum: 0, n: 0, prim: 0, held: 0 });
        e.sum += pl.heldVals.reduce((a, b) => a + b, 0);
        e.n += pl.heldVals.length;
        e.prim += pl.heldPrimary;
        e.held += pl.heldCount;
      }
    }
  }
  console.log();
  for (const fid of RING) {
    const e = valByFaction[fid]!;
    const avg = (e.sum / e.n).toFixed(2);
    const primPct = Math.round((e.prim / e.held) * 100);
    console.log(`  ${FACTIONS[fid].name.padEnd(13)} avg held-tile value ${avg}   · ${primPct}% of held tiles are their PRIMARY spoil`);
  }
  console.log('\n  (>1.0 means factions are successfully steering to their own spoils, not grabbing at random)');
}

// ─── 3. Balance across faction combos ─────────────────────────────────────────

hr('3. BALANCE — win rate per faction (across all valid combos, with hidden VP)');
for (const N of [2, 3]) {
  const wins: Record<string, number> = {};
  const plays: Record<string, number> = {};
  let games = 0;
  for (const combo of validCombos(N)) {
    for (let g = 0; g < 200; g++) {
      const r = runGame(combo, `bal-${N}-${combo.join('')}-${g}`);
      const w = r.players[argmax(r.players.map((p) => p.final))]!.faction;
      wins[w] = (wins[w] ?? 0) + 1;
      for (const pl of r.players) plays[pl.faction] = (plays[pl.faction] ?? 0) + 1;
      games++;
    }
  }
  console.log(`\n  ${N}p (${games} games over ${validCombos(N).length} combos) — win rate when present:`);
  for (const fid of RING) {
    const wr = plays[fid] ? Math.round(((wins[fid] ?? 0) / plays[fid]!) * 100) : 0;
    const bar = '█'.repeat(Math.round(wr / 3));
    console.log(`    ${FACTIONS[fid].name.padEnd(13)} ${String(wr).padStart(3)}%  ${bar}`);
  }
  console.log(`    (fair = ~${Math.round(100 / N)}%)`);
}

// ─── 4. Tightness & competitiveness ───────────────────────────────────────────

hr('4. TIGHTNESS & COMPETITIVENESS');
const SEC = 0.6;
for (const N of [2, 3, 4]) {
  const combo = ringArc(0, N);
  let dec = 0, con = 0, chg = 0, swings = 0, runaway = 0;
  const GAMES = 400;
  for (let g = 0; g < GAMES; g++) {
    const r = runGame(combo, `tc-${N}-${g}`);
    dec += r.decisions; con += r.contested; chg += r.changes;
    if (argmax(r.players.map((p) => p.final)) !== argmax(r.players.map((p) => p.visible))) swings++;
    const fs = [...r.players.map((p) => p.final)].sort((a, b) => b - a);
    if ((fs[1]! > 0 && fs[0]! > fs[1]! * 1.5) || (fs[1]! === 0 && fs[0]! > 0)) runaway++;
  }
  console.log(`\n  ${N}p (${combo.map((f) => FACTIONS[f].name.slice(0, 4)).join('/')}):`);
  console.log(`    ~${Math.round((dec / GAMES) * SEC / 60)} min · ${(con / GAMES).toFixed(1)} contested/game · ${(chg / GAMES).toFixed(1)} changes/game`);
  console.log(`    hidden VP flips winner ${Math.round((swings / GAMES) * 100)}% · runaways ${Math.round((runaway / GAMES) * 100)}%`);
}

// ─── 5. Sample 2p arc ──────────────────────────────────────────────────────────

hr('5. SAMPLE 2P GAME — Warriors vs Merchants (strong rivals: Iron & Gold)');
{
  const combo: FactionId[] = ['warriors', 'merchants'];
  const rng = new Rng('arc-wm');
  const game = createGameV2(combo, 'arc-wm');
  console.log();
  for (let round = 1; round <= ROUNDS; round++) {
    playRound(game, rng, round);
    const held = (p: number) => Object.entries(game.owner).filter(([, o]) => o === p).map(([tid]) => game.board.territories[tid]!.spoil);
    const centre = game.owner[game.board.centerId];
    console.log(`  R${round}: VP ${game.players.map((p) => p.vp).join(' – ')} · centre ${centre === undefined ? '—' : 'P' + (centre + 1)} · P1 holds [${held(0).join(',')}] · P2 holds [${held(1).join(',')}]`);
  }
  const vis = argmax(game.players.map((p) => p.vp));
  scoreObjectives(game);
  console.log('\n  Hidden objectives:');
  for (const p of game.players) console.log(`    P${p.id + 1} (${FACTIONS[p.faction].name}): "${objectiveById(p.objectiveId)?.name}" → +${p.objectiveVp}`);
  const w = argmax(game.players.map((p) => p.vp));
  console.log(`\n  FINAL: ${game.players.map((p) => `P${p.id + 1} ${p.vp}`).join('  ·  ')} → winner P${w + 1}${w !== vis ? ' (hidden VP flipped it!)' : ''}`);
}

console.log('\n' + '─'.repeat(74));
console.log('  v2 asymmetric-faction validation complete.\n');
