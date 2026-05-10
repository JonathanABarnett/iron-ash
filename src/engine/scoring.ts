// Scoring: round goals (each end-of-round) + end-game (regions, fortresses, secret goals).

import { produce } from 'immer';
import type {
  GameState,
  PlayerId,
  PlayerScore,
  RoundGoalDefinition,
  ScoreBreakdown,
  SecretGoalDefinition,
} from './types';
import { ROUND_GOAL_MEASURES } from './round-goals';
import { SECRET_GOAL_CHECKS } from './secret-goals';

const ROUND_GOAL_VP = [3, 2, 1] as const;

export function scoreRoundGoal(
  state: GameState,
  goal: RoundGoalDefinition,
): GameState {
  const measure = ROUND_GOAL_MEASURES[goal.id];
  if (!measure) {
    throw new Error(`No measure registered for round goal ${goal.id}`);
  }
  const playerIds = state.turnOrder;
  const measurements = playerIds.map((pid) => ({ pid, value: measure(state, pid) }));

  // Group players by value, sort distinct values by direction.
  const sorted = [...measurements].sort((a, b) =>
    goal.direction === 'highest' ? b.value - a.value : a.value - b.value,
  );

  const ranks: { value: number; pids: PlayerId[] }[] = [];
  for (const entry of sorted) {
    const last = ranks[ranks.length - 1];
    if (last && last.value === entry.value) last.pids.push(entry.pid);
    else ranks.push({ value: entry.value, pids: [entry.pid] });
  }

  return produce(state, (draft) => {
    for (let i = 0; i < Math.min(ranks.length, ROUND_GOAL_VP.length); i++) {
      const tier = ranks[i]!;
      const vp = ROUND_GOAL_VP[i]!;
      for (const pid of tier.pids) {
        draft.players[pid]!.vp += vp;
      }
    }
    const slot = draft.roundGoals.find((s) => s.forRound === draft.round);
    if (slot) slot.resolved = true;
  });
}

/** Award per-round fortress VP to garrison holders. Default 1 VP per held fortress. */
export function scoreFortressPerRound(state: GameState): GameState {
  return produce(state, (draft) => {
    for (const rt of Object.values(draft.regions)) {
      if (rt.garrisonOwnerId && rt.garrisonedDieIds.length > 0) {
        draft.players[rt.garrisonOwnerId]!.vp += 1;
      }
    }
  });
}

export function computeEndGameScore(
  state: GameState,
  secretGoals: SecretGoalDefinition[],
): ScoreBreakdown {
  const sgById = new Map(secretGoals.map((g) => [g.id, g]));
  const perPlayer: Record<PlayerId, PlayerScore> = {};

  for (const pid of state.turnOrder) {
    const player = state.players[pid]!;

    // Round-goal VP and per-round fortress VP have already been added to player.vp during play.
    // We split them out for reporting by deriving fortressesPerRound from log-free heuristics
    // is fragile, so here we just bucket: total is player.vp + end-game additions.
    const roundGoalsAndFortressPerRound = player.vp;

    let regionControl = 0;
    let fortressEndGame = 0;
    for (const rt of Object.values(state.regions)) {
      const def = state.regionDefs[rt.regionId];
      if (!def) continue;
      const placedHere = rt.placedDieIds.some((id) =>
        player.dice.some((d) => d.id === id),
      );
      const ownsGarrison = rt.garrisonOwnerId === pid;
      if (def.isFortress) {
        if (ownsGarrison) fortressEndGame += def.vp;
      } else if (placedHere) {
        regionControl += def.vp;
      }
    }

    let fullBarracksBonus = 0;
    if (player.dice.length >= player.barracksMax) fullBarracksBonus = 3;

    const playerSecrets = state.secretGoalsByPlayer[pid] ?? [];
    let secretGoalsScore = 0;
    let completedCount = 0;
    for (const gid of playerSecrets) {
      const def = sgById.get(gid);
      if (!def) continue;
      const check = SECRET_GOAL_CHECKS[gid];
      if (check && check(state, pid)) {
        secretGoalsScore += def.vp;
        completedCount += 1;
      }
    }
    const bothSecretGoalsBonus = completedCount >= 2 ? 4 : 0;

    const total =
      roundGoalsAndFortressPerRound +
      regionControl +
      fortressEndGame +
      fullBarracksBonus +
      secretGoalsScore +
      bothSecretGoalsBonus;

    perPlayer[pid] = {
      playerId: pid,
      total,
      parts: {
        roundGoals: roundGoalsAndFortressPerRound,
        fortressesPerRound: 0, // collapsed into roundGoals; tracked separately if/when needed
        regionControl,
        fortressEndGame,
        fullBarracksBonus,
        secretGoals: secretGoalsScore,
        bothSecretGoalsBonus,
      },
    };
  }

  // Determine winner: highest total, alphabetical pid tiebreak.
  let winnerId = state.turnOrder[0]!;
  for (const pid of state.turnOrder) {
    const challenger = perPlayer[pid]!;
    const champ = perPlayer[winnerId]!;
    if (
      challenger.total > champ.total ||
      (challenger.total === champ.total && pid < winnerId)
    ) {
      winnerId = pid;
    }
  }

  return { perPlayer, winnerId };
}
