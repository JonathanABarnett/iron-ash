// Test the tutorial sequence end-to-end.
//
// Replays exactly what the tutorial scripts: forced dice for both players,
// the suggested user move at each 'place' step, AI auto-loop for ai-turn
// steps, and end-of-round/new-round transitions. Prints a full transcript so
// we can verify the narration in TutorialPage.tsx matches actual game state.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { produce } from 'immer';
import {
  parseCards, parseCosts, parseFactions, parseRegions,
  parseRoundGoals, parseRules, parseSecretGoals, parseStructures,
} from '../src/engine/config-loader';
import { createGame } from '../src/engine/setup';
import { Rng } from '../src/engine/rng';
import { rollPhase, endOfRound, isRoundOver } from '../src/engine/rounds';
import { apply, enumerate } from '../src/engine/moves';
import { pickMove } from '../src/ai/decide';
import type { GameState, Move, PlayerId, DieRange } from '../src/engine/types';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const r = (f: string) => JSON.parse(readFileSync(resolve(root, f), 'utf8'));
const configs = {
  factions:    parseFactions(r('config/factions.json')),
  regions:     parseRegions(r('config/regions.json')),
  rules:       parseRules(r('config/rules.json')),
  roundGoals:  parseRoundGoals(r('config/round-goals.json')),
  secretGoals: parseSecretGoals(r('config/secret-goals.json')),
  cards:       parseCards(r('config/cards.json')),
  costs:       parseCosts(r('config/costs.json')),
  structures:  parseStructures(r('config/structures.json')),
};

// Mirror TutorialPage's TUTORIAL_DICE
const TUTORIAL_DICE: Record<number, Record<string, number[]>> = {
  1: { p1: [6, 3, 2], p2: [5, 3] },
  2: { p1: [6, 3, 2], p2: [4, 2] },
};

