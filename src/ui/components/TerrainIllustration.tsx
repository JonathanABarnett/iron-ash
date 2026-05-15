// Pure-SVG terrain illustrations — one unique icon per terrain type.
// Used inline inside the MapView SVG canvas and standalone.

import type { Terrain } from '@engine/types';

interface Props { terrain: Terrain; size?: number; opacity?: number; }

export function TerrainIllustration({ terrain, size = 32, opacity = 1 }: Props) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={{ opacity }}>
      {TERRAIN_SVG[terrain] ?? TERRAIN_SVG.plains}
    </svg>
  );
}

// ── Inline SVG fragment per terrain ─────────────────────────────────────────
// Used inside an existing <svg> canvas via <g> wrapping — pass x/y offset.

export function TerrainInlineSVG({ terrain, x, y, size = 28 }: {
  terrain: Terrain; x: number; y: number; size?: number;
}) {
  const scale = size / 32;
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      {TERRAIN_SVG[terrain] ?? TERRAIN_SVG.plains}
    </g>
  );
}

// ── SVG drawing per terrain (32×32 viewBox) ──────────────────────────────────

const TERRAIN_SVG: Record<Terrain, React.ReactNode> = {

  // Castle tower with battlements
  fortress: (
    <>
      {/* Tower base */}
      <rect x="9" y="14" width="14" height="14" rx="1" fill="#b45309" />
      {/* Battlements */}
      <rect x="9" y="10" width="3" height="6" rx="0.5" fill="#d97706" />
      <rect x="14.5" y="10" width="3" height="6" rx="0.5" fill="#d97706" />
      <rect x="20" y="10" width="3" height="6" rx="0.5" fill="#d97706" />
      {/* Merlon gaps */}
      <rect x="12" y="12" width="2.5" height="4" fill="#451a03" />
      <rect x="17.5" y="12" width="2.5" height="4" fill="#451a03" />
      {/* Gate arch */}
      <path d="M13 28 L13 21 Q16 18 19 21 L19 28 Z" fill="#291000" />
      {/* Arrow slits */}
      <rect x="11" y="17" width="1.5" height="3.5" rx="0.3" fill="#1c0a00" />
      <rect x="19.5" y="17" width="1.5" height="3.5" rx="0.3" fill="#1c0a00" />
      {/* Flag */}
      <line x1="16" y1="10" x2="16" y2="4" stroke="#f59e0b" strokeWidth="1" />
      <path d="M16 4 L21 6.5 L16 9 Z" fill="#ef4444" />
    </>
  ),

  // Pine forest with layered canopy
  forest: (
    <>
      {/* Back tree */}
      <polygon points="24,28 21,28 25,18 27,18 31,10 27,10 30,4 22,4 25,10 21,10 25,18" fill="#14532d" opacity="0.6" />
      {/* Front tree */}
      <polygon points="16,28 8,28 12,21 9,21 14,13 11,13 16,5 21,13 18,13 23,21 20,21 24,28" fill="#16a34a" />
      {/* Trunk */}
      <rect x="14" y="25" width="4" height="4" rx="0.5" fill="#5c3d1e" />
      {/* Highlight on canopy tip */}
      <polygon points="16,5 18,9 14,9" fill="#4ade80" opacity="0.4" />
    </>
  ),

  // Mountain peak with snowcap
  mountain: (
    <>
      {/* Back peak */}
      <polygon points="24,28 16,8 32,28" fill="#1e3a5f" />
      {/* Main peak */}
      <polygon points="14,28 0,28 10,10 18,28" fill="#1e40af" opacity="0.6" />
      {/* Front centre peak */}
      <polygon points="16,28 4,28 16,6 28,28" fill="#2563eb" opacity="0.5" />
      {/* Snow cap */}
      <path d="M16 6 L12 13 Q14 11 16 12 Q18 11 20 13 Z" fill="white" opacity="0.85" />
      {/* Rock face highlight */}
      <line x1="16" y1="12" x2="14" y2="20" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
    </>
  ),

  // Swamp — murky water with cattails
  swamp: (
    <>
      {/* Water surface */}
      <ellipse cx="16" cy="25" rx="13" ry="4" fill="#0d4a47" />
      <path d="M5 25 Q10 22 16 25 Q22 28 27 25" fill="none" stroke="#14b8a6" strokeWidth="0.8" opacity="0.5" />
      {/* Cattail left */}
      <line x1="9" y1="28" x2="9" y2="10" stroke="#713f12" strokeWidth="1.5" />
      <ellipse cx="9" cy="10" rx="2" ry="5" fill="#92400e" />
      <ellipse cx="9" cy="7" rx="1" ry="2" fill="#d97706" opacity="0.6" />
      {/* Cattail centre */}
      <line x1="16" y1="28" x2="16" y2="7" stroke="#713f12" strokeWidth="1.5" />
      <ellipse cx="16" cy="7" rx="2" ry="5.5" fill="#78350f" />
      <ellipse cx="16" cy="4" rx="1" ry="2" fill="#d97706" opacity="0.7" />
      {/* Cattail right */}
      <line x1="23" y1="28" x2="23" y2="12" stroke="#713f12" strokeWidth="1.5" />
      <ellipse cx="23" cy="12" rx="2" ry="4.5" fill="#92400e" />
      {/* Bubbles */}
      <circle cx="12" cy="24" r="1" fill="none" stroke="#2dd4bf" strokeWidth="0.5" opacity="0.5" />
      <circle cx="20" cy="26" r="0.8" fill="none" stroke="#2dd4bf" strokeWidth="0.5" opacity="0.4" />
    </>
  ),

  // Plains — rolling hills with sun
  plains: (
    <>
      {/* Sky gradient area */}
      <path d="M0 20 Q8 12 16 16 Q24 20 32 14 L32 0 L0 0 Z" fill="#1a2e05" opacity="0.3" />
      {/* Sun */}
      <circle cx="24" cy="8" r="4" fill="#fbbf24" opacity="0.9" />
      <line x1="24" y1="2" x2="24" y2="0" stroke="#fbbf24" strokeWidth="1" opacity="0.5" />
      <line x1="30" y1="8" x2="32" y2="8" stroke="#fbbf24" strokeWidth="1" opacity="0.5" />
      <line x1="28.2" y1="3.8" x2="29.6" y2="2.4" stroke="#fbbf24" strokeWidth="1" opacity="0.4" />
      {/* Rolling hills */}
      <path d="M0 28 Q5 20 10 24 Q15 28 20 20 Q25 12 32 18 L32 32 L0 32 Z" fill="#365314" />
      <path d="M0 28 Q6 22 12 26 Q18 30 22 22 Q26 14 32 20 L32 32 L0 32 Z" fill="#4d7c0f" opacity="0.7" />
      {/* Grass blades */}
      <line x1="6" y1="27" x2="5" y2="23" stroke="#84cc16" strokeWidth="1" opacity="0.7" />
      <line x1="15" y1="27" x2="14" y2="23" stroke="#84cc16" strokeWidth="1" opacity="0.6" />
      <line x1="24" y1="26" x2="23" y2="22" stroke="#84cc16" strokeWidth="1" opacity="0.6" />
    </>
  ),

  // Ancient ruins — broken columns and rubble
  ruins: (
    <>
      {/* Ground/rubble */}
      <path d="M2 28 Q6 26 10 28 Q14 30 18 27 Q22 24 28 28 L30 32 L2 32 Z" fill="#1e1b4b" />
      {/* Broken stone blocks */}
      <rect x="3" y="26" width="5" height="3" rx="0.5" fill="#312e81" opacity="0.7" />
      <rect x="23" y="25" width="7" height="4" rx="0.5" fill="#312e81" opacity="0.5" />
      {/* Left column (broken) */}
      <rect x="7" y="14" width="5" height="14" rx="1" fill="#4c1d95" />
      <rect x="6" y="28" width="7" height="2" rx="0.5" fill="#6d28d9" />
      <rect x="6" y="12" width="7" height="3" rx="0.5" fill="#6d28d9" />
      {/* Right column (intact) */}
      <rect x="20" y="10" width="5" height="18" rx="1" fill="#4c1d95" />
      <rect x="19" y="8" width="7" height="3" rx="0.5" fill="#7c3aed" />
      <rect x="19" y="28" width="7" height="2" rx="0.5" fill="#7c3aed" />
      {/* Fallen column section */}
      <rect x="10" y="22" width="10" height="4" rx="1" fill="#3b0764" transform="rotate(-8,15,24)" />
      {/* Crack lines */}
      <path d="M10 14 L11 18 L9 20" fill="none" stroke="#c084fc" strokeWidth="0.5" opacity="0.4" />
      {/* Moss/glow */}
      <circle cx="22" cy="9" r="1" fill="#a855f7" opacity="0.5" />
    </>
  ),
};
