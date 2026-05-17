// Card system: market refreshed each round, draft (pay cost, take card),
// play (apply effect), end-of-round hand cleanup (keep up to 2 free, discard rest).
//
// Phase 2C uses simplified data-driven effects (gain-resource, gain-vp,
// reroll-die, modify-die). Richer per-kind effects (lock, steal, etc.) layer
// on later by extending CardEffect — keep the configuration data, swap the
// runtime handler.

import { produce } from 'immer';
import type {
  CardDefinition,
  CardEffect,
  CardId,
  Die,
  GameState,
  PlayerId,
} from './types';
import { Rng } from './rng';
import { rollDie } from './dice';
import { canAfford, spend } from './resources';

const HAND_LIMIT = 3; // rulebook §5: keep up to 3 cards free; extras cost 1 gold each
const MARKET_SIZE = 4;

/** Refresh the market — discard whatever is there and deal MARKET_SIZE fresh cards. */
export function refreshMarket(
  state: GameState,
  cards: CardDefinition[],
  rng: Rng,
): GameState {
  const shuffled = rng.shuffle(cards);
  const drawn = shuffled.slice(0, MARKET_SIZE);
  return produce(state, (draft) => {
    draft.market = drawn.map((c) => c.id);
  });
}

export function canDraft(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cards: CardDefinition[],
): boolean {
  if (!state.market.includes(cardId)) return false;
  const card = cards.find((c) => c.id === cardId);
  if (!card) return false;
  const player = state.players[playerId];
  if (!player) return false;
  return canAfford(player, card.cost);
}

export function applyDraft(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cards: CardDefinition[],
): GameState {
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}`);
  if (!canDraft(state, playerId, cardId, cards)) {
    throw new Error(`Cannot draft card ${cardId}`);
  }
  return produce(state, (draft) => {
    const player = draft.players[playerId]!;
    Object.assign(player, spend(player, card.cost));
    player.hand.push(cardId);
    const idx = draft.market.indexOf(cardId);
    if (idx >= 0) draft.market.splice(idx, 1);
  });
}

export function canPlayCard(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
): boolean {
  const player = state.players[playerId];
  return !!player && player.hand.includes(cardId);
}

export function applyPlay(
  state: GameState,
  playerId: PlayerId,
  cardId: CardId,
  cards: CardDefinition[],
  rng: Rng,
  targetDieId?: string,
  targetRegionId?: string,
): GameState {
  const card = cards.find((c) => c.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}`);
  if (!canPlayCard(state, playerId, cardId)) {
    throw new Error(`Cannot play card ${cardId}`);
  }
  return produce(state, (draft) => {
    const player = draft.players[playerId]!;
    const idx = player.hand.indexOf(cardId);
    if (idx >= 0) player.hand.splice(idx, 1);
    applyEffect(draft, playerId, card.effect, rng, targetDieId, targetRegionId);
  });
}

