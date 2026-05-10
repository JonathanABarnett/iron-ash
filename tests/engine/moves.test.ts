import { describe, expect, it } from 'vitest';
import { apply, enumerate, IllegalMove } from '@engine/moves';
import { createGame } from '@engine/setup';
import { rollPhase } from '@engine/rounds';
import { Rng } from '@engine/rng';
import { parseFactions, parseRegions, parseRules } from '@engine/config-loader';
import factionsJson from '@config/factions.json';
import regionsJson from '@config/regions.json';
import rulesJson from '@config/rules.json';

function setup(seed = 'moves-test') {
  const factions = parseFactions(factionsJson);
  const regions = parseRegions(regionsJson);
  const rules = parseRules(rulesJson);
  const initial = createGame({
    seed,
    players: [
      { id: 'p1', factionId: 'warriors', isAI: true },
      { id: 'p2', factionId: 'mages', isAI: true },
    ],
    regions,
    factions,
    rules,
  });
  const rng = Rng.fromSnapshot(JSON.parse(initial.rngState));
  return { state: rollPhase(initial, rng), rules };
}

describe('moves.enumerate', () => {
  it('always includes pass during action phase', () => {
    const { state } = setup();
    const moves = enumerate(state);
    expect(moves.some((m) => m.kind === 'pass')).toBe(true);
  });

  it('yields no moves outside action phase', () => {
    const { state } = setup();
    expect(enumerate({ ...state, phase: 'roll' })).toEqual([]);
    expect(enumerate({ ...state, phase: 'finished' })).toEqual([]);
  });

  it('every place move uses a barracks die with non-null face', () => {
    const { state } = setup();
    const player = state.players[state.activePlayerId]!;
    const placeMoves = enumerate(state).filter((m) => m.kind === 'place');
    for (const m of placeMoves) {
      if (m.kind !== 'place') continue;
      const die = player.dice.find((d) => d.id === m.dieId)!;
      expect(die.location.kind).toBe('barracks');
      expect(die.faceValue).not.toBeNull();
    }
  });
});

describe('moves.apply', () => {
  it('place moves the die onto the region and rotates turn', () => {
    const { state } = setup();
    const placeable = enumerate(state).find((m) => m.kind === 'place');
    if (!placeable || placeable.kind !== 'place') {
      // Some seeds may produce no place moves (all dice rolled badly). Resample:
      const { state: s2 } = setup('moves-test-alt');
      const m2 = enumerate(s2).find((m) => m.kind === 'place');
      if (!m2 || m2.kind !== 'place') throw new Error('no placeable move in either seed');
      const next = apply(s2, m2);
      const die = next.players[s2.activePlayerId]!.dice.find((d) => d.id === m2.dieId)!;
      expect(die.location).toEqual({ kind: 'region', regionId: m2.regionId });
      expect(next.activePlayerId).not.toBe(s2.activePlayerId);
      return;
    }
    const next = apply(state, placeable);
    const die = next.players[state.activePlayerId]!.dice.find(
      (d) => d.id === placeable.dieId,
    )!;
    expect(die.location).toEqual({ kind: 'region', regionId: placeable.regionId });
    expect(next.regions[placeable.regionId]!.placedDieIds).toContain(placeable.dieId);
    expect(next.activePlayerId).not.toBe(state.activePlayerId);
  });

  it('pass marks the player passed and rotates to next non-passed player', () => {
    const { state } = setup();
    const before = state.activePlayerId;
    const after = apply(state, { kind: 'pass' });
    expect(after.players[before]!.passedThisRound).toBe(true);
    expect(after.activePlayerId).not.toBe(before);
  });

  it('throws on illegal place', () => {
    const { state } = setup();
    expect(() =>
      apply(state, { kind: 'place', dieId: 'nope', regionId: 'iron-pass' }),
    ).toThrow();
  });

  it('throws IllegalMove if not in action phase', () => {
    const { state } = setup();
    expect(() => apply({ ...state, phase: 'roll' }, { kind: 'pass' })).toThrowError(
      IllegalMove,
    );
  });
});
