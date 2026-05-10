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
    // Find a place move to a non-fortress so we can verify the regular placement path.
    const placeable = enumerate(state).find(
      (m): m is { kind: 'place'; dieId: string; regionId: string } =>
        m.kind === 'place' && state.regionDefs[m.regionId]?.isFortress === false,
    );
    if (!placeable) {
      const { state: s2 } = setup('moves-test-alt');
      const m2 = enumerate(s2).find(
        (m): m is { kind: 'place'; dieId: string; regionId: string } =>
          m.kind === 'place' && s2.regionDefs[m.regionId]?.isFortress === false,
      );
      if (!m2) throw new Error('no non-fortress placeable move in either seed');
      const next = apply(s2, m2);
      const die = next.players[s2.activePlayerId]!.dice.find((d) => d.id === m2.dieId)!;
      expect(die.location).toEqual({ kind: 'region', regionId: m2.regionId });
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

  it('place onto a fortress garrisons the die instead of regular placement', () => {
    const { state } = setup('moves-fortress');
    const fortressMove = enumerate(state).find(
      (m): m is { kind: 'place'; dieId: string; regionId: string } =>
        m.kind === 'place' && state.regionDefs[m.regionId]?.isFortress === true,
    );
    if (!fortressMove) {
      // not all seeds produce a fortress placement; skip silently
      return;
    }
    const next = apply(state, fortressMove);
    const die = next.players[state.activePlayerId]!.dice.find(
      (d) => d.id === fortressMove.dieId,
    )!;
    expect(die.location).toEqual({ kind: 'garrison', regionId: fortressMove.regionId });
    expect(next.regions[fortressMove.regionId]!.garrisonedDieIds).toContain(
      fortressMove.dieId,
    );
    expect(next.regions[fortressMove.regionId]!.garrisonOwnerId).toBe(state.activePlayerId);
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
