// VP Medallion — styled coin/badge showing victory points.
// Shows leader crown and gradient based on value.

interface Props { vp: number; isLeader?: boolean; size?: 'sm' | 'md' | 'lg'; }

export function VPMedallion({ vp, isLeader = false, size = 'md' }: Props) {
  const dim = size === 'sm' ? 36 : size === 'lg' ? 56 : 44;
  const fontSize = size === 'sm' ? 11 : size === 'lg' ? 18 : 14;
  const labelSize = size === 'sm' ? 6 : size === 'lg' ? 8 : 7;
  const cx = dim / 2, cy = dim / 2;
  const r = dim / 2 - 2;
  const inner = r - 3;

  // Colour tier: bronze / silver / gold / platinum based on VP
  const [outer, inner1, inner2] = vp >= 20
    ? ['#a78bfa', '#7c3aed', '#4c1d95']   // platinum/violet — high scorer
    : vp >= 12
      ? ['#fbbf24', '#f59e0b', '#92400e']  // gold
      : vp >= 6
        ? ['#94a3b8', '#64748b', '#334155'] // silver
        : ['#d97706', '#b45309', '#451a03']; // bronze

  return (
    <svg viewBox={`0 0 ${dim} ${dim}`} width={dim} height={dim}>
      <defs>
        <radialGradient id={`med-face-${vp}`} cx="40%" cy="35%" r="70%">
          <stop offset="0%" stopColor={inner1} />
          <stop offset="100%" stopColor={inner2} />
        </radialGradient>
        <radialGradient id={`med-shine-${vp}`} cx="30%" cy="20%" r="60%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>

      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r} fill={outer} />
      {/* Serrated/scalloped edge — decorative notches */}
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2 - Math.PI / 16;
        const x1 = cx + (r - 0.5) * Math.cos(angle);
        const y1 = cy + (r - 0.5) * Math.sin(angle);
        const x2 = cx + (r + 1.5) * Math.cos(angle);
        const y2 = cy + (r + 1.5) * Math.sin(angle);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={outer} strokeWidth="2" opacity="0.6" />;
      })}

      {/* Face */}
      <circle cx={cx} cy={cy} r={inner} fill={`url(#med-face-${vp})`} />
      {/* Shine */}
      <circle cx={cx} cy={cy} r={inner} fill={`url(#med-shine-${vp})`} />
      {/* Inner rim */}
      <circle cx={cx} cy={cy} r={inner} fill="none" stroke={outer} strokeWidth="0.5" opacity="0.5" />

      {/* VP number */}
      <text x={cx} y={cy + fontSize * 0.38}
        textAnchor="middle" fontSize={fontSize} fontWeight="900"
        fill="white" style={{ letterSpacing: '-0.03em' }}
      >{vp}</text>
      {/* VP label */}
      <text x={cx} y={cy + fontSize * 0.38 + labelSize + 1}
        textAnchor="middle" fontSize={labelSize} fontWeight="700"
        fill="rgba(255,255,255,0.55)" style={{ letterSpacing: '0.08em' }}
      >VP</text>

      {/* Crown for leader */}
      {isLeader && (
        <g transform={`translate(${cx - 5}, ${cy - inner + 1})`}>
          <path d="M0 5 L0 2 L2.5 4 L5 0 L7.5 4 L10 2 L10 5 Z" fill="#fbbf24" />
          <rect x="0" y="5" width="10" height="2" rx="0.5" fill="#f59e0b" />
        </g>
      )}
    </svg>
  );
}
