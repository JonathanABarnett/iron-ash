// Resource helpers — gain, spend, clamp.

import type { Player, Resource, RulesConfig } from './types';

export const RESOURCES: readonly Resource[] = ['iron', 'gold', 'essence'] as const;

export function clampResources(player: Player, rules: RulesConfig): Player {
  const next: Record<Resource, number> = { ...player.resources };
  for (const r of RESOURCES) {
    const v = next[r];
    if (v < 0) next[r] = 0;
    else if (v > rules.resourceCap) next[r] = rules.resourceCap;
  }
  return { ...player, resources: next };
}

export function canAfford(player: Player, cost: Partial<Record<Resource, number>>): boolean {
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    if (player.resources[r] < need) return false;
  }
  return true;
}

export function spend(player: Player, cost: Partial<Record<Resource, number>>): Player {
  const next: Record<Resource, number> = { ...player.resources };
  for (const r of RESOURCES) {
    const need = cost[r] ?? 0;
    next[r] = next[r] - need;
  }
  return { ...player, resources: next };
}

export function gain(player: Player, gainAmt: Partial<Record<Resource, number>>): Player {
  const next: Record<Resource, number> = { ...player.resources };
  for (const r of RESOURCES) {
    const amt = gainAmt[r] ?? 0;
    next[r] = next[r] + amt;
  }
  return { ...player, resources: next };
}