function applyForcedDice(state: GameState): GameState {
  const map = TUTORIAL_DICE[state.round];
  if (!map) return state;
  return produce(state, (draft) => {
    const tierOrder: Record<string, number> = { '1-6': 0, '3-6': 1, '2-5': 2, '1-3': 3 };
    for (const [pid, forced] of Object.entries(map)) {
      const p = draft.players[pid]; if (!p) continue;
      const dice = p.dice
        .filter((d) => d.location.kind === 'barracks' && d.faceValue !== null && !d.mercSource)
        .sort((a, b) => (tierOrder[a.range] ?? 9) - (tierOrder[b.range] ?? 9));
      dice.forEach((d, i) => { const v = forced[i]; if (v != null) d.faceValue = v; });
    }
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const HUMAN: PlayerId = 'p1';

function describeMove(move: Move, state: GameState): string {
  switch (move.kind) {
    case 'place': {
      const d = findDie(state, move.dieId);
      return `place [${d?.range}:${d?.faceValue}] → ${move.regionId}`;
    }
    case 'combine': {
      const a = findDie(state, move.dieIds[0]);
      const b = findDie(state, move.dieIds[1]);
      return `combine [${a?.range}:${a?.faceValue}] + [${b?.range}:${b?.faceValue}] = ${(a?.faceValue ?? 0) + (b?.faceValue ?? 0)} → ${move.regionId}`;
    }
    case 'battle': return `battle attack ${move.targetRegionId}`;
    case 'hire-merc': return `hire ${move.mercSlot} merc`;
    case 'use-active': return `use-active`;
    case 'upgrade-die': { const d = findDie(state, move.dieId); return `upgrade [${d?.range}:${d?.faceValue}]`; }
    case 'expand-barracks': return `expand-barracks`;
    case 'draft-card':  return `draft ${move.cardId}`;
    case 'play-card':   return `play ${move.cardId}`;
    case 'build-structure': return `build ${move.structureId} @ ${move.regionId}`;
    case 'pass': return `pass`;
  }
}

function findDie(state: GameState, id: string) {
  for (const p of Object.values(state.players)) {
    const d = p.dice.find((x) => x.id === id);
    if (d) return d;
  }
  return undefined;
}

function findDieByValue(state: GameState, pid: PlayerId, range: DieRange, faceValue: number) {
  return state.players[pid]?.dice.find((d) =>
    d.range === range && d.faceValue === faceValue && d.location.kind === 'barracks'
  );
}

function snapshot(state: GameState): string {
  const lines: string[] = [];
  lines.push(`  phase=${state.phase} round=${state.round} active=${state.activePlayerId} threat=${state.threatTrack}`);
  const goal = state.roundGoals.find((g) => g.forRound === state.round);
  if (goal) lines.push(`  round goal: ${goal.goalId}`);
  for (const pid of state.turnOrder) {
    const p = state.players[pid]!;
    const barracks = p.dice
      .filter((d) => d.location.kind === 'barracks' && d.faceValue !== null)
      .map((d) => `${d.range}:${d.faceValue}${d.mercSource ? '*' : ''}`)
      .join(' ');
    const placed = p.dice.filter((d) => d.location.kind === 'region').length;
    const garr   = p.dice.filter((d) => d.location.kind === 'garrison').length;
    const passed = p.passedThisRound ? ' [passed]' : '';
    lines.push(`  ${pid} (${p.factionId}): VP=${p.vp} ⚙${p.resources.iron} 🪙${p.resources.gold} 💎${p.resources.essence} | barracks=[${barracks}] placed=${placed} garr=${garr}${passed}`);
  }
  return lines.join('\n');
}

// ─── Sim core ────────────────────────────────────────────────────────────────

function startTutorial(): { state: GameState; rng: Rng } {
  const init = createGame({
    seed: 'tutorial-interactive',
    players: [
      { id: 'p1', factionId: 'warriors', isAI: false },
      { id: 'p2', factionId: 'mages',    isAI: true  },
    ],
    regions: configs.regions, factions: configs.factions, rules: configs.rules,
    roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
  });
  const rng = Rng.fromSnapshot(JSON.parse(init.rngState));
  const rolled = rollPhase(init, { rng, cards: configs.cards });
  const state = applyForcedDice(rolled);
  return { state, rng };
}

function applyUserMove(state: GameState, rng: Rng, move: Move): GameState {
  return apply(state, move, {
    rules: configs.rules, cards: configs.cards, costs: configs.costs,
    structures: configs.structures, rng,
  });
}

function runAIUntilHumanOrRoundEnd(state: GameState, rng: Rng): { state: GameState; moves: Array<{ pid: PlayerId; move: Move; reason: string }> } {
  const moves: Array<{ pid: PlayerId; move: Move; reason: string }> = [];
  let safety = 30;
  while (state.phase === 'action' && !isRoundOver(state) && safety-- > 0) {
    if (state.activePlayerId === HUMAN && !state.players[HUMAN]?.passedThisRound) break;
    const result = pickMove(state, {
      rules: configs.rules, cards: configs.cards, costs: configs.costs,
      structures: configs.structures, roundGoals: configs.roundGoals,
      secretGoals: configs.secretGoals, rng, difficulty: 'medium',
    });
    const before = state;
    state = apply(state, result.move, {
      rules: configs.rules, cards: configs.cards, costs: configs.costs,
      structures: configs.structures, rng,
    });
    if (before.activePlayerId !== HUMAN) {
      const top = result.reasoning.candidates[0];
      const reason = top ? `score=${top.score.toFixed(2)} vp=${top.breakdown.vpGain?.toFixed(1)} goal=${top.breakdown.roundGoalAlignment?.toFixed(1)}` : '';
      moves.push({ pid: before.activePlayerId, move: result.move, reason });
    }
  }
  return { state, moves };
}

function nextRound(state: GameState, rng: Rng): GameState {
  if (isRoundOver(state)) {
    state = endOfRound(state, {
      rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
      cardKeepCost: configs.costs.cardKeep, structures: configs.structures,
    });
  }
  if (state.phase === 'roll') {
    state = rollPhase(state, { rng, cards: configs.cards });
    state = applyForcedDice(state);
  }
  return state;
}

// ─── Tutorial walk ───────────────────────────────────────────────────────────

function header(title: string) {
  console.log(`\n${'─'.repeat(78)}\n  ${title}\n${'─'.repeat(78)}`);
}

console.log('\n  Iron & Ash — Tutorial Verification Walk-Through');
console.log(`  Seed: tutorial-interactive  ·  Warriors vs Mages AI\n`);

let { state, rng } = startTutorial();

header('INITIAL STATE (after forced R1 dice)');
console.log(snapshot(state));

// ─── Step 7: User places 2 in Marshlands ─────────────────────────────────────
{
  header('STEP 7  ⏳ User: place [1-3:2] → marshlands');
  const die = findDieByValue(state, HUMAN, '1-3', 2);
  if (!die) { console.error('  ❌ FAIL: 1-3:2 die not found'); process.exit(1); }
  const move: Move = { kind: 'place', dieId: die.id, regionId: 'marshlands' };
  const legal = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, structures: configs.structures, rng });
  const ok = legal.some((m) => m.kind === 'place' && m.dieId === die.id && m.regionId === 'marshlands');
  console.log(`  legal? ${ok ? '✓' : '✗'}`);
  if (!ok) { console.log('  ❌ Marshlands not legal'); process.exit(1); }
  state = applyUserMove(state, rng, move);
  console.log(snapshot(state));
}

// ─── Step 8: Mages turn ──────────────────────────────────────────────────────
{
  header('STEP 8  🧙 Mages\' Move (AI auto-loop)');
  const result = runAIUntilHumanOrRoundEnd(state, rng);
  state = result.state;
  if (result.moves.length === 0) console.log('  (no AI moves)');
  for (const m of result.moves) console.log(`  ${m.pid}: ${describeMove(m.move, state)}  [${m.reason}]`);
  console.log(snapshot(state));
}

// ─── Step 9: User hires Specialist (before Mages can) ────────────────────────
{
  header('STEP 9  ⏳ User: hire specialist');
  const move: Move = { kind: 'hire-merc', mercSlot: 'specialist' };
  const legal = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, structures: configs.structures, rng });
  const ok = legal.some((m) => m.kind === 'hire-merc' && m.mercSlot === 'specialist');
  console.log(`  legal? ${ok ? '✓' : '✗'} (Warriors should have ≥1 gold for the discounted spec)`);
  if (!ok) { console.log('  ❌ Specialist hire not legal'); process.exit(1); }
  state = applyUserMove(state, rng, move);
  console.log(snapshot(state));
}

