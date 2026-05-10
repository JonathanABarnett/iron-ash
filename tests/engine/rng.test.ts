import { describe, expect, it } from 'vitest';
import { Rng } from '@engine/rng';

describe('Rng', () => {
  it('produces a deterministic sequence given the same seed', () => {
    const a = new Rng('seed-42');
    const b = new Rng('seed-42');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = new Rng('seed-42');
    const b = new Rng('seed-43');
    expect(a.next()).not.toEqual(b.next());
  });

  it('nextInt is bounded inclusive', () => {
    const r = new Rng('bounds');
    for (let i = 0; i < 200; i++) {
      const v = r.nextInt(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('shuffle returns a permutation without mutating input', () => {
    const r = new Rng('shuf');
    const input = [1, 2, 3, 4, 5];
    const out = r.shuffle(input);
    expect(out.slice().sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5]); // unchanged
  });

  it('snapshot/restore round-trips RNG state', () => {
    const a = new Rng('snap');
    a.next();
    a.next();
    const snap = a.snapshot();
    const aTail = [a.next(), a.next(), a.next()];

    const b = Rng.fromSnapshot(snap);
    const bTail = [b.next(), b.next(), b.next()];
    expect(aTail).toEqual(bTail);
  });

  it('pick throws on empty array', () => {
    const r = new Rng('e');
    expect(() => r.pick([])).toThrow();
  });
});
