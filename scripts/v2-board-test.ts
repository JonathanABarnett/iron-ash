// ─── v2 lean-model validation ────────────────────────────────────────────────
// Renewable dice + single-comparison contests + 6 rounds. Confirms the model
// is (a) conflict-rich, (b) TIGHT enough for 45–90 min, (c) competitive.
//
// Run:  npx tsx scripts/v2-board-test.ts

import { generateBoard, territoryList, graphDistance } from '../src/v2/board';
import {
  createGameV2, reachable, rollHand, resolveRound, scoreRound, ROUNDS,
  type GameV2, type Deployments,
} from '../src/v2/game';
import { scoreObjectives, objectiveById } from '../src/v2/objectives';
import { Rng } from '../src/engine/rng';

function hr(label: string) {
  console.log('\n' + '─'.repeat(74));
  console.log('  ' + label);
  console.log('─'.repeat(74));
}

// ─── 1. Topology ──────────────────────────────────────────────────────────────

hr('1. BOARD TOPOLOGY (3N + 1 scaling)');
for (const N of [2, 3, 4]) {
  const board = generateBoard(N, 'demo');
  const list = territoryList(board);
  const avgDegree = (list.reduce((s, t) => s + t.adjacency.length, 0) / list.length).toFixed(1);
  const homeToCenter = board.homeIds.map((h) => graphDistance(board, h, board.centerId));
  console.log(`  ${N}p → ${list.length} territories (exp ${3 * N + 1}) · avg degree ${avgDegree} · home→centre ${homeToCenter.join('/')} edges`);
}

// ─── Greedy AI: concentrate force on the most valuable reachable targets ──────

function aiPlace(game: GameV2, playerId: number, hand: { value: number }[]): Record<string, number> {
  const reach = [...reachable(game, playerId)];
  const desirability = (tid: string): number => {
    const t = game.board.territories[tid]!;
    const mine = game.owner[tid] === playerId;
    const enemyOwned = game.owner[tid] !== undefined && !mine;
    let s = 1 + t.vpPerRound * 2;
    if (t.role === 'center') s += 3;
    if (enemyOwned) s += 1;                       // taking enemy land
    if (mine && t.role !== 'home') s += 0.5;      // defend scoring land we hold
    return s;
  };
  // Don't bother deploying into our own home (it doesn't score and isn't threatened often).
  const targets = reach
    .filter((tid) => !(game.board.territories[tid]!.role === 'home' && game.owner[tid] === playerId))
    .sort((a, b) => desirability(b) - desirability(a));

  const need = (tid: string): number => {
    const t = game.board.territories[tid]!;
    const enemyOwned = game.owner[tid] !== undefined && game.owner[tid] !== playerId;
    return (enemyOwned ? t.defenseBonus : 0) + 5; // rough force to secure
  };

  const dice = [...hand].sort((a, b) => b.value - a.value);
  const placements: Record<string, number> = {};
  let ti = 0;
  for (const d of dice) {
    while (ti < targets.length && (placements[targets[ti]!] ?? 0) >= need(targets[ti]!)) ti++;
    const tid = targets[ti] ?? targets[0];
    if (!tid) break;
    placements[tid] = (placements[tid] ?? 0) + d.value;
  }
  return placements;
}

interface GameMetrics {
  decisions: number; contested: number; changes: number;
  visibleVps: number[];  // accrued VP before hidden objectives
  finalVps: number[];    // after hidden objectives added
  objectiveVps: number[];
}

function simulateGame(playerCount: number, seed: string): GameMetrics {
  const rng = new Rng(seed);
  const game = createGameV2(playerCount, seed);
  let decisions = 0, contested = 0, changes = 0;

  for (let round = 1; round <= ROUNDS; round++) {
    game.round = round;
    const deployments: Deployments = {};
    for (let p = 0; p < playerCount; p++) {
      const hand = rollHand(game, p, rng);
      decisions += hand.length; // each die placed ≈ one decision
      const placements = aiPlace(game, p, hand);
      for (const [tid, val] of Object.entries(placements)) {
        (deployments[tid] ??= {})[p] = (deployments[tid]![p] ?? 0) + val;
      }
    }
    const results = resolveRound(game, deployments);
    contested += results.filter((r) => r.contested).length;
    changes += results.filter((r) => r.changed).length;
    scoreRound(game);
  }
  const visibleVps = game.players.map((p) => p.vp);
  scoreObjectives(game); // add hidden endgame VP
  return {
    decisions, contested, changes,
    visibleVps,
    finalVps: game.players.map((p) => p.vp),
    objectiveVps: game.players.map((p) => p.objectiveVp),
  };
}

function argmax(xs: number[]): number {
  let bi = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i]! > xs[bi]!) bi = i;
  return bi;
}

// ─── 2. Tightness + conflict ──────────────────────────────────────────────────

