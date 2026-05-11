// Resource icon — fetched by scripts/fetch-art.ts into public/art/resources/.

import { useState } from 'react';
import type { Resource } from '@engine/types';

const RESOURCE_LABELS: Record<Resource, string> = {
  iron: 'Iron',
  gold: 'Gold',
  essence: 'Essence',
};

export function ResourceIcon({
  resource,
  size = 20,
  className = '',
}: {
  resource: Resource;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = RESOURCE_LABELS[resource];

  if (failed) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-neutral-800 text-[9px] font-semibold uppercase text-neutral-400 ${className}`}
        style={{ width: size, height: size }}
        title={label}
      >
        {label.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={`/art/resources/${resource}.jpg`}
      alt={`${label} resource`}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`inline-block rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function resourceLabel(r: Resource): string {
  return RESOURCE_LABELS[r];
}
