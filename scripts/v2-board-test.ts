// ─── v2 prototype validation ─────────────────────────────────────────────────
// Answers the core design questions BEFORE we build any UI:
//   1. Does the player-count-scaled board have sane topology?
//   2. Do armies actually COLLIDE? (v1's fatal flaw was that they didn't.)
//   3. Is combat balanced? (Is defense too dominant? Are casualties healthy?)
//   4. Does combat read dramatically?
//
// Run:  npx tsx scripts/v2-board-test.ts

import { generateBoard, territoryList, graphDistance, type BoardV2 } from '../src/v2/board';
import { resolveBattle, describeBattle } from '../src/v2/combat';
import { makeUnits, UNIT_PROFILE, type Unit, type UnitRange } from '../src/v2/units';
import { Rng } from '../src/engine/rng';

function hr(label: string) {
  console.log('\n' + '─'.repeat(74));
  console.log('  ' + label);
  console.log('─'.repeat(74));
}

// ─── 1. Topology report ───────────────────────────────────────────────────────

hr('1. BOARD TOPOLOGY (3N + 1 scaling)');

for (const N of [2, 3, 4]) {
  const board = generateBoard(N, 'demo');
  const list = territoryList(board);
  const byRole = (role: string) => list.filter((t) => t.role === role).length;
  const avgDegree = (list.reduce((s, t) => s + t.adjacency.length, 0) / list.length).toFixed(1);
  const homeToCenter = board.homeIds.map((h) => graphDistance(board, h, board.centerId));

  console.log(`\n  ${N} players → ${list.length} territories (expected ${3 * N + 1})`);
  console.log(`    roles: ${byRole('home')} home · ${byRole('choke')} choke · ${byRole('border')} border · ${byRole('center')} center`);
  console.log(`    avg connections/territory: ${avgDegree} · home→center: ${homeToCenter.join(', ')} edges`);
}

// ─── 2. Combat balance ────────────────────────────────────────────────────────
// Equal-force clashes across terrain bonuses — is defense too dominant?

hr('2. COMBAT BALANCE (attacker win % at equal force, by terrain bonus)');

function unitsOf(range: UnitRange, n: number, tag: string): Unit[] {
  return makeUnits(range, n, tag);
}

function attackerWinRate(atk: Unit[], def: Unit[], defenseBonus: number, trials: number): { win: number; atkLoss: number; defLoss: number } {
  let wins = 0, atkLoss = 0, defLoss = 0;
  for (let i = 0; i < trials; i++) {
    const rng = new Rng(`bal-${defenseBonus}-${atk.length}-${def.length}-${i}`);
    const r = resolveBattle({ units: atk }, { units: def }, defenseBonus, rng);
    if (r.territoryCaptured) wins++;
    atkLoss += r.attackerLosses;
    defLoss += r.defenderLosses;
  }
  return { win: wins / trials, atkLoss: atkLoss / trials, defLoss: defLoss / trials };
}

console.log('\n  3 soldiers (2-5) attacking 3 soldiers (2-5):');
for (const bonus of [0, 1, 2, 3]) {
  const r = attackerWinRate(unitsOf('2-5', 3, 'a'), unitsOf('2-5', 3, 'd'), bonus, 4000);
  console.log(`    +${bonus} terrain → attacker wins ${(r.win * 100).toFixed(0)}%  (avg losses: atk ${r.atkLoss.toFixed(1)}, def ${r.defLoss.toFixed(1)})`);
}

console.log('\n  Force-quality matters — vs a 3-soldier defender on +2 terrain:');
for (const [range, label] of [['1-3', '3 levies   '], ['2-5', '3 soldiers '], ['3-6', '3 elites   '], ['1-6', '3 champions']] as const) {
  const r = attackerWinRate(unitsOf(range, 3, 'a'), unitsOf('2-5', 3, 'd'), 2, 4000);
  console.log(`    ${label} attacking → ${(r.win * 100).toFixed(0)}% win`);
}

console.log('\n  Numbers matter — soldiers vs a 3-soldier defender on +2 terrain:');
for (const n of [2, 3, 4, 5]) {
  const r = attackerWinRate(unitsOf('2-5', n, 'a'), unitsOf('2-5', 3, 'd'), 2, 4000);
  console.log(`    ${n} attackers → ${(r.win * 100).toFixed(0)}% win  (avg atk losses ${r.atkLoss.toFixed(1)})`);
}

// ─── 3. Collision simulation ──────────────────────────────────────────────────

interface Occupancy { owner: number; units: Unit[] }

function startForce(tag: string): Unit[] {
  // Two soldiers + a levy — a small mixed garrison.
  return [...makeUnits('2-5', 2, `${tag}-s`), ...makeUnits('1-3', 1, `${tag}-l`)];
}

