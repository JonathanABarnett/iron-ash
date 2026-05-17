// Headless test for card logic and AI card scoring.
// Tests:
//   1. Every card effect applies without throwing
//   2. AI scores all play-card moves > 0 (not the old flat-0.5)
//   3. AI scores context-aware: Tactical Synergy higher when combine is available

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCards, parseCosts, parseFactions, parseRegions,
  parseRoundGoals, parseRules, parseSecretGoals, parseStructures,
} from '../src/engine/config-loader';
import { createGame } from '../src/engine/setup';
import { Rng } from '../src/engine/rng';
import { rollPhase } from '../src/engine/rounds';
import { apply, enumerate } from '../src/engine/moves';
import { scoreMove } from '../src/ai/score';
import type { ScoreContext } from '../src/ai/score';
import type { GameState, Move } from '../src/engine/types';

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

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(label: string, ok: boolean, detail = '') {
  if (ok) { console.log(`  ✓ ${label}`); passed++; }
  else     { console.log(`  ✗ ${label}${detail ? ': ' + detail : ''}`); failed++; errors.push(label); }
}

// ── Build a game state where the human player holds all 8 cards in hand ─────

function buildState(): { state: GameState; rng: Rng } {
  const init = createGame({
    seed: 'card-test',
    players: [
      { id: 'p1', factionId: 'warriors', isAI: false },
      { id: 'p2', factionId: 'mages',    isAI: true  },
    ],
    regions: configs.regions, factions: configs.factions, rules: configs.rules,
    roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
  });
  const rng = Rng.fromSnapshot(JSON.parse(init.rngState));
  const rolled = rollPhase(init, { rng, cards: configs.cards });

  // Give p1 all 8 cards in hand and plenty of resources
  const withCards: GameState = {
    ...rolled,
    players: {
      ...rolled.players,
      p1: {
        ...rolled.players.p1!,
        hand: configs.cards.map(c => c.id),
        resources: { iron: 8, gold: 8, essence: 8 },
      },
    },
  };
  return { state: withCards, rng };
}

// ── Test 1: AI scores every play-card move > 0 ───────────────────────────────

console.log('\n  1. AI card scoring (all play-card moves should score > 0)');

const { state, rng } = buildState();
const enumCtx = {
  rules: configs.rules, cards: configs.cards, costs: configs.costs,
  structures: configs.structures, rng,
  roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
};

const scoreCtx: ScoreContext = {
  state, playerId: 'p1', factionId: 'warriors',
  cards: configs.cards,
  roundGoals: configs.roundGoals, secretGoals: configs.secretGoals,
  rules: configs.rules,
};

// Enumerate moves and find play-card
const moves = enumerate(state, enumCtx);
const playCardMoves = moves.filter((m): m is Extract<Move, { kind: 'play-card' }> => m.kind === 'play-card');
const draftCardMoves = moves.filter((m): m is Extract<Move, { kind: 'draft-card' }> => m.kind === 'draft-card');

check('play-card moves exist', playCardMoves.length > 0, `found ${playCardMoves.length}`);
check('draft-card moves exist', draftCardMoves.length > 0, `found ${draftCardMoves.length}`);

for (const m of playCardMoves) {
  const card = configs.cards.find(c => c.id === m.cardId);
  const score = scoreMove(m, { ...scoreCtx });
  check(`play-card ${card?.name ?? m.cardId} scores > 0`, score.score > 0, `got ${score.score.toFixed(3)}`);
}

for (const m of draftCardMoves) {
  const card = configs.cards.find(c => c.id === m.cardId);
  const score = scoreMove(m, { ...scoreCtx });
  check(`draft-card ${card?.name ?? m.cardId} scores > 0`, score.score > 0, `got ${score.score.toFixed(3)}`);
}

// ── Test 2: Engine applies every card without throwing ───────────────────────

console.log('\n  2. Engine card application (no throws)');

for (const m of playCardMoves) {
  const card = configs.cards.find(c => c.id === m.cardId);
  const rng2 = Rng.fromSnapshot(JSON.parse(JSON.stringify(rng.snapshot())));
  try {
    const after = apply(state, m, { ...enumCtx, rng: rng2 });
    check(`apply ${card?.name ?? m.cardId}`, after.phase === 'action' || after.phase === 'roll');
  } catch (e) {
    check(`apply ${card?.name ?? m.cardId}`, false, (e as Error).message);
  }
}

// ── Test 3: Tactical Synergy scores higher when combine is available ─────────

console.log('\n  3. Tactical Synergy context-awareness');

const tsynMove = playCardMoves.find(m => {
  const card = configs.cards.find(c => c.id === m.cardId);
  return card && typeof card.effect === 'object' && (card.effect as { kind: string }).kind === 'combine-bonus';
});
if (tsynMove) {
  // State with combine available
  const scoreWithCombine = scoreMove(tsynMove, { ...scoreCtx });

  // State where p1 has only 1 barracks die (can't combine)
  const noComboState: GameState = {
    ...state,
    players: {
      ...state.players,
      p1: { ...state.players.p1!, dice: state.players.p1!.dice.slice(0, 1) },
    },
  };
  const scoreNoCombine = scoreMove(tsynMove, { ...scoreCtx, state: noComboState });

  check('Tactical Synergy scores higher with combine available',
    scoreWithCombine.score > scoreNoCombine.score,
    `with=${scoreWithCombine.score.toFixed(3)} no-combo=${scoreNoCombine.score.toFixed(3)}`);
} else {
  check('Tactical Synergy move found', false, 'not in enumerated moves');
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n  Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) {
  errors.forEach(e => console.log(`    ✗ ${e}`));
  process.exit(1);
} else {
  console.log('  ✓ All card logic tests passed\n');
}