// ─── Step 10: Mages turn ─────────────────────────────────────────────────────
{
  header('STEP 10  🧙 Mages Respond');
  const result = runAIUntilHumanOrRoundEnd(state, rng);
  state = result.state;
  for (const m of result.moves) console.log(`  ${m.pid}: ${describeMove(m.move, state)}  [${m.reason}]`);
  console.log(snapshot(state));
}

// ─── Step 11: User places 6 in Goldhaven ─────────────────────────────────────
{
  header('STEP 11  ⏳ User: place [1-6:6] → goldhaven');
  const die = findDieByValue(state, HUMAN, '1-6', 6);
  if (!die) { console.error('  ❌ FAIL: 1-6:6 die not found'); process.exit(1); }
  const move: Move = { kind: 'place', dieId: die.id, regionId: 'goldhaven' };
  const legal = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, structures: configs.structures, rng });
  const ok = legal.some((m) => m.kind === 'place' && m.dieId === die.id && m.regionId === 'goldhaven');
  console.log(`  legal? ${ok ? '✓' : '✗'}`);
  if (!ok) { console.log('  ❌ Goldhaven not legal'); process.exit(1); }
  state = applyUserMove(state, rng, move);
  console.log(snapshot(state));
}

// ─── Step 12: Mages turn ─────────────────────────────────────────────────────
{
  header('STEP 12  🧙 Mages Move Again');
  const result = runAIUntilHumanOrRoundEnd(state, rng);
  state = result.state;
  for (const m of result.moves) console.log(`  ${m.pid}: ${describeMove(m.move, state)}  [${m.reason}]`);
  console.log(snapshot(state));
}

// ─── Step 13: User passes ────────────────────────────────────────────────────
{
  header('STEP 13  ⏳ User: pass');
  state = applyUserMove(state, rng, { kind: 'pass' });
  console.log(snapshot(state));
}

// ─── Step 14: Mages finish round ─────────────────────────────────────────────
{
  header('STEP 14  🧙 Mages Finish the Round');
  const result = runAIUntilHumanOrRoundEnd(state, rng);
  state = result.state;
  for (const m of result.moves) console.log(`  ${m.pid}: ${describeMove(m.move, state)}  [${m.reason}]`);
  console.log(snapshot(state));
  console.log(`  isRoundOver? ${isRoundOver(state) ? '✓' : '✗'}`);
}

// ─── End of round 1 → Round 2 ────────────────────────────────────────────────
{
  header('STEP 15-16  📊 End of Round 1 → Round 2 begins');
  const before = state;
  state = nextRound(state, rng);
  console.log('  VP changes after endOfRound:');
  for (const pid of state.turnOrder) {
    const vpb = before.players[pid]?.vp ?? 0;
    const vpa = state.players[pid]?.vp ?? 0;
    if (vpa !== vpb) console.log(`    ${pid}: ${vpb} → ${vpa} (+${vpa - vpb})`);
  }
  console.log(snapshot(state));
}

