// Pure-SVG resource gems — iron anvil, gold coin, essence crystal.
// Drop-in replacement for ResourceIcon with zero network requests.

import type { Resource } from '@engine/types';

interface Props { resource: Resource; size?: number; className?: string; }

export function ResourceGem({ resource, size = 20, className = '' }: Props) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
      {GEM_SVG[resource]}
    </svg>
  );
}

const GEM_SVG: Record<Resource, React.ReactNode> = {

  // Iron — angular shield with crossed hammers feel
  iron: (
    <>
      <defs>
        <linearGradient id="iron-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
      </defs>
      {/* Shield body */}
      <path d="M12 2 L21 6 L21 13 Q21 19 12 22 Q3 19 3 13 L3 6 Z" fill="url(#iron-g)" />
      {/* Shield highlight */}
      <path d="M12 3.5 L19.5 7 L19.5 13 Q19.5 17.5 12 20" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1" />
      {/* Cross emblem */}
      <rect x="11" y="7" width="2" height="9" rx="0.5" fill="#1e293b" />
      <rect x="8" y="11" width="8" height="2" rx="0.5" fill="#1e293b" />
      {/* Rivet corners */}
      <circle cx="12" cy="7" r="1" fill="#64748b" />
    </>
  ),

  // Gold — coin with radiant lines
  gold: (
    <>
      <defs>
        <radialGradient id="gold-g" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>
        <radialGradient id="gold-shine" cx="30%" cy="25%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.6)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      {/* Coin body */}
      <circle cx="12" cy="12" r="9.5" fill="#92400e" />
      <circle cx="12" cy="12" r="8.5" fill="url(#gold-g)" />
      {/* Shine overlay */}
      <circle cx="12" cy="12" r="8.5" fill="url(#gold-shine)" />
      {/* Crown symbol */}
      <path d="M8 14 L8 11 L10 13 L12 10 L14 13 L16 11 L16 14 Z" fill="#78350f" />
      {/* Edge bevel */}
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="#fbbf24" strokeWidth="0.5" />
      {/* Sparkle */}
      <path d="M18 5 L18.5 6.5 L20 7 L18.5 7.5 L18 9 L17.5 7.5 L16 7 L17.5 6.5 Z"
        fill="#fde68a" opacity="0.9" />
    </>
  ),

  // Essence — arcane teardrop crystal
  essence: (
    <>
      <defs>
        <linearGradient id="ess-g" x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="#e879f9" />
          <stop offset="50%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#581c87" />
        </linearGradient>
        <linearGradient id="ess-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.5)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      {/* Crystal body — teardrop */}
      <path d="M12 2 Q18 8 18 14 Q18 20 12 22 Q6 20 6 14 Q6 8 12 2 Z" fill="url(#ess-g)" />
      {/* Facet lines */}
      <path d="M12 2 L12 22" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
      <path d="M12 2 L18 14" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
      <path d="M12 2 L6 14" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5" />
      {/* Shine */}
      <path d="M12 2 Q15 6 16 12 Q14 7 12 5 Q10 7 8 12 Q9 6 12 2 Z" fill="url(#ess-shine)" />
      {/* Inner glow */}
      <ellipse cx="12" cy="14" rx="3" ry="4" fill="#c026d3" opacity="0.3" />
      {/* Sparkles */}
      <circle cx="9" cy="8" r="0.8" fill="white" opacity="0.7" />
      <circle cx="14" cy="6" r="0.5" fill="white" opacity="0.5" />
    </>
  ),
};

// Compact resource row with gem + count
export function ResourceRow({ iron, gold, essence, size = 16 }: {
  iron: number; gold: number; essence: number; size?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <ResourceCount resource="iron"    value={iron}    size={size} />
      <ResourceCount resource="gold"    value={gold}    size={size} />
      <ResourceCount resource="essence" value={essence} size={size} />
    </div>
  );
}

const RES_STYLE: Record<Resource, { bg: string; border: string; text: string }> = {
  iron:    { bg: 'bg-slate-900/80',   border: 'border-slate-600/40',  text: 'text-slate-300' },
  gold:    { bg: 'bg-amber-950/70',   border: 'border-amber-700/40',  text: 'text-amber-200' },
  essence: { bg: 'bg-violet-950/70',  border: 'border-violet-700/40', text: 'text-violet-200' },
};

const RESOURCE_TOOLTIP: Record<Resource, string> = {
  iron:    'Iron ⚙ — funds die upgrades (2 iron + 1 gold) and structures. Most factions earn +1 per round passively.',
  gold:    'Gold 🪙 — pays for mercenaries, cards, and barracks expansion. Mercs cost 2–3 gold; the Specialist costs 2 in rounds 1–2.',
  essence: 'Essence 💎 — powers Arcane Spires (3 essence, 2VP) and certain card effects. Cap: 8 per resource.',
};

export function ResourceCount({
  resource, value, size = 14, pulsed = false,
}: { resource: Resource; value: number; size?: number; pulsed?: boolean }) {
  const s = RES_STYLE[resource];
  return (
    <div
      title={RESOURCE_TOOLTIP[resource]}
      className={`inline-flex cursor-help items-center gap-1 rounded-lg border px-2 py-0.5 ${s.bg} ${s.border} ${pulsed ? 'resource-pop' : ''}`}
    >
      <ResourceGem resource={resource} size={size} />
      <span className={`tabular-nums font-bold text-[11px] ${s.text}`}>{value}</span>
    </div>
  );
}
