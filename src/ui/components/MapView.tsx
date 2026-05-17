// MapView — steam branch. Organic continent map replacing the 4×4 grid.
//
// 16 regions defined as irregular quadrilaterals sharing exact edge vertices.
// Regions sit on a sea background with mountain decorations, a river, and
// animated glow for playable tiles. Drop-in replacement for v1 MapView.

import type { GameState, Move, PlayerId, RegionId, Terrain } from '@engine/types';
import { TerrainInlineSVG } from './TerrainIllustration';

// ─── Continent vertex coordinates ─────────────────────────────────────────────
// Every pair of adjacent regions shares exact vertices so there are no gaps.
// The outer perimeter is deliberately slightly irregular (coastline feel).

type V = readonly [number, number];

// Outer perimeter — clockwise from top-left
const TL: V = [28,  32];   const T1: V = [205, 16];  const T2: V = [400, 22];
const T3: V = [578, 16];   const TR: V = [812, 32];
const R1: V = [818, 154];  const R2: V = [822, 302];  const R3: V = [816, 440];
const BR: V = [812, 530];  const B3: V = [578, 540];  const B2: V = [400, 538];
const B1: V = [200, 540];  const BL: V = [28,  532];
const L3: V = [22,  438];  const L2: V = [16,  306];  const L1: V = [20,  162];

// Interior intersections — col × row (1-indexed)
const I11: V = [208, 158];  const I12: V = [196, 308];  const I13: V = [210, 436];
const I21: V = [398, 150];  const I22: V = [390, 304];  const I23: V = [402, 433];
const I31: V = [574, 154];  const I32: V = [565, 306];  const I33: V = [575, 438];

// Full continent outline (for clip path & background decoration)
const CONTINENT_OUTLINE = [TL,T1,T2,T3,TR,R1,R2,R3,BR,B3,B2,B1,BL,L3,L2,L1]
  .map(([x,y]) => `${x},${y}`).join(' ');

// ─── Region layout ─────────────────────────────────────────────────────────────

function pts(...vs: V[]) { return vs.map(([x,y]) => `${x},${y}`).join(' '); }
function mid(...vs: V[]): V {
  return [
    Math.round(vs.reduce((s,[x])=>s+x,0)/vs.length),
    Math.round(vs.reduce((s,[,y])=>s+y,0)/vs.length),
  ] as const;
}

type RegionShape = { poly: string; cx: number; cy: number };

const SHAPES: Record<string, RegionShape> = (() => {
  const mk = (...vs: V[]): RegionShape => {
    const [cx,cy] = mid(...vs);
    return { poly: pts(...vs), cx, cy };
  };
  return {
    'iron-pass':       mk(TL, T1, I11, L1),
    'black-citadel':   mk(T1, T2, I21, I11),
    'silverwood':      mk(T2, T3, I31, I21),
    'marshlands':      mk(T3, TR, R1, I31),
    'whispering-vale': mk(L1, I11, I12, L2),
    'skull-ruins':     mk(I11, I21, I22, I12),
    'stormwall-keep':  mk(I21, I31, I32, I22),
    'goldhaven':       mk(I31, R1, R2, I32),
    'dragons-reach':   mk(L2, I12, I13, L3),
    'mireborn-bog':    mk(I12, I22, I23, I13),
    'emerald-glade':   mk(I22, I32, I33, I23),
    'crows-nest':      mk(I32, R2, R3, I33),
    'highspire':       mk(L3, I13, B1, BL),
    'bonewatch':       mk(I13, I23, B2, B1),
    'verdant-grove':   mk(I23, I33, B3, B2),
    'drownland':       mk(I33, R3, BR, B3),
  };
})();

// ─── Visual constants ──────────────────────────────────────────────────────────

const TERRAIN_GRAD: Record<string, [string, string]> = {
  fortress: ['#92400e','#3b1200'],
  forest:   ['#14532d','#052e16'],
  mountain: ['#1c3a5a','#0b1e36'],
  swamp:    ['#134e4a','#042f2e'],
  plains:   ['#3d5f10','#1b2e05'],
  ruins:    ['#4a1d92','#1e1040'],
};

const TERRAIN_ACCENT: Record<string, string> = {
  fortress:'#f59e0b', forest:'#4ade80', mountain:'#93c5fd',
  swamp:'#2dd4bf',    plains:'#a3e635', ruins:'#c084fc',
};

const PLAYER_PALETTE = ['#2dd4bf','#a78bfa','#fb923c','#f472b6','#60a5fa','#34d399'];
const _colorCache: Record<string, string> = {};
function playerColor(pid: PlayerId, state: GameState): string {
  if (!_colorCache[pid]) {
    const idx = Object.keys(state.players).indexOf(pid);
    _colorCache[pid] = PLAYER_PALETTE[idx % PLAYER_PALETTE.length] ?? '#9ca3af';
  }
  return _colorCache[pid]!;
}

