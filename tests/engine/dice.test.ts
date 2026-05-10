import { describe, expect, it } from 'vitest';
import { FACES, rangeBounds, rollDie, rollBarracksDice } from '@engine/dice';
import { Rng } from '@engine/rng';
import type { Die, DieRange } from '@engine/types';

const RANGES: DieRange[] = ['1-3', '2-5', '3-6', '1-6'];

function makeDie(range: DieRange, id = 'd1'): Die {
  return {
    id,
    range,
    faceValue: null,
    ownerId: 'p1',
    location: { kind: 'barracks' },
  };
}

describe('dice', () => {
  it('every face table matches spec', () => {
    expect(FACES['1-3']).toEqual([1, 1, 2, 2, 3, 3]);
    expect(FACES['2-5']).toEqual([2, 2, 3, 3, 4, 5]);
    expect(FACES['3-6']).toEqual([3, 3, 4, 5, 6, 6]);
    expect(FACES['1-6']).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each(RANGES)('rollDie produces values within bounds for %s', (range) => {
    const rng = new Rng(`roll-${range}`);
    const [lo, hi] = rangeBounds(range);
    for (let i = 0; i < 200; i++) {
      const rolled = rollDie(makeDie(range), rng);
      expect(rolled.faceValue).not.toBeNull();
      expect(rolled.faceValue!).toBeGreaterThanOrEqual(lo);
      expect(rolled.faceValue!).toBeLessThanOrEqual(hi);
    }
  });

  it('rollDie returns a new die (immutability)', () => {
    const original = makeDie('1-6');
    const rng = new Rng('imm');
    const rolled = rollDie(original, rng);
    expect(original.faceValue).toBeNull();
    expect(rolled).not.toBe(original);
    expect(rolled.faceValue).not.toBeNull();
  });

  it('rollBarracksDice only rerolls dice in barracks', () => {
    const dice: Die[] = [
      makeDie('1-3', 'a'),
      { ...makeDie('1-3', 'b'), location: { kind: 'region', regionId: 'r1' } },
      makeDie('1-6', 'c'),
    ];
    const rng = new Rng('rb');
    const out = rollBarracksDice(dice, rng);
    expect(out[0]!.faceValue).not.toBeNull();
    expect(out[1]!.faceValue).toBeNull(); // skipped
    expect(out[2]!.faceValue).not.toBeNull();
  });

  it('1-3 die never rolls higher than 3', () => {
    const rng = new Rng('low');
    for (let i = 0; i < 500; i++) {
      const v = rollDie(makeDie('1-3'), rng).faceValue!;
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('3-6 die never rolls lower than 3', () => {
    const rng = new Rng('hi');
    for (let i = 0; i < 500; i++) {
      const v = rollDie(makeDie('3-6'), rng).faceValue!;
      expect(v).toBeGreaterThanOrEqual(3);
    }
  });
});
