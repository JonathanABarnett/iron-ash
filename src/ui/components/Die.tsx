// Die — CSS die component with proper pip layout and roll animations.
// Shows 1-6 pips, colour-coded by range tier, animates when rolling.

import { useEffect, useRef, useState } from 'react';
import type { DieRange } from '@engine/types';

// Pip positions for each face value [col 0-2, row 0-2]
const PIPS: Record<number, [number, number][]> = {
  1: [[1,1]],
  2: [[0,0],[2,2]],
  3: [[0,0],[1,1],[2,2]],
  4: [[0,0],[2,0],[0,2],[2,2]],
  5: [[0,0],[2,0],[1,1],[0,2],[2,2]],
  6: [[0,0],[2,0],[0,1],[2,1],[0,2],[2,2]],
};

// Colour per range tier
const RANGE_STYLE: Record<DieRange, { bg: string; border: string; pip: string; glow: string }> = {
  '1-3': { bg: 'linear-gradient(145deg,#2a2e3a 0%,#1c1f2a 100%)', border: '#4b5563', pip: '#94a3b8', glow: 'rgba(100,116,139,0.3)' },
  '2-5': { bg: 'linear-gradient(145deg,#1e2d4a 0%,#131d33 100%)', border: '#3b82f6', pip: '#93c5fd', glow: 'rgba(59,130,246,0.35)' },
  '3-6': { bg: 'linear-gradient(145deg,#3b2000 0%,#231200 100%)', border: '#f59e0b', pip: '#fcd34d', glow: 'rgba(245,158,11,0.4)' },
  '1-6': { bg: 'linear-gradient(145deg,#2d1b4a 0%,#1a0d2e 100%)', border: '#a855f7', pip: '#d8b4fe', glow: 'rgba(168,85,247,0.4)' },
};

interface DieProps {
  value: number | null;
  range: DieRange;
  size?: number;
  isSelected?: boolean;
  isRolling?: boolean;
  /** ms delay before the roll animation fires — use to stagger multiple dice */
  rollDelay?: number;
  onClick?: (() => void) | undefined;
  disabled?: boolean;
  className?: string;
}

export function Die({ value, range, size = 32, isSelected = false, isRolling = false, rollDelay = 0, onClick, disabled = false, className = '' }: DieProps) {
  const style = RANGE_STYLE[range] ?? RANGE_STYLE['1-3'];
  const prevValue = useRef(value);
  const [animClass, setAnimClass] = useState('');

  useEffect(() => {
    if (value !== prevValue.current) {
      setAnimClass('die-land');
      const t = setTimeout(() => setAnimClass(''), 300);
      prevValue.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  const pips = value !== null ? (PIPS[value] ?? []) : [];
  const pipSize = Math.max(3, Math.round(size * 0.14));
  const pad     = Math.round(size * 0.14);
  const cell    = Math.round((size - pad * 2) / 3);

  return (
    <button
      type="button"
      disabled={disabled || !onClick}
      onClick={onClick}
      title={value !== null ? `${range} · face ${value}` : `${range} · unrolled`}
      className={`relative shrink-0 rounded-lg transition-all select-none focus:outline-none ${
        onClick && !disabled ? 'cursor-pointer active:scale-95' : 'cursor-default'
      } ${animClass} ${isRolling ? 'die-rolling' : ''} ${className}`}
      style={{
        width: size, height: size,
        background: style.bg,
        border: `${isSelected ? 2.5 : 1.5}px solid ${isSelected ? '#14b8a6' : style.border}`,
        boxShadow: isSelected
          ? `0 0 0 2px rgba(20,184,166,0.4), inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px ${style.glow}`
          : `inset 0 1px 0 rgba(255,255,255,0.07), 0 2px 6px ${style.glow}`,
        animationDelay: isRolling && rollDelay > 0 ? `${rollDelay}ms` : undefined,
      }}
    >
      {/* Pips */}
      {value !== null ? (
        <div className="absolute inset-0" style={{ padding: pad }}>
          {pips.map(([c, r], i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{
                width: pipSize, height: pipSize,
                left: pad + c * cell + cell / 2 - pipSize / 2,
                top:  pad + r * cell + cell / 2 - pipSize / 2,
                background: style.pip,
                boxShadow: `0 0 3px ${style.glow}`,
              }}
            />
          ))}
        </div>
      ) : (
        /* Unrolled — show range label */
        <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold opacity-40" style={{ color: style.pip }}>
          {range}
        </span>
      )}
    </button>
  );
}

/** Compact inline die indicator (no interaction) */
export function DiePip({ value, range, size = 22 }: { value: number | null; range: DieRange; size?: number }) {
  return <Die value={value} range={range} size={size} disabled />;
}
