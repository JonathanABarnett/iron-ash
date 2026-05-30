// ─── v2 board-value diagnostic — WHERE does the board asymmetry live? ────────
//
// scripts/v2-diagnose.ts proved the dominant imbalance is board spoil-geometry:
// even with IDENTICAL pools, no abilities, no objectives, win rates spread wildly
// at 2p (Rangers ~76 / Merchants ~19). This pins down WHY — for each faction it
// breaks earned VP down by tile ROLE (home / choke / border / center) and shows
// how often each role is held. If one faction simply can't convert the centre,
// or its borders are worthless to it, the fix is a BOARD change (spoil web /
// terrain), not a pool tweak.
//
// All factions field the SAME pool here (pool shape neutralised) so any
// difference is purely positional.
//
// Run:  npx tsx scripts/v2-board-value.ts

import {
  createGameV2, rollHand, resolveRound, scoreRound, ROUNDS, setAbilitiesEnabled,
  type Deployments,
} from '../src/v2/game';
import { pickOneDie, type CommittedSums } from '../src/v2/ai';
import { FACTIONS, RING, valueOf, validCombos, type FactionId } from '../src/v2/factions';
import type { UnitRange } from '../src/v2/units';
import type { TerritoryRole } from '../src/v2/board';
import { Rng } from '../src/engine/rng';

const GAMES_PER_COMBO = 300;
const IDENTICAL: UnitRange[] = ['3-6', '2-5', '2-5', '1-3', '1-3'];

setAbilitiesEnabled(false);
for (const f of RING) (FACTIONS[f] as { pool: readonly UnitRange[] }).pool = IDENTICAL.slice();

function toSums(commit: Record<string, Record<number, number[]>>): CommittedSums {
  const out: CommittedSums = {};
  for (const tid of Object.keys(commit)) { out[tid] = {}; for (const k of Object.keys(commit[tid]!)) out[tid]![Number(k)] = commit[tid]![Number(k)]!.reduce((a, b) => a + b, 0); }
  return out;
}

interface Acc { vpByRole: Record<TerritoryRole, number>; heldByRole: Record<TerritoryRole, number>; finalVp: number; games: number; }
const ROLES: TerritoryRole[] = ['home', 'choke', 'border', 'center'];
const blank = (): Acc => ({ vpByRole: { home: 0, choke: 0, border: 0, center: 0 }, heldByRole: { home: 0, choke: 0, border: 0, center: 0 }, finalVp: 0, games: 0 });
const acc: Record<FactionId, Acc> = {} as Record<FactionId, Acc>;
for (const f of RING) acc[f] = blank();

function runGame(factionIds: FactionId[], seed: string) {
  const rng = new Rng(seed);
  const game = createGameV2(factionIds, seed);
  const N = game.players.length;
  // per-game, per-player VP-by-role + held-by-role (recomputed each round at scoring)
  const vpRole = factionIds.map(() => ({ home: 0, choke: 0, border: 0, center: 0 } as Record<TerritoryRole, number>));
  const heldRole = factionIds.map(() => ({ home: 0, choke: 0, border: 0, center: 0 } as Record<TerritoryRole, number>));

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
    // attribute this round's holdings (scoreRound already added to player.vp; we
    // mirror the per-role split using the same valuation it used, pre-depletion
    // is fine for a coarse picture).
    for (const [tid, o] of Object.entries(game.owner)) {
      const terr = game.board.territories[tid]!;
      vpRole[o]![terr.role] += valueOf(FACTIONS[factionIds[o]!], terr.spoil);
      heldRole[o]![terr.role] += 1;
    }
  }
  for (let p = 0; p < N; p++) {
    const a = acc[factionIds[p]!]!;
    for (const r of ROLES) { a.vpByRole[r] += vpRole[p]![r]; a.heldByRole[r] += heldRole[p]![r]; }
    a.finalVp += game.players[p]!.vp; a.games += 1;
  }
}

for (const N of [2]) for (const combo of validCombos(N)) for (let g = 0; g < GAMES_PER_COMBO; g++) runGame(combo, `bv-${N}-${combo.join('')}-${g}`);

console.log('\n══ board-value diagnostic — 2p, identical pools, no abilities/objectives ══');
console.log('   avg VP earned per game, split by tile role · (held = avg tile-rounds held)\n');
console.log('   faction        finalVP   home          choke         border        center');
for (const f of RING) {
  const a = acc[f]!; const g = a.games;
  const cell = (r: TerritoryRole) => `${(a.vpByRole[r] / g).toFixed(1).padStart(4)} (${(a.heldByRole[r] / g).toFixed(1)})`;
  console.log(`   ${FACTIONS[f].name.padEnd(13)} ${(a.finalVp / g).toFixed(1).padStart(5)}    ${cell('home').padEnd(13)} ${cell('choke').padEnd(13)} ${cell('border').padEnd(13)} ${cell('center')}`);
}
console.log('\n   Read: a faction trailing in finalVP — is it losing CENTER, or earning less');
console.log('   from BORDERS (its shared spoils sit on low-value ground)? That points the fix.\n');
