import { describe, expect, it } from 'vitest';
import { PERSONALITIES, weightsFor } from '@ai/personalities';
import type { FactionId } from '@engine/types';

describe('PERSONALITIES', () => {
  const ALL: FactionId[] = [
    'warriors',
    'assassins',
    'mages',
    'necromancers',
    'merchants',
    'rangers',
    'paladins',
    'beastmasters',
  ];

  it('every faction has a complete weights entry', () => {
    for (const id of ALL) {
      const w = weightsFor(id);
      expect(w.fortressPriority).toBeGreaterThanOrEqual(0);
      expect(w.fortressPriority).toBeLessThanOrEqual(1);
      expect(w.battlePriority).toBeGreaterThanOrEqual(0);
      expect(w.combinationAffinity).toBeGreaterThanOrEqual(0);
    }
  });

  it('matches current tuned personality values (updated after balance passes)', () => {
    // Values reflect tuning from balance passes 1-4. See ai/personalities.ts
    // and docs/ideas-and-testing.md for the history.
    expect(PERSONALITIES.warriors.fortressPriority).toBe(0.9);    // unchanged from spec
    expect(PERSONALITIES.warriors.battlePriority).toBe(0.75);     // tuned 0.9→0.75 (was 61.7% in 1v1 lineup artifact)
    expect(PERSONALITIES.merchants.enginePriority).toBe(0.75);    // tuned 0.9→0.75 (gold compounding too efficient)
    expect(PERSONALITIES.merchants.mercenaryAffinity).toBe(0.6);  // tuned 0.8→0.6 (merc spamming → 43% wins)
    expect(PERSONALITIES.assassins.riskTolerance).toBe(0.4);      // tuned 0.65→0.5→0.4 (over-gambling post-Shadow-Step-nerf)
    expect(PERSONALITIES.mages.combinationAffinity).toBe(0.55);   // tuned 0.8→0.55 (combine 2-for-1 wasted board presence)
    expect(PERSONALITIES.necromancers.enginePriority).toBe(0.6);  // tuned 0.8→0.6 (over-investing in upgrades)
  });

  it('throws on unknown faction', () => {
    // @ts-expect-error testing runtime guard
    expect(() => weightsFor('unknown')).toThrow();
  });
});
