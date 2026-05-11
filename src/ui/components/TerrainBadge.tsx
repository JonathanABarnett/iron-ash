// Terrain badge — fetched by scripts/fetch-art.ts into public/art/terrains/.
// Same fallback strategy as FactionEmblem so missing files don't break layout.

import { useState } from 'react';
import type { Terrain } from '@engine/types';

const TERRAIN_LABELS: Record<Terrain, string> = {
  fortress: 'Fortress',
  forest: 'Forest',
  mountain: 'Mountain',
  swamp: 'Swamp',
  plains: 'Plains',
  ruins: 'Ruins',
};

export function TerrainBadge({
  terrain,
  size = 24,
  className = '',
}: {
  terrain: Terrain;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = TERRAIN_LABELS[terrain];

  if (failed) {
    return (
      <div
        className={`inline-flex items-center justify-center rounded bg-neutral-800 text-[10px] font-semibold uppercase text-neutral-400 ${className}`}
        style={{ width: size, height: size }}
        title={label}
      >
        {label.slice(0, 1)}
      </div>
    );
  }

  return (
    <img
      src={`/art/terrains/${terrain}.jpg`}
      alt={`${label} terrain`}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`inline-block rounded object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function terrainLabel(t: Terrain): string {
  return TERRAIN_LABELS[t];
}