// ─── Step 17: User combines 6+3=9 → Stormwall Keep (garrison) ────────────────
{
  header('STEP 17  ⏳ User: combine [1-6:6] + [1-3:3] = 9 → stormwall-keep');
  const die6 = findDieByValue(state, HUMAN, '1-6', 6);
  const die3 = findDieByValue(state, HUMAN, '1-3', 3);
  if (!die6 || !die3) { console.error('  ❌ FAIL: 1-6:6 or 1-3:3 not in barracks'); process.exit(1); }
  const move: Move = { kind: 'combine', dieIds: [die6.id, die3.id], regionId: 'stormwall-keep' };
  const legal = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, structures: configs.structures, rng });
  const ok = legal.some((m) =>
    m.kind === 'combine' &&
    ((m.dieIds[0] === die6.id && m.dieIds[1] === die3.id) || (m.dieIds[0] === die3.id && m.dieIds[1] === die6.id)) &&
    m.regionId === 'stormwall-keep'
  );
  console.log(`  legal? ${ok ? '✓' : '✗'} (sum ${die6.faceValue}+${die3.faceValue}=${(die6.faceValue ?? 0) + (die3.faceValue ?? 0)} ≥ 7)`);
  if (!ok) { console.log('  ❌ Combine not legal — Stormwall Keep may be taken or unreachable'); process.exit(1); }
  state = applyUserMove(state, rng, move);
  console.log(snapshot(state));
}

// ─── Step 18: Mages turn ─────────────────────────────────────────────────────
{
  header('STEP 18  🧙 Mages\' Turn in R2');
  const result = runAIUntilHumanOrRoundEnd(state, rng);
  state = result.state;
  for (const m of result.moves) console.log(`  ${m.pid}: ${describeMove(m.move, state)}  [${m.reason}]`);
  console.log(snapshot(state));
}

// ─── Step 19: User uses Iron Discipline ──────────────────────────────────────
{
  header('STEP 19  ⏳ User: use-active (Iron Discipline)');
  const move: Move = { kind: 'use-active' };
  const legal = enumerate(state, { rules: configs.rules, cards: configs.cards, costs: configs.costs, structures: configs.structures, rng });
  const ok = legal.some((m) => m.kind === 'use-active');
  console.log(`  legal? ${ok ? '✓' : '✗'}`);
  if (!ok) {
    console.log('  ⚠ Active not legal — may already be used this round.');
  } else {
    state = applyUserMove(state, rng, move);
  }
  console.log(snapshot(state));
}

// ─── Step 20: Mages turn ─────────────────────────────────────────────────────
{
  header('STEP 20  🧙 Mages Respond Again');
  const result = runAIUntilHumanOrRoundEnd(state, rng);
  state = result.state;
  for (const m of result.moves) console.log(`  ${m.pid}: ${describeMove(m.move, state)}  [${m.reason}]`);
  console.log(snapshot(state));
}

// ─── Step 21: User passes ────────────────────────────────────────────────────
{
  header('STEP 21  ⏳ User: pass');
  state = applyUserMove(state, rng, { kind: 'pass' });
  console.log(snapshot(state));
}

// ─── Step 22: Mages finish round 2 ───────────────────────────────────────────
{
  header('STEP 22  🧙 Mages Close Round 2');
  const result = runAIUntilHumanOrRoundEnd(state, rng);
  state = result.state;
  for (const m of result.moves) console.log(`  ${m.pid}: ${describeMove(m.move, state)}  [${m.reason}]`);
  console.log(snapshot(state));
  console.log(`  isRoundOver? ${isRoundOver(state) ? '✓' : '✗'}`);
}

// ─── End of round 2 ──────────────────────────────────────────────────────────
{
  header('END OF ROUND 2 — Tutorial complete, free-play takes over');
  const before = state;
  state = nextRound(state, rng);
  console.log('  VP changes after endOfRound:');
  for (const pid of state.turnOrder) {
    const vpb = before.players[pid]?.vp ?? 0;
    const vpa = state.players[pid]?.vp ?? 0;
    if (vpa !== vpb) console.log(`    ${pid}: ${vpb} → ${vpa} (+${vpa - vpb})`);
  }
  console.log(snapshot(state));
}

console.log('\n  ✓ Tutorial walk-through complete.\n');
