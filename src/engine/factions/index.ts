// Faction registry. Phase 1 just provides static FactionDefinition lookup.
// Faction-specific abilities (passive/active/merc relationships) land in Phase 2.

import type { FactionDefinition, FactionId } from '../types';

export class FactionRegistry {
  private readonly map: Map<FactionId, FactionDefinition>;

  constructor(definitions: readonly FactionDefinition[]) {
    this.map = new Map(definitions.map((d) => [d.id, d]));
  }

  get(id: FactionId): FactionDefinition {
    const def = this.map.get(id);
    if (!def) throw new Error(`Unknown faction: ${id}`);
    return def;
  }

  has(id: FactionId): boolean {
    return this.map.has(id);
  }

  all(): FactionDefinition[] {
    return Array.from(this.map.values());
  }
}