// ─── Decorative paths ──────────────────────────────────────────────────────────

// River: flows roughly Stormwall → Mireborn → Drownland (center of map south)
const RIVER_PATH =
  'M 420,190 C 410,240 395,265 390,304 C 385,340 395,370 402,433 C 408,470 540,490 565,506';

// Mountain silhouettes for iron-pass and dragons-reach
const MOUNTAINS_NW = [
  'M 35,130 L 65,80 L 95,130',
  'M 70,135 L 110,65 L 148,130',
  'M 120,135 L 155,90 L 192,130',
];
const MOUNTAINS_SW = [
  'M 25,400 L 58,348 L 90,400',
  'M 70,405 L 112,335 L 153,405',
  'M 130,408 L 165,360 L 198,408',
];

// ─── Component ────────────────────────────────────────────────────────────────

interface MapViewProps {
  state: GameState;
  humanMoves?: Move[];
  selectedDieId?: string | null;
  onRegionClick?: (regionId: RegionId, moves: Move[]) => void;
}

export function MapView({ state, humanMoves = [], selectedDieId, onRegionClick }: MapViewProps) {
  const playable = new Set<string>();
  for (const m of humanMoves) {
    const dieOk = !selectedDieId
      || (m.kind === 'place'   && m.dieId === selectedDieId)
      || (m.kind === 'combine' && m.dieIds.includes(selectedDieId as never))
      || (m.kind === 'battle'  && m.attackerDieId === selectedDieId);
    if (!dieOk) continue;
    if (m.kind === 'place'   || m.kind === 'combine') playable.add(m.regionId);
    if (m.kind === 'battle') playable.add(m.targetRegionId);
  }

  return (
    <div className="w-full overflow-x-auto rounded-2xl shadow-2xl shadow-black/70"
      style={{ background: '#060c18', border: '1px solid rgba(255,255,255,0.06)', maxWidth: 900 }}>
      <svg viewBox="0 0 840 560" className="h-auto w-full" style={{ display:'block' }}>
        <defs>
          {/* Sea */}
          <radialGradient id="sea" cx="50%" cy="50%" r="80%">
            <stop offset="0%"   stopColor="#0a1628" />
            <stop offset="100%" stopColor="#03080f" />
          </radialGradient>

          {/* Terrain fills */}
          {Object.entries(TERRAIN_GRAD).map(([t,[l,d]]) => (
            <linearGradient key={t} id={`tg-${t}`} x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%"   stopColor={l} />
              <stop offset="100%" stopColor={d} />
            </linearGradient>
          ))}

          {/* Locked region */}
          <linearGradient id="tg-locked" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#111320" />
            <stop offset="100%" stopColor="#08090e" />
          </linearGradient>

          {/* Continent-wide parchment vignette */}
          <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
          </radialGradient>

          {/* Teal glow for playable */}
          <filter id="glow-play" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b" />
            <feColorMatrix in="b" type="matrix"
              values="0 0 0 0 0.08  0 0 0 0 0.72  0 0 0 0 0.65  0 0 0 0.75 0" result="c"/>
            <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          {/* Fortress gold glow */}
          <filter id="glow-fort" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/>
            <feColorMatrix in="b" type="matrix"
              values="0 0 0 0 0.98  0 0 0 0 0.62  0 0 0 0 0.07  0 0 0 0.6 0" result="c"/>
            <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>

          {/* Tile drop shadow */}
          <filter id="tile-sh" x="-8%" y="-8%" width="116%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.6"/>
          </filter>

          {/* Text legibility shadow */}
          <filter id="txt-sh" x="-10%" y="-20%" width="120%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.9"/>
          </filter>

          {/* Continent clip */}
          <clipPath id="continent-clip">
            <polygon points={CONTINENT_OUTLINE} />
          </clipPath>
        </defs>

        {/* ── Sea background ── */}
        <rect width={840} height={560} fill="url(#sea)" />

        {/* Wave lines in sea corners — decorative */}
        {[
          'M 0,40  Q 15,34 28,40',
          'M 0,60  Q 15,54 25,60',
          'M 812,40 Q 825,34 840,40',
          'M 814,60 Q 828,54 840,60',
          'M 0,510 Q 12,504 26,510',
          'M 0,525 Q 12,519 24,525',
          'M 814,510 Q 826,504 840,510',
          'M 815,525 Q 828,519 840,525',
        ].map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#1e4060" strokeWidth={1.2} opacity={0.5} />
        ))}

        {/* ── Continent base (slightly lighter than sea) ── */}
        <polygon points={CONTINENT_OUTLINE}
          fill="#0b1220" stroke="rgba(255,255,255,0.08)" strokeWidth={1.5} />

        {/* ── Mountain decorations — iron-pass (NW) & dragons-reach (SW) ── */}
        <g clipPath="url(#continent-clip)">
          {MOUNTAINS_NW.map((d,i) => (
            <path key={`mnw-${i}`} d={d} fill="none"
              stroke="#2a4a6a" strokeWidth={i===1 ? 2 : 1.5} opacity={0.4 + i*0.08} />
          ))}
          {MOUNTAINS_SW.map((d,i) => (
            <path key={`msw-${i}`} d={d} fill="none"
              stroke="#2a4a6a" strokeWidth={i===1 ? 2 : 1.5} opacity={0.4 + i*0.08} />
          ))}

          {/* ── River ── */}
          <path d={RIVER_PATH}
            fill="none" stroke="#0d4a6e" strokeWidth={3.5} opacity={0.35} strokeLinecap="round"/>
          <path d={RIVER_PATH}
            fill="none" stroke="#0ea5e9" strokeWidth={1.2} opacity={0.2} strokeLinecap="round"/>
        </g>

        {/* ── Region polygons ── */}
        {Object.entries(state.regionDefs).map(([id, region]) => {
          const shape = SHAPES[id];
          if (!shape) return null;
          const { poly, cx, cy } = shape;
          const rt           = state.regions[id];
          const isLocked     = region.unlocksRound !== undefined && state.round < region.unlocksRound;
          const isPlayable   = playable.has(id);
          const cardLocked   = !!state.lockedRegions?.[id];
          const garrison     = rt?.garrisonOwnerId;
          const garrisonDice = rt?.garrisonedDieIds.length ?? 0;
          const hasStructure = !!rt?.structure;
          const accent       = TERRAIN_ACCENT[region.terrain] ?? '#6b7280';
          const gradId       = isLocked ? 'tg-locked' : `tg-${region.terrain}`;
          const borderCol    = isPlayable ? '#14b8a6' : isLocked ? '#1a1e2a'
                             : region.isFortress ? '#d97706' : accent;
          const borderW      = isPlayable ? 2.5 : region.isFortress ? 2 : 1;

          const placedDice: Array<{ val: number|null; owner: string }> = [];
          for (const dieId of rt?.placedDieIds ?? []) {
            for (const p of Object.values(state.players)) {
              const d = p.dice.find(x => x.id === dieId);
              if (d) { placedDice.push({ val: d.faceValue, owner: p.id }); break; }
            }
          }

          const reqLabel =
            region.valueRequirement.kind === 'min'    ? `≥${region.valueRequirement.value}` :
            region.valueRequirement.kind === 'max'    ? `≤${region.valueRequirement.value}` :
            region.valueRequirement.kind === 'exact'  ? `=${region.valueRequirement.value}` :
            `Σ≥${region.valueRequirement.value}`;

          return (
            <g key={id}
              style={{ cursor: isPlayable ? 'pointer' : 'default' }}
              onClick={() => {
                if (!isPlayable || !onRegionClick) return;
                const moves = humanMoves.filter(m =>
                  ((m.kind==='place'||m.kind==='combine') && m.regionId===id) ||
                  (m.kind==='battle' && m.targetRegionId===id));
                onRegionClick(id, moves);
              }}
            >
              {/* Playable outer glow ring */}
              {isPlayable && (
                <polygon points={poly} fill="none"
                  stroke="#14b8a6" strokeWidth={6} opacity={0.15}
                  filter="url(#glow-play)">
                  <animate attributeName="opacity" values="0.1;0.3;0.1" dur="1.8s" repeatCount="indefinite"/>
                </polygon>
              )}

              {/* Fortress ambient glow */}
              {region.isFortress && !isLocked && (
                <polygon points={poly} fill="none"
                  stroke="#f59e0b" strokeWidth={4} opacity={0.08}
                  filter="url(#glow-fort)"/>
              )}

              {/* Tile fill */}
              <polygon points={poly}
                fill={`url(#${gradId})`}
                stroke={borderCol} strokeWidth={borderW}
                opacity={isLocked ? 0.28 : 1}
                filter={isLocked ? undefined : 'url(#tile-sh)'}
              />

              {/* Terrain illustration — bottom-right quadrant, watermark */}
              {!isLocked && (
                <g opacity={0.2} clipPath="url(#continent-clip)">
                  <TerrainInlineSVG
                    terrain={region.terrain as Terrain}
                    x={cx + 38} y={cy + 8} size={50}
                  />
                </g>
              )}

              {/* Fortress shimmer top stripe */}
              {region.isFortress && !isLocked && (
                <polygon points={poly}
                  fill={accent} opacity={0.06} clipPath="url(#continent-clip)"/>
              )}

              {/* ── Name row ── */}
              <text x={cx - 68} y={cy - 38}
                fontSize={10.5} fontWeight="700" letterSpacing="0.01"
                fill={isLocked ? '#252540' : '#eeeef8'}
                filter="url(#txt-sh)">
                {region.name.length > 14 ? region.name.slice(0,13)+'…' : region.name}
              </text>

              {/* VP badge */}
              {!isLocked && (
                <>
                  <rect x={cx+52} y={cy-52} width={26} height={15} rx={5}
                    fill={accent} opacity={0.18}/>
                  <text x={cx+65} y={cy-41} textAnchor="middle"
                    fontSize={9.5} fontWeight="800" fill={accent} filter="url(#txt-sh)">
                    {region.vp}VP
                  </text>
                </>
              )}

              {/* Lock round indicator */}
              {isLocked && (
                <text x={cx} y={cy-38} textAnchor="middle"
                  fontSize={9} fill="#2a2a40" fontWeight="600">
                  🔒 R{region.unlocksRound}
                </text>
              )}

              {/* Requirement + fortress icon */}
              {!isLocked && (
                <text x={cx - 68} y={cy - 25}
                  fontSize={9.5} fill={accent} fontWeight="600" opacity={0.8}
                  filter="url(#txt-sh)">
                  {reqLabel}{region.isFortress ? '  🏰' : ''}{cardLocked ? '  🔐' : ''}
                </text>
              )}

              {/* ── Garrison bar ── */}
              {garrisonDice > 0 && garrison && (() => {
                const col = playerColor(garrison, state);
                return (
                  <g>
                    <rect x={cx-68} y={cy-10} width={140} height={18} rx={4}
                      fill={col} opacity={0.12}/>
                    <rect x={cx-68} y={cy-10} width={140} height={18} rx={4}
                      fill="none" stroke={col} strokeWidth={0.7} opacity={0.35}/>
                    <circle cx={cx-56} cy={cy+1} r={5} fill={col} opacity={0.85}/>
                    <text x={cx-46} y={cy+5}
                      fontSize={9} fill={col} fontWeight="700" filter="url(#txt-sh)">
                      {garrison} ×{garrisonDice}
                      {(rt?.heldRounds??0)>0 ? `  ·  ${rt?.heldRounds}r` : ''}
                    </text>
                  </g>
                );
              })()}

              {/* Structure badge */}
              {hasStructure && rt?.structure && (
                <g>
                  <rect x={cx+20} y={cy-10} width={60} height={14} rx={3}
                    fill="#78350f" opacity={0.7}/>
                  <text x={cx+50} y={cy-1} textAnchor="middle"
                    fontSize={8} fill="#fbbf24" fontWeight="600">
                    🏗 {rt.structure.structureId.replace(/-/g,' ')}
                  </text>
                </g>
              )}

              {/* ── Placed dice ── */}
              {placedDice.length > 0 && (
                <g>
                  {placedDice.slice(0,7).map((d,i) => {
                    const col = playerColor(d.owner, state);
                    const dx = cx - 68 + i * 22;
                    const dy = cy + 15;
                    return (
                      <g key={i}>
                        <rect x={dx} y={dy} width={18} height={18} rx={4}
                          fill="#08080e" stroke={col} strokeWidth={1.5}/>
                        <text x={dx+9} y={dy+13} textAnchor="middle"
                          fontSize={10} fontWeight="900" fill={col}>
                          {d.val ?? '?'}
                        </text>
                      </g>
                    );
                  })}
                  {placedDice.length > 7 && (
                    <text x={cx-68+7*22+4} y={cy+27}
                      fontSize={8} fill="#6b7280">+{placedDice.length-7}</text>
                  )}
                </g>
              )}

              {/* Click hint */}
              {isPlayable && (
                <text x={cx+76} y={cy+35} textAnchor="end"
                  fontSize={8} fill="#2dd4bf" fontWeight="700" opacity={0.9}>
                  click ›
                </text>
              )}

              {/* Playable border pulse */}
              {isPlayable && (
                <polygon points={poly} fill="none"
                  stroke="#14b8a6" strokeWidth={2}>
                  <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="1.8s" repeatCount="indefinite"/>
                </polygon>
              )}
            </g>
          );
        })}

        {/* ── Continent vignette overlay ── */}
        <polygon points={CONTINENT_OUTLINE} fill="url(#vignette)" style={{ pointerEvents:'none' }}/>

        {/* ── Map border / frame ── */}
        <rect x={1} y={1} width={838} height={558} rx={10}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={2}/>
      </svg>
    </div>
  );
}