function applyEffect(
  draft: GameState,
  playerId: PlayerId,
  effect: CardEffect,
  rng: Rng,
  targetDieId?: string,
  targetRegionId?: string,
): void {
  const player = draft.players[playerId]!;
  switch (effect.kind) {
    case 'gain-resource':
      player.resources[effect.resource] += effect.amount;
      break;
    case 'gain-vp':
      player.vp += effect.amount;
      break;
    case 'reroll-die': {
      const eligible = player.dice.filter(
        (d) => d.location.kind === 'barracks' && d.faceValue !== null,
      );
      if (eligible.length === 0) return;
      const target = rng.pick(eligible);
      const diceCopy: Die[] = player.dice.map((d) => (d.id === target.id ? rollDie(d, rng) : d));
      player.dice = diceCopy;
      break;
    }
    case 'modify-die': {
      const eligible = player.dice.filter(
        (d) => d.location.kind === 'barracks' && d.faceValue !== null,
      );
      if (eligible.length === 0) return;
      const target = rng.pick(eligible);
      const die = player.dice.find((d) => d.id === target.id)!;
      if (die.faceValue === null) return;
      const next = Math.max(1, Math.min(6, die.faceValue + effect.delta));
      die.faceValue = next;
      break;
    }

    case 'combine-bonus':
      // Flag cleared at end of round; affects the next combine action this round.
      player.hasCombineBonus = true;
      break;

    case 'lock-region': {
      // Lock target region; opponents can't place there this round.
      // Auto-target: pick the highest-VP region that already has our die on it,
      // OR the highest-VP region with no current enemy dice.
      const regionId = targetRegionId ?? pickBestLockTarget(draft, playerId);
      if (regionId) {
        draft.lockedRegions[regionId] = playerId;
      }
      break;
    }

    case 'steal-resource': {
      // Take 1 of target resource from a random opponent who has it.
      // Auto-pick: opponent with most resources of the effect's resource type.
      const resource = effect.resource ?? pickStealResource(draft, playerId, rng);
      if (!resource) break;
      let richest: { id: string; amount: number } | null = null;
      for (const [pid, opp] of Object.entries(draft.players)) {
        if (pid === playerId) continue;
        const amt = opp.resources[resource];
        if (amt > 0 && (!richest || amt > richest.amount)) {
          richest = { id: pid, amount: amt };
        }
      }
      if (richest) {
        draft.players[richest.id]!.resources[resource] -= 1;
        player.resources[resource] += 1;
      }
      // Draw a free card from the market as the second half of Steal.
      if (draft.market.length > 0) {
        const drawnId = draft.market[0]!;
        draft.market.splice(0, 1);
        player.hand.push(drawnId);
      }
      break;
    }

    case 'forced-march': {
      // Move one placed die to an adjacent region, ignoring requirements.
      // Auto-target: pick placed die with highest value, move to best adjacent region.
      const dieId = targetDieId ?? pickForcedMarchDie(draft, playerId);
      if (!dieId) break;
      const die = player.dice.find((d) => d.id === dieId);
      if (!die || die.location.kind !== 'region') break;
      const fromRegionId = die.location.regionId;
      const toRegionId = targetRegionId ?? pickForcedMarchTarget(draft, fromRegionId, playerId);
      if (!toRegionId) break;
      const fromRt = draft.regions[fromRegionId]!;
      const toRt = draft.regions[toRegionId]!;
      fromRt.placedDieIds = fromRt.placedDieIds.filter((id) => id !== dieId);
      die.location = { kind: 'region', regionId: toRegionId };
      toRt.placedDieIds.push(dieId);
      break;
    }
  }
}

// ── Auto-targeting helpers ──────────────────────────────────────────────────

function pickBestLockTarget(draft: GameState, playerId: string): string | null {
  // Prefer: a region we have dice on (protect our position), highest VP.
  let best: { id: string; vp: number } | null = null;
  for (const [regionId, region] of Object.entries(draft.regionDefs)) {
    if (draft.lockedRegions[regionId]) continue; // already locked
    const rt = draft.regions[regionId];
    if (!rt) continue;
    const weHaveDie = rt.placedDieIds.some((id) =>
      draft.players[playerId]?.dice.some((d) => d.id === id),
    );
    if (weHaveDie && (!best || region.vp > best.vp)) {
      best = { id: regionId, vp: region.vp };
    }
  }
  // Fallback: highest-VP uncontested unlocked region.
  if (!best) {
    for (const [regionId, region] of Object.entries(draft.regionDefs)) {
      if (draft.lockedRegions[regionId]) continue;
      if (!best || region.vp > best.vp) best = { id: regionId, vp: region.vp };
    }
  }
  return best?.id ?? null;
}