function reinforce(income: number, tag: string): Unit[] {
  // Income buys soldiers; the centre/fortresses (income 3) fund an elite.
  if (income >= 3) return makeUnits('3-6', 1, `${tag}-e`);
  return makeUnits('2-5', Math.max(1, income - 1), `${tag}-r`);
}

function simulateGame(board: BoardV2, seed: string): { battles: number; centerFlips: number } {
  const rng = new Rng(seed);
  const occ: Record<string, Occupancy> = {};
  board.homeIds.forEach((h, i) => { occ[h] = { owner: i, units: startForce(`p${i}-r0`) }; });

  let battles = 0, centerFlips = 0, lastCenterOwner = -1, idc = 0;
  const ROUNDS = 7;

  for (let round = 0; round < ROUNDS; round++) {
    for (let p = 0; p < board.playerCount; p++) {
      const sources = Object.entries(occ).filter(([, o]) => o.owner === p && o.units.length >= 2);
      if (sources.length === 0) continue;

      let best: { from: string; to: string; score: number } | null = null;
      for (const [fromId] of sources) {
        for (const toId of board.territories[fromId]!.adjacency) {
          const target = occ[toId];
          const enemy = target && target.owner !== p;
          const closer = graphDistance(board, toId, board.centerId) < graphDistance(board, fromId, board.centerId);
          const score = (enemy ? 3 : 0) + (closer ? 1 : 0) + (toId === board.centerId ? 2 : 0);
          if (score > 0 && (!best || score > best.score)) best = { from: fromId, to: toId, score };
        }
      }
      if (!best) continue;

      const src = occ[best.from]!;
      const moveCount = Math.max(1, Math.floor(src.units.length / 2));
      const moving = src.units.slice(0, moveCount);
      src.units = src.units.slice(moveCount);
      if (src.units.length === 0) delete occ[best.from];

      const target = occ[best.to];
      if (!target) {
        occ[best.to] = { owner: p, units: moving };
      } else if (target.owner === p) {
        target.units.push(...moving);
      } else {
        battles++;
        const r = resolveBattle({ units: moving }, { units: target.units }, board.territories[best.to]!.defenseBonus, rng);
        if (r.territoryCaptured) {
          if (r.attackerSurvivors.length > 0) occ[best.to] = { owner: p, units: r.attackerSurvivors };
          else delete occ[best.to];
        } else {
          if (r.defenderSurvivors.length > 0) target.units = r.defenderSurvivors;
          else delete occ[best.to];
        }
      }

      const centerOwner = occ[board.centerId]?.owner ?? -1;
      if (centerOwner !== lastCenterOwner && centerOwner !== -1) { centerFlips++; lastCenterOwner = centerOwner; }
    }
    for (const [id, o] of Object.entries(occ)) {
      o.units.push(...reinforce(board.territories[id]!.income, `p${o.owner}-r${round}-${idc++}`));
    }
  }
  return { battles, centerFlips };
}

hr('3. COLLISION SIM (200 games each · do armies actually meet?)');

for (const N of [2, 3, 4]) {
  const board = generateBoard(N, 'demo');
  let totalBattles = 0, totalFlips = 0, zeroBattleGames = 0;
  const GAMES = 200;
  for (let g = 0; g < GAMES; g++) {
    const r = simulateGame(board, `collide-${N}-${g}`);
    totalBattles += r.battles; totalFlips += r.centerFlips;
    if (r.battles === 0) zeroBattleGames++;
  }
  console.log(`\n  ${N}p → avg ${(totalBattles / GAMES).toFixed(1)} battles, ${(totalFlips / GAMES).toFixed(1)} centre flips/game · zero-battle games: ${zeroBattleGames}/${GAMES} ${zeroBattleGames === 0 ? '✓' : '✗'}`);
}

// ─── 4. Combat drama samples ───────────────────────────────────────────────────

hr('4. COMBAT SAMPLES (does rolling for territory read dramatically?)');

const rng = new Rng('combat-samples');
const RANGES: UnitRange[] = ['1-3', '2-5', '3-6', '1-6'];
console.log();
for (let i = 0; i < 6; i++) {
  const atk = Array.from({ length: rng.nextInt(2, 4) }, (_, k) => ({ id: `a${k}`, range: rng.pick(RANGES) }));
  const def = Array.from({ length: rng.nextInt(1, 3) }, (_, k) => ({ id: `d${k}`, range: rng.pick(RANGES) }));
  const defBonus = rng.pick([0, 1, 2, 3] as const);
  const r = resolveBattle({ units: atk }, { units: def }, defBonus, rng);
  const tiers = (us: { range: UnitRange }[]) => us.map((u) => UNIT_PROFILE[u.range].tier[0]).join('');
  console.log(`  atk ${tiers(atk)} vs def ${tiers(def)} +${defBonus}`);
  console.log(`    → ${describeBattle(r, 'Warriors', 'Mages', 'Stormwall Pass')}\n`);
}

console.log('─'.repeat(74));
console.log('  v2 prototype validation complete.\n');