hr('2. TIGHTNESS & CONFLICT (300 games each)');
const SEC_PER_DECISION = 45; // wall-clock per placement incl. downtime, light-game ballpark
for (const N of [2, 3, 4]) {
  let dec = 0, con = 0, chg = 0;
  const GAMES = 300;
  for (let g = 0; g < GAMES; g++) {
    const m = simulateGame(N, `tight-${N}-${g}`);
    dec += m.decisions; con += m.contested; chg += m.changes;
  }
  const avgDec = dec / GAMES;
  const mins = Math.round((avgDec * SEC_PER_DECISION) / 60);
  console.log(`\n  ${N}p:`);
  console.log(`    decisions/game:  ${avgDec.toFixed(0)}   → ~${mins} min @ ${SEC_PER_DECISION}s/decision  (target ${N === 2 ? '~45' : N === 4 ? '~90' : '~65'})`);
  console.log(`    contested terr/game: ${(con / GAMES).toFixed(1)}   control changes/game: ${(chg / GAMES).toFixed(1)}`);
}

// ─── 3. Competitiveness ────────────────────────────────────────────────────────

hr('3. COMPETITIVENESS — visible-only vs WITH hidden objectives');
for (const N of [2, 3, 4]) {
  let runawayVisible = 0, runawayFinal = 0, totalMargin = 0, swings = 0, objSum = 0;
  const GAMES = 500;
  for (let g = 0; g < GAMES; g++) {
    const m = simulateGame(N, `comp-${N}-${g}`);

    // Runaway on the VISIBLE race (the snowball we're trying to defuse).
    const vs = [...m.visibleVps].sort((a, b) => b - a);
    if ((vs[1]! > 0 && vs[0]! > vs[1]! * 1.5) || (vs[1]! === 0 && vs[0]! > 0)) runawayVisible++;

    // Runaway on the FINAL standings (after hidden VP).
    const fs = [...m.finalVps].sort((a, b) => b - a);
    if ((fs[1]! > 0 && fs[0]! > fs[1]! * 1.5) || (fs[1]! === 0 && fs[0]! > 0)) runawayFinal++;
    totalMargin += fs[0]! - fs[1]!;

    // Did hidden VP change who wins? (the comeback / tension proof)
    if (argmax(m.finalVps) !== argmax(m.visibleVps)) swings++;
    objSum += Math.max(...m.objectiveVps);
  }
  console.log(`\n  ${N}p:`);
  console.log(`    runaways — visible ${Math.round((runawayVisible / GAMES) * 100)}%  →  with hidden VP ${Math.round((runawayFinal / GAMES) * 100)}%`);
  console.log(`    hidden VP changed the winner in ${Math.round((swings / GAMES) * 100)}% of games  (avg top objective ${(objSum / GAMES).toFixed(1)} VP)`);
  console.log(`    avg final winning margin ${(totalMargin / GAMES).toFixed(1)} VP`);
}

// ─── 4. Sample game arc ────────────────────────────────────────────────────────

hr('4. SAMPLE 2P GAME ARC (does it build, and is the centre contested?)');
{
  const N = 2;
  const rng = new Rng('arc-demo');
  const game = createGameV2(N, 'arc-demo');
  console.log();
  for (let round = 1; round <= ROUNDS; round++) {
    game.round = round;
    const deployments: Deployments = {};
    for (let p = 0; p < N; p++) {
      const hand = rollHand(game, p, rng);
      const placements = aiPlace(game, p, hand);
      for (const [tid, val] of Object.entries(placements)) (deployments[tid] ??= {})[p] = val;
    }
    resolveRound(game, deployments);
    scoreRound(game);
    const centreOwner = game.owner[game.board.centerId];
    const held = (p: number) => Object.values(game.owner).filter((o) => o === p).length;
    console.log(`  R${round}:  VP ${game.players.map((p) => p.vp).join(' – ')}   ·  centre: ${centreOwner === undefined ? 'neutral' : 'P' + (centreOwner + 1)}   ·  territories ${[...Array(N)].map((_, p) => held(p)).join('/')}   ·  clock ${game.clock}`);
  }
  const visibleWinner = argmax(game.players.map((p) => p.vp));
  console.log(`\n  Visible leader after R6: P${visibleWinner + 1} (${game.players[visibleWinner]!.vp} VP)`);

  // ── Reveal hidden objectives (the endgame climax) ──
  scoreObjectives(game);
  console.log('\n  Hidden objectives revealed:');
  for (const p of game.players) {
    const obj = objectiveById(p.objectiveId);
    console.log(`    P${p.id + 1}: "${obj?.name}" — ${obj?.description}  →  +${p.objectiveVp} VP`);
  }
  const w = [...game.players].sort((a, b) => b.vp - a.vp)[0]!;
  console.log(`\n  FINAL: ${game.players.map((p) => `P${p.id + 1} ${p.vp}`).join('  ·  ')}`);
  console.log(`  Winner: P${w.id + 1} with ${w.vp} VP${w.id !== visibleWinner ? '  ← hidden VP flipped the result!' : ''}`);
}

console.log('\n' + '─'.repeat(74));
console.log('  v2 lean-model validation complete.\n');
