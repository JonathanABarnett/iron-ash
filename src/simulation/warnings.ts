// Balance-target threshold checks. Emits human-readable warnings when a metric
// falls outside the targets the spec lists. Used by SimulationResult.warnings.

import type { FactionStats, RulePressure } from './types';

const FACTION_WIN_LO = 0.45 / 4; // per-game win share for a 4-player game
const FACTION_WIN_HI = 0.55 / 4;
// Note: spec phrases the target as "every faction within 45-55%" across many
// matchups; with 2-4 players a "fair" win rate is 1/N. We'll evaluate vs the
// observed mean instead of an absolute threshold — see below.

const VP_DEVIATION_PCT = 0.10;
const FORTRESS_TURNOVER_MIN = 0.60;
const ROUND7_MIN = 0.30;
const ROUND7_MAX = 0.50;

export function generateWarnings(
  factionStats: Record<string, FactionStats>,
  rulePressure: RulePressure,
): string[] {
  const warnings: string[] = [];

  // Win-rate spread vs mean.
  const played = Object.values(factionStats).filter((f) => f.playCount > 0);
  if (played.length > 0) {
    const meanWin = played.reduce((acc, f) => acc + f.winRate, 0) / played.length;
    for (const f of played) {
      const pct = (f.winRate - meanWin) * 100;
      if (Math.abs(pct) > 10) {
        warnings.push(
          `${f.factionId} win rate ${(f.winRate * 100).toFixed(1)}% deviates ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}pp from mean (${(meanWin * 100).toFixed(1)}%)`,
        );
      }
    }
  }
  void FACTION_WIN_LO;
  void FACTION_WIN_HI;

  // VP spread vs mean.
  if (played.length > 0) {
    const meanVp = played.reduce((acc, f) => acc + f.avgVP, 0) / played.length;
    for (const f of played) {
      if (meanVp === 0) continue;
      const dev = Math.abs(f.avgVP - meanVp) / meanVp;
      if (dev > VP_DEVIATION_PCT) {
        warnings.push(
          `${f.factionId} avg VP ${f.avgVP.toFixed(1)} deviates ${(dev * 100).toFixed(1)}% from mean (${meanVp.toFixed(1)}) — target ±10%`,
        );
      }
    }
  }

  // Fortress turnover.
  if (rulePressure.fortressTurnoverRate < FORTRESS_TURNOVER_MIN) {
    warnings.push(
      `Fortress turnover rate ${(rulePressure.fortressTurnoverRate * 100).toFixed(1)}% below ${FORTRESS_TURNOVER_MIN * 100}% target — fortresses too sticky`,
    );
  }

  // Round-7 reach rate.
  if (rulePressure.round7ReachRate < ROUND7_MIN) {
    warnings.push(
      `Round-7 reach rate ${(rulePressure.round7ReachRate * 100).toFixed(1)}% below ${ROUND7_MIN * 100}% target — threat track may be ending games too early`,
    );
  } else if (rulePressure.round7ReachRate > ROUND7_MAX) {
    warnings.push(
      `Round-7 reach rate ${(rulePressure.round7ReachRate * 100).toFixed(1)}% above ${ROUND7_MAX * 100}% target — threat track may not be biting enough`,
    );
  }

  // Specialist claim curve.
  const claimRound1 = rulePressure.specialistClaimByRound[0];
  const claimRound2 = rulePressure.specialistClaimByRound[1];
  if (claimRound1 !== null && claimRound1 !== undefined && claimRound1 < 0.4) {
    warnings.push(
      `Specialist claim rate in round 1 only ${(claimRound1 * 100).toFixed(1)}% (target ≥40%) — value 6 should be hotly contested`,
    );
  }
  if (claimRound2 !== null && claimRound2 !== undefined && claimRound2 < 0.4) {
    warnings.push(
      `Specialist claim rate in round 2 only ${(claimRound2 * 100).toFixed(1)}% (target ≥40%) — value 5 should still be appealing`,
    );
  }

  return warnings;
}
