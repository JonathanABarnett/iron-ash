// Verbose deviation test — shows every off-script move picked + AI responses.
// Gives a human-readable "what happens if you ignore the tutorial" walk-through.

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
import type { GameState, Move, Die } from '../src/engine/types';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const r = (f: string) => JSON.parse(readFileSync(resolve(root, f), 'utf8'));
const configs = {
  factions: parseFactions(r('config/factions.json')),
  regions:  parseRegions(r('config/regions.json')),
  rules:    parseRules(r('config/rules.json')),
  roundGoals: parseRoundGoals(r('config/round-goals.json')),
  secretGoals: parseSecretGoals(r('config/secret-goals.json')),
  cards:    parseCards(r('config/cards.json')),
  costs:    parseCosts(r('config/costs.json')),
  structures: parseStructures(r('config/structures.json')),
};

const ctx = {
  rules: configs.rules, cards: configs.cards,
  costs: configs.costs, structures: configs.structures,
};

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

function allDice(state: GameState): Die[] {
  return Object.values(state.players).flatMap((p) => p.dice);
}

function describeMove(m: Move, state: GameState): string {
  if (m.kind === 'pass') return 'pass';
  if (m.kind === 'place') {
    const die = allDice(state).find((d) => d.id === m.dieId);
    return `place [${die?.range}:${die?.faceValue}] → ${m.regionId}`;
  }
  if (m.kind === 'combine') {
    const d1 = allDice(state).find((d) => d.id === m.dieIds[0]);
    const d2 = allDice(state).find((d) => d.id === m.dieIds[1]);
    const sum = (d1?.faceValue ?? 0) + (d2?.faceValue ?? 0);
    return `combine [${d1?.range}:${d1?.faceValue}]+[${d2?.range}:${d2?.faceValue}]=${sum} → ${m.regionId}`;
  }
  if (m.kind === 'hire-merc') return `hire-merc:${m.mercSlot}`;
  if (m.kind === 'use-active') return `use-active`;
  if (m.kind === 'draft-card') return `draft-card:${m.cardId}`;
  if (m.kind === 'play-card') return `play-card:${m.cardId}`;
  return JSON.stringify(m);
}

function barracks(state: GameState, pid: string): string {
  return state.players[pid]?.dice
    .filter((d) => d.location.kind === 'barracks' && d.faceValue !== null)
    .map((d) => `${d.mercSource ? '*' : ''}${d.range}:${d.faceValue}`)
    .join(' ') || '—';
}

function summary(state: GameState): string {
  const p1 = state.players.p1!;
  const p2 = state.players.p2!;
  return [
    `    p1: ${p1.vp}VP  barracks=[${barracks(state,'p1')}]  placed=${p1.dice.filter(d=>d.location.kind==='region').length}  garr=${p1.dice.filter(d=>d.location.kind==='garrison').length}`,
    `    p2: ${p2.vp}VP  barracks=[${barracks(state,'p2')}]  placed=${p2.dice.filter(d=>d.location.kind==='region').length}  garr=${p2.dice.filter(d=>d.location.kind==='garrison').length}`,
  ].join('\n');
}

const HUMAN = 'p1';

function pickAnyAction(state: GameState): Move {
  const moves = enumerate(state, { ...ctx, rng });
  return moves.find((m) => m.kind !== 'pass') ?? { kind: 'pass' };
}

function runAI(state: GameState): GameState {
  let safety = 30;
  while (state.phase === 'action' && !isRoundOver(state) && safety-- > 0) {
    if (state.activePlayerId === HUMAN && !state.players[HUMAN]?.passedThisRound) break;
    const res = pickMove(state, {
      ...ctx, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
      rng, difficulty: 'medium',
    });
    console.log(`      AI → ${describeMove(res.move, state)}`);
    state = apply(state, res.move, { ...ctx, rng });
  }
  return state;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
const init = createGame({
  seed: 'tutorial-interactive',
  players: [
    { id: 'p1', factionId: 'warriors', isAI: false },
    { id: 'p2', factionId: 'mages', isAI: true },
  ],
  regions: configs.regions, factions: configs.factions, rules: configs.rules,
  roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
});
const rng = Rng.fromSnapshot(JSON.parse(init.rngState));
let state: GameState = applyForcedDice(rollPhase(init, { rng, cards: configs.cards }));

console.log('\n  ╔══════════════════════════════════════════════════════════╗');
console.log('  ║  TUTORIAL — FULL DEVIATION RUN (verbose)               ║');
console.log('  ║  Every user step picks the FIRST non-pass legal action  ║');
console.log('  ╚══════════════════════════════════════════════════════════╝\n');

const rg1 = configs.roundGoals[0]; // goals are positionally indexed: roundGoals[round-1]
console.log(`  R1 goal: ${rg1?.id ?? '?'}  |  p1 dice: [${state.players.p1?.dice.filter(d=>d.location.kind==='barracks').map(d=>d.faceValue).join(', ')}]  p2 dice: [${state.players.p2?.dice.filter(d=>d.location.kind==='barracks').map(d=>d.faceValue).join(', ')}]\n`);

const steps = [
  { label: 'R1 — action 1 (tutorial says: place [1-3:2] → marshlands)', pass: false },
  { label: 'R1 — action 2 (tutorial says: hire specialist @ 1 gold)',   pass: false },
  { label: 'R1 — action 3 (tutorial says: place [1-6:6] → goldhaven)',  pass: false },
  { label: 'R1 — pass (tutorial says: pass)',                            pass: true  },
  { label: 'R2 — action 1 (tutorial says: combine 6+3=9 → stormwall)', pass: false },
  { label: 'R2 — action 2 (tutorial says: use Iron Discipline)',         pass: false },
  { label: 'R2 — pass (tutorial says: pass)',                            pass: true  },
];

let stepNum = 0;
for (const step of steps) {
  stepNum++;
  const move = step.pass ? ({ kind: 'pass' } as Move) : pickAnyAction(state);
  const allMoves = enumerate(state, { ...ctx, rng });
  const nonPass = allMoves.filter((m) => m.kind !== 'pass');

  console.log(`  ─── Step ${stepNum}: ${step.label}`);
  console.log(`      ${nonPass.length} non-pass options available`);
  console.log(`      USER DOES: ${describeMove(move, state)}`);
  state = apply(state, move, { ...ctx, rng });
  state = runAI(state);
  console.log(summary(state));
  console.log('');

  if (isRoundOver(state)) {
    state = endOfRound(state, {
      rules: configs.rules, roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
      cardKeepCost: configs.costs.cardKeep, structures: configs.structures,
    });
    console.log(`  ════ End of Round — p1=${state.players.p1?.vp}VP  p2=${state.players.p2?.vp}VP ════\n`);
    if (state.phase === 'roll') {
      state = applyForcedDice(rollPhase(state, { rng, cards: configs.cards }));
      const rg = configs.roundGoals[state.round - 1]; // positionally indexed
      console.log(`  Round ${state.round} begins  |  goal: ${rg?.id ?? '?'}`);
      console.log(`    p1 barracks: [${barracks(state, 'p1')}]`);
      console.log(`    p2 barracks: [${barracks(state, 'p2')}]\n`);
    }
  }
}

console.log('  ════ Tutorial complete — free-play begins ════');
console.log(`  Final: round=${state.round}  p1=${state.players.p1?.vp}VP  p2=${state.players.p2?.vp}VP\n`);