function pickStealResource(
  draft: GameState,
  playerId: string,
  rng: Rng,
): import('./types').Resource | null {
  const resources: import('./types').Resource[] = ['iron', 'gold', 'essence'];
  // Pick the resource where opponents collectively have the most.
  let best: { resource: import('./types').Resource; total: number } | null = null;
  for (const r of resources) {
    let total = 0;
    for (const [pid, opp] of Object.entries(draft.players)) {
      if (pid !== playerId) total += opp.resources[r];
    }
    if (total > 0 && (!best || total > best.total)) best = { resource: r, total };
  }
  return best?.resource ?? rng.pick(resources);
}

function pickForcedMarchDie(draft: GameState, playerId: string): string | null {
  const player = draft.players[playerId];
  if (!player) return null;
  // Pick the placed die with the highest face value (most valuable to move).
  let best: { id: string; val: number } | null = null;
  for (const die of player.dice) {
    if (die.location.kind !== 'region') continue;
    if (die.faceValue === null) continue;
    if (!best || die.faceValue > best.val) best = { id: die.id, val: die.faceValue };
  }
  return best?.id ?? null;
}

function pickForcedMarchTarget(
  draft: GameState,
  fromRegionId: string,
  playerId: string,
): string | null {
  const fromRegion = draft.regionDefs[fromRegionId];
  if (!fromRegion) return null;
  // Pick the adjacent region with the highest VP where we don't already have a die.
  let best: { id: string; vp: number } | null = null;
  for (const adjId of fromRegion.adjacency) {
    const adjRegion = draft.regionDefs[adjId];
    if (!adjRegion) continue;
    const rt = draft.regions[adjId];
    if (!rt) continue;
    // Don't march to locked regions.
    if (draft.lockedRegions[adjId] && draft.lockedRegions[adjId] !== playerId) continue;
    if (!best || adjRegion.vp > best.vp) best = { id: adjId, vp: adjRegion.vp };
  }
  return best?.id ?? null;
}

/**
 * End-of-round hand cleanup.
 * - Each player may keep up to HAND_LIMIT cards free.
 * - Extra cards cost 1 gold each to keep (per cardKeep cost in config).
 * - Cards the player can't afford to keep are discarded first.
 * - Random / AI strategy: keep up to what they can afford, front of hand priority.
 */
export function endOfRoundHandCleanup(
  state: GameState,
  costPerExtra?: { gold: number; iron: number; essence: number },
): GameState {
  return produce(state, (draft) => {
    for (const player of Object.values(draft.players)) {
      if (player.hand.length <= HAND_LIMIT) continue;

      const extra = player.hand.length - HAND_LIMIT;
      if (!costPerExtra || extra <= 0) {
        // No cost config or nothing extra — just trim.
        player.hand = player.hand.slice(0, HAND_LIMIT);
        continue;
      }

      // Determine how many extras the player can afford to pay for.
      const goldPerCard = costPerExtra.gold;
      const affordable = goldPerCard > 0
        ? Math.floor(player.resources.gold / goldPerCard)
        : extra;
      const keep = Math.min(extra, affordable);
      const totalKept = HAND_LIMIT + keep;

      // Spend gold for kept extras.
      player.resources.gold = Math.max(0, player.resources.gold - keep * goldPerCard);
      player.hand = player.hand.slice(0, totalKept);
      if (keep > 0) {
        player.progress.cardsKeptThisGame += keep;
      }
    }
  });
}

/** Convenience: cost helper used by enumerate to filter affordable drafts. */
export function draftableCards(
  state: GameState,
  playerId: PlayerId,
  cards: CardDefinition[],
): CardId[] {
  const out: CardId[] = [];
  for (const id of state.market) {
    if (canDraft(state, playerId, id, cards)) out.push(id);
  }
  return out;
}

export function playableCards(state: GameState, playerId: PlayerId): CardId[] {
  return state.players[playerId]?.hand.slice() ?? [];
}

// re-export so tests can introspect
export { HAND_LIMIT, MARKET_SIZE };
