// Faction crests — unique pure-SVG sigils for each faction.
// Used as fallback when faction .jpg isn't present, or standalone decorations.

import type { FactionId } from '@engine/types';

interface Props { factionId: FactionId; size?: number; className?: string; }

export function FactionCrest({ factionId, size = 40, className = '' }: Props) {
  const { bg, accent, symbol } = CRESTS[factionId];
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className}>
      <defs>
        <radialGradient id={`crest-bg-${factionId}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.3" />
          <stop offset="100%" stopColor={bg} stopOpacity="1" />
        </radialGradient>
      </defs>
      {/* Hexagonal shield base */}
      <path d="M20 2 L36 11 L36 29 L20 38 L4 29 L4 11 Z"
        fill={`url(#crest-bg-${factionId})`}
        stroke={accent} strokeWidth="1" opacity="0.9"
      />
      {/* Shine */}
      <path d="M20 2 L36 11 L36 20 Q28 6 20 4 Q12 6 4 20 L4 11 Z"
        fill="rgba(255,255,255,0.06)"
      />
      {/* Faction symbol */}
      {symbol}
    </svg>
  );
}

const CRESTS: Record<FactionId, { bg: string; accent: string; symbol: React.ReactNode }> = {

  warriors: {
    bg: '#1a0a00', accent: '#f97316',
    symbol: (
      <>
        {/* Crossed swords */}
        <line x1="12" y1="28" x2="28" y2="12" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="28" y1="28" x2="12" y2="12" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
        {/* Guard */}
        <line x1="10" y1="19.5" x2="15" y2="19.5" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="25" y1="19.5" x2="30" y2="19.5" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round" />
        {/* Pommel dots */}
        <circle cx="12" cy="28" r="1.5" fill="#fb923c" />
        <circle cx="28" cy="28" r="1.5" fill="#fb923c" />
      </>
    ),
  },

  assassins: {
    bg: '#0a0a12', accent: '#6366f1',
    symbol: (
      <>
        {/* Dagger */}
        <path d="M20 8 L22 20 L20 28 L18 20 Z" fill="#818cf8" />
        <path d="M20 8 L21 12 L20 11 L19 12 Z" fill="#e0e7ff" />
        {/* Guard */}
        <rect x="15" y="20" width="10" height="2" rx="1" fill="#6366f1" />
        {/* Shadow wings */}
        <path d="M20 16 Q12 14 10 20 Q14 17 20 18" fill="#4338ca" opacity="0.6" />
        <path d="M20 16 Q28 14 30 20 Q26 17 20 18" fill="#4338ca" opacity="0.6" />
        {/* Eye */}
        <ellipse cx="20" cy="15" rx="2" ry="1.5" fill="#c7d2fe" opacity="0.8" />
        <circle cx="20" cy="15" r="0.8" fill="#1e1b4b" />
      </>
    ),
  },

  mages: {
    bg: '#05021a', accent: '#818cf8',
    symbol: (
      <>
        {/* Star of Arcana — 8-pointed */}
        {[0, 45, 90, 135].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const cos = Math.cos(rad), sin = Math.sin(rad);
          return (
            <line key={i}
              x1={20 - 10 * cos} y1={20 - 10 * sin}
              x2={20 + 10 * cos} y2={20 + 10 * sin}
              stroke="#818cf8" strokeWidth="2" strokeLinecap="round"
            />
          );
        })}
        {/* Centre orb */}
        <circle cx="20" cy="20" r="4" fill="#312e81" stroke="#a5b4fc" strokeWidth="1" />
        <circle cx="20" cy="20" r="2" fill="#c7d2fe" opacity="0.8" />
        {/* Sparkles */}
        <circle cx="14" cy="14" r="1" fill="#e0e7ff" opacity="0.5" />
        <circle cx="26" cy="14" r="0.7" fill="#e0e7ff" opacity="0.4" />
        <circle cx="14" cy="26" r="0.7" fill="#e0e7ff" opacity="0.4" />
        <circle cx="26" cy="26" r="1" fill="#e0e7ff" opacity="0.5" />
      </>
    ),
  },

  necromancers: {
    bg: '#040810', accent: '#34d399',
    symbol: (
      <>
        {/* Skull */}
        <circle cx="20" cy="17" r="7" fill="#064e3b" stroke="#34d399" strokeWidth="1" />
        {/* Eye sockets */}
        <ellipse cx="17" cy="16" rx="2" ry="2.5" fill="#022c22" />
        <ellipse cx="23" cy="16" rx="2" ry="2.5" fill="#022c22" />
        {/* Glowing eyes */}
        <circle cx="17" cy="16" r="1" fill="#10b981" opacity="0.8" />
        <circle cx="23" cy="16" r="1" fill="#10b981" opacity="0.8" />
        {/* Jaw */}
        <path d="M15 22 L15 24 L17 24 L17 22 L19 22 L19 24 L21 24 L21 22 L23 22 L23 24 L25 24 L25 22" fill="none" stroke="#34d399" strokeWidth="1.2" />
        {/* Halo of energy */}
        <circle cx="20" cy="17" r="9" fill="none" stroke="#34d399" strokeWidth="0.5" strokeDasharray="3 2" opacity="0.5" />
      </>
    ),
  },

  merchants: {
    bg: '#0a0700', accent: '#fbbf24',
    symbol: (
      <>
        {/* Coin stack */}
        <ellipse cx="20" cy="26" rx="7" ry="2.5" fill="#92400e" />
        <ellipse cx="20" cy="24" rx="7" ry="2.5" fill="#b45309" />
        <ellipse cx="20" cy="22" rx="7" ry="2.5" fill="#d97706" />
        <ellipse cx="20" cy="20" rx="7" ry="2.5" fill="#f59e0b" />
        <ellipse cx="20" cy="20" rx="7" ry="2.5" fill="none" stroke="#fbbf24" strokeWidth="0.5" />
        {/* $ symbol */}
        <text x="20" y="22" textAnchor="middle" fontSize="8" fontWeight="900" fill="#1c0a00">$</text>
        {/* Scales above */}
        <line x1="20" y1="9" x2="20" y2="15" stroke="#fbbf24" strokeWidth="1" />
        <line x1="13" y1="11" x2="27" y2="11" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13 11 L13 13 Q13 15 16 15 Q19 15 19 13 L19 11" fill="none" stroke="#f59e0b" strokeWidth="0.8" />
        <path d="M27 11 L27 13 Q27 15 24 15 Q21 15 21 13 L21 11" fill="none" stroke="#f59e0b" strokeWidth="0.8" />
      </>
    ),
  },

  rangers: {
    bg: '#021a07', accent: '#4ade80',
    symbol: (
      <>
        {/* Bow */}
        <path d="M12 8 Q8 20 12 32" fill="none" stroke="#86efac" strokeWidth="2" strokeLinecap="round" />
        {/* Bowstring */}
        <line x1="12" y1="8" x2="12" y2="32" stroke="#4ade80" strokeWidth="0.8" opacity="0.6" />
        {/* Arrow */}
        <line x1="12" y1="20" x2="28" y2="20" stroke="#4ade80" strokeWidth="1.5" strokeLinecap="round" />
        {/* Arrowhead */}
        <path d="M28 20 L24 17 L25 20 L24 23 Z" fill="#4ade80" />
        {/* Fletching */}
        <path d="M12 20 L10 17 L11 20 L10 23 Z" fill="#86efac" opacity="0.7" />
        {/* Leaf */}
        <path d="M18 14 Q22 12 22 18 Q22 24 18 26 Q14 24 14 18 Q14 12 18 14 Z" fill="#16a34a" opacity="0.4" />
      </>
    ),
  },

  paladins: {
    bg: '#0a0800', accent: '#fde68a',
    symbol: (
      <>
        {/* Radiant cross */}
        <rect x="18" y="8" width="4" height="20" rx="1" fill="#fbbf24" />
        <rect x="11" y="16" width="18" height="4" rx="1" fill="#fbbf24" />
        {/* Glow rays */}
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          const r1 = 8, r2 = 11;
          return (
            <line key={i}
              x1={20 + r1 * Math.cos(rad)} y1={20 + r1 * Math.sin(rad)}
              x2={20 + r2 * Math.cos(rad)} y2={20 + r2 * Math.sin(rad)}
              stroke="#fde68a" strokeWidth="0.8" opacity="0.5"
            />
          );
        })}
        {/* Centre gem */}
        <circle cx="20" cy="20" r="3" fill="#78350f" stroke="#fde68a" strokeWidth="0.8" />
        <circle cx="20" cy="20" r="1.5" fill="#fbbf24" opacity="0.9" />
      </>
    ),
  },

  beastmasters: {
    bg: '#0a0500', accent: '#fb923c',
    symbol: (
      <>
        {/* Beast pawprint */}
        {/* Main pad */}
        <ellipse cx="20" cy="23" rx="5.5" ry="4.5" fill="#fb923c" />
        {/* Toe pads */}
        <circle cx="14" cy="17" r="2.5" fill="#fb923c" />
        <circle cx="18" cy="14" r="2.5" fill="#fb923c" />
        <circle cx="22" cy="14" r="2.5" fill="#fb923c" />
        <circle cx="26" cy="17" r="2.5" fill="#fb923c" />
        {/* Claw marks */}
        <line x1="14" y1="14" x2="12" y2="11" stroke="#fed7aa" strokeWidth="1" strokeLinecap="round" />
        <line x1="18" y1="11" x2="17" y2="8" stroke="#fed7aa" strokeWidth="1" strokeLinecap="round" />
        <line x1="22" y1="11" x2="23" y2="8" stroke="#fed7aa" strokeWidth="1" strokeLinecap="round" />
        <line x1="26" y1="14" x2="28" y2="11" stroke="#fed7aa" strokeWidth="1" strokeLinecap="round" />
        {/* Texture on main pad */}
        <ellipse cx="20" cy="23" rx="5.5" ry="4.5" fill="none" stroke="#ea580c" strokeWidth="0.5" opacity="0.5" />
      </>
    ),
  },
};
