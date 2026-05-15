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

  it('matches spec values for stable factions (balance-adjusted factions noted)', () => {
    // Core spec values — should not change without a new design decision.
    expect(PERSONALITIES.warriors.fortressPriority).toBe(0.9);
    expect(PERSONALITIES.warriors.battlePriority).toBe(0.9);
    expect(PERSONALITIES.merchants.enginePriority).toBe(0.9);
    expect(PERSONALITIES.merchants.mercenaryAffinity).toBe(0.6); // tuned from 0.8 — merc spamming caused 43% wins
    // Assassins riskTolerance was 0.8 in spec but tuned to 0.65 after balance pass
    // (over-gambling post-Shadow-Step-nerf was hurting them).
    expect(PERSONALITIES.assassins.riskTolerance).toBe(0.65);
    expect(PERSONALITIES.mages.combinationAffinity).toBe(0.8);
    expect(PERSONALITIES.necromancers.enginePriority).toBe(0.8);
  });

  it('throws on unknown faction', () => {
    // @ts-expect-error testing runtime guard
    expect(() => weightsFor('unknown')).toThrow();
  });
});
