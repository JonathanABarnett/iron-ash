// Faction emblem — loads from public/art/factions/ if available,
// falls back to the pure-SVG FactionCrest illustration.

import { useState } from 'react';
import type { FactionId } from '@engine/types';
import { FactionCrest } from './FactionCrest';

const FACTION_LABELS: Record<FactionId, string> = {
  warriors: 'Warriors', assassins: 'Assassins', mages: 'Mages',
  necromancers: 'Necromancers', merchants: 'Merchants', rangers: 'Rangers',
  paladins: 'Paladins', beastmasters: 'Beastmasters',
};

export function FactionEmblem({ factionId, size = 32, className = '' }: {
  factionId: FactionId; size?: number; className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = FACTION_LABELS[factionId];

  if (failed) {
    return <FactionCrest factionId={factionId} size={size} className={className} />;
  }

  return (
    <img
      // Prefix with Vite's BASE_URL so the path resolves correctly under /iron-ash/ on GH Pages
      src={`${import.meta.env.BASE_URL}art/factions/${factionId}.jpg`}
      alt={`${label} emblem`}
      width={size} height={size}
      onError={() => setFailed(true)}
      className={`inline-block rounded object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function factionLabel(id: FactionId): string {
  return FACTION_LABELS[id];
}
