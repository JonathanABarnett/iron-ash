// SVG map — rich terrain gradients, terrain illustrations, animated glows.

import type { GameState, Move, PlayerId, RegionId, Terrain } from '@engine/types';
import { TerrainInlineSVG } from './TerrainIllustration';

const GRID: Record<string, [col: number, row: number]> = {
  'iron-pass':       [0,0], 'black-citadel':   [1,0],
  'silverwood':      [2,0], 'marshlands':       [3,0],
  'whispering-vale': [0,1], 'skull-ruins':      [1,1],
  'stormwall-keep':  [2,1], 'goldhaven':        [3,1],
  'dragons-reach':   [0,2], 'mireborn-bog':     [1,2],
  'emerald-glade':   [2,2], 'crows-nest':       [3,2],
  'highspire':       [0,3], 'bonewatch':        [1,3],
  'verdant-grove':   [2,3], 'drownland':        [3,3],
};

const NODE_W = 158; const NODE_H = 96;
const GAP_X  = 14;  const GAP_Y  = 14;
const COL_STRIDE = NODE_W + GAP_X;
const ROW_STRIDE = NODE_H + GAP_Y;
const PAD  = 16;
const SVG_W = PAD * 2 + 4 * COL_STRIDE - GAP_X;
const SVG_H = PAD * 2 + 4 * ROW_STRIDE - GAP_Y;

function cx(col: number) { return PAD + col * COL_STRIDE; }
function cy(row: number) { return PAD + row * ROW_STRIDE; }
function midX(col: number) { return cx(col) + NODE_W / 2; }
function midY(row: number) { return cy(row) + NODE_H / 2; }

const TERRAIN_ICON: Record<string, string> = {
  fortress:'🏰', forest:'🌲', mountain:'⛰', swamp:'🌿', plains:'🌾', ruins:'🗿',
};

// Gradient stop pairs [light, dark]
const TERRAIN_GRAD: Record<string, [string, string]> = {
  fortress: ['#92400e','#3b1200'],
  forest:   ['#166534','#052a12'],
  mountain: ['#1e3a5f','#0c1526'],
  swamp:    ['#155e59','#042624'],
  plains:   ['#3f6212','#182700'],
  ruins:    ['#4c1d95','#17124a'],
};

const TERRAIN_ACCENT: Record<string, string> = {
  fortress: '#f97316', forest: '#4ade80', mountain: '#94a3b8',
  swamp:    '#2dd4bf', plains: '#a3e635', ruins:    '#c084fc',
};

// Per-player tints — p1 teal, p2 violet, p3 amber, p4 rose, p5+ blue, p6+ green
const PLAYER_PALETTE = ['#2dd4bf','#a78bfa','#fb923c','#f472b6','#60a5fa','#34d399'];
const playerColorCache: Record<PlayerId, string> = {};
function getPlayerColor(pid: PlayerId, state: GameState): string {
  if (!playerColorCache[pid]) {
    const idx = Object.keys(state.players).indexOf(pid);
    playerColorCache[pid] = PLAYER_PALETTE[idx % PLAYER_PALETTE.length] ?? '#9ca3af';
  }
  return playerColorCache[pid]!;
}

interface MapViewProps {
  state: GameState;
  humanMoves?: Move[];
  selectedDieId?: string | null;
  onRegionClick?: (regionId: RegionId, moves: Move[]) => void;
}

export function MapView({ state, humanMoves = [], selectedDieId, onRegionClick }: MapViewProps) {
  const humanTargetRegions = new Set<string>();
  for (const m of humanMoves) {
    const dieOk = !selectedDieId ||
      (m.kind === 'place'   && m.dieId === selectedDieId) ||
      (m.kind === 'combine' && m.dieIds.includes(selectedDieId as never)) ||
      (m.kind === 'battle'  && m.attackerDieId === selectedDieId);
    if (!dieOk) continue;
    if (m.kind === 'place' || m.kind === 'combine') humanTargetRegions.add(m.regionId);
    if (m.kind === 'battle') humanTargetRegions.add(m.targetRegionId);
  }

  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [id, region] of Object.entries(state.regionDefs)) {
    for (const adjId of region.adjacency) {
      const key = [id, adjId].sort().join('|');
      if (!seen.has(key)) { seen.add(key); edges.push([id, adjId]); }
    }
  }

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-white/[0.06] bg-[#06060e] shadow-xl shadow-black/60" style={{ maxWidth: 880 }}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="h-auto w-full">
        <defs>
          {/* Terrain gradients */}
          {Object.entries(TERRAIN_GRAD).map(([terrain, [light, dark]]) => (
            <linearGradient key={terrain} id={`grad-${terrain}`} x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0%"   stopColor={light} stopOpacity="1" />
              <stop offset="100%" stopColor={dark}  stopOpacity="1" />
            </linearGradient>
          ))}

          {/* Locked / greyed out gradient */}
          <linearGradient id="grad-locked" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#111118" />
            <stop offset="100%" stopColor="#0a0a10" />
          </linearGradient>

          {/* Playable teal glow filter */}
          <filter id="glow-teal" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feColorMatrix in="blur" type="matrix"
              values="0 0 0 0 0.08  0 0 0 0 0.72  0 0 0 0 0.65  0 0 0 0.8 0" result="teal" />
            <feMerge><feMergeNode in="teal" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Soft shadow for tiles */}
          <filter id="tile-shadow" x="-10%" y="-10%" width="120%" height="130%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.5" />
          </filter>

          {/* Garrison pulse animation */}
          <filter id="garrison-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>

          {/* Clip paths per tile */}
          {Object.keys(GRID).map((id) => {
            const pos = GRID[id]!;
            const x = cx(pos[0]), y = cy(pos[1]);
            return (
              <clipPath key={`clip-${id}`} id={`clip-${id}`}>
                <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={8} />
              </clipPath>
            );
          })}
        </defs>

        {/* ── Background grid ── */}
        <rect x={0} y={0} width={SVG_W} height={SVG_H} fill="url(#grad-locked)" opacity="0.3" />

        {/* ── Adjacency edges ── */}
        {edges.map(([a, b]) => {
          const ga = GRID[a], gb = GRID[b];
          if (!ga || !gb) return null;
          return (
            <line key={`${a}|${b}`}
              x1={midX(ga[0])} y1={midY(ga[1])}
              x2={midX(gb[0])} y2={midY(gb[1])}
              stroke="rgba(255,255,255,0.07)" strokeWidth={1.5} strokeDasharray="6 5"
            />
          );
        })}

        {/* ── Region tiles ── */}
        {Object.entries(state.regionDefs).map(([id, region]) => {
          const pos = GRID[id];
          if (!pos) return null;
          const [col, row] = pos;
          const x = cx(col), y = cy(row);
          const rt          = state.regions[id];
          const isLocked    = region.unlocksRound !== undefined && state.round < region.unlocksRound;
          const isPlayable  = humanTargetRegions.has(id);
          const cardLocked  = !!state.lockedRegions?.[id];
          const garrisonOwner = rt?.garrisonOwnerId;
          const garrisonCount = rt?.garrisonedDieIds.length ?? 0;
          const hasStructure  = !!rt?.structure;
          const accent  = TERRAIN_ACCENT[region.terrain] ?? '#6b7280';
          const fillId  = isLocked ? 'locked' : region.terrain;
          const border  = isPlayable ? '#14b8a6' : isLocked ? '#1f2030' : accent;
          const sw      = isPlayable ? 2.5 : region.isFortress ? 2 : 1.5;

          // Placed dice
          const placedDice: Array<{ val: number | null; ownerId: string }> = [];
          for (const dieId of rt?.placedDieIds ?? []) {
            for (const player of Object.values(state.players)) {
              const die = player.dice.find((d) => d.id === dieId);
              if (die) { placedDice.push({ val: die.faceValue, ownerId: player.id }); break; }
            }
          }

          const reqLabel =
            region.valueRequirement.kind === 'min'   ? `≥${region.valueRequirement.value}` :
            region.valueRequirement.kind === 'max'   ? `≤${region.valueRequirement.value}` :
            region.valueRequirement.kind === 'exact' ? `=${region.valueRequirement.value}` :
            `Σ≥${region.valueRequirement.value}`;

          return (
            <g key={id}
              style={{ cursor: isPlayable ? 'pointer' : 'default' }}
              filter={isLocked ? undefined : 'url(#tile-shadow)'}
              onClick={() => {
                if (!isPlayable || !onRegionClick) return;
                const moves = humanMoves.filter((m) =>
                  ((m.kind === 'place' || m.kind === 'combine') && m.regionId === id) ||
                  (m.kind === 'battle' && m.targetRegionId === id),
                );
                onRegionClick(id, moves);
              }}
            >
              {/* ── Outer glow ring for playable ── */}
              {isPlayable && (
                <>
                  <rect x={x-4} y={y-4} width={NODE_W+8} height={NODE_H+8}
                    rx={12} fill="none" stroke="#14b8a6" strokeWidth={1} opacity={0.3}
                    filter="url(#glow-teal)"
                  >
                    <animate attributeName="opacity" values="0.2;0.6;0.2" dur="1.8s" repeatCount="indefinite" />
                  </rect>
                  <rect x={x-2} y={y-2} width={NODE_W+4} height={NODE_H+4}
                    rx={10} fill="none" stroke="#14b8a6" strokeWidth={1.5} opacity={0.5}
                  />
                </>
              )}

              {/* ── Tile ── */}
              <rect x={x} y={y} width={NODE_W} height={NODE_H}
                rx={8} fill={`url(#grad-${fillId})`}
                stroke={border} strokeWidth={sw}
                opacity={isLocked ? 0.3 : 1}
              />

              {/* Terrain texture overlay — subtle diagonal lines */}
              {!isLocked && (
                <rect x={x} y={y} width={NODE_W} height={NODE_H}
                  rx={8} clipPath={`url(#clip-${id})`}
                  fill="none"
                  stroke={accent}
                  strokeWidth={0.3}
                  opacity={0.12}
                />
              )}

              {/* Terrain illustration watermark — bottom-right, soft */}
              {!isLocked && (
                <g opacity={0.18} clipPath={`url(#clip-${id})`}>
                  <TerrainInlineSVG
                    terrain={region.terrain as Terrain}
                    x={x + NODE_W - 46}
                    y={y + NODE_H - 44}
                    size={42}
                  />
                </g>
              )}

              {/* Fortress shimmer stripe */}
              {region.isFortress && !isLocked && (
                <rect x={x} y={y} width={NODE_W} height={4}
                  rx={0} fill={accent} opacity={0.35} clipPath={`url(#clip-${id})`}
                />
              )}

              {/* Card-locked overlay */}
              {cardLocked && (
                <rect x={x} y={y} width={NODE_W} height={NODE_H}
                  rx={8} fill="#7c3aed" opacity={0.08}
                />
              )}

              {/* ── Row 1: icon + name ── */}
              <text x={x+10} y={y+18} fontSize={15}>
                {isLocked ? '🔒' : TERRAIN_ICON[region.terrain] ?? '·'}
              </text>
              <text x={x+30} y={y+18}
                fontSize={11.5} fontWeight="700" letterSpacing="-0.01"
                fill={isLocked ? '#2a2a3a' : '#f0f0f8'}
              >
                {region.name.length > 13 ? region.name.slice(0, 12) + '…' : region.name}
              </text>

              {/* VP badge — top right */}
              <rect x={x+NODE_W-30} y={y+5} width={26} height={15} rx={5}
                fill={isLocked ? '#111' : accent} opacity={isLocked ? 0.2 : 0.2}
              />
              <text x={x+NODE_W-17} y={y+16} textAnchor="middle" fontSize={10} fontWeight="800"
                fill={isLocked ? '#2a2a3a' : accent}
              >
                {region.vp}VP
              </text>

              {/* ── Row 2: requirement + markers ── */}
              <text x={x+10} y={y+33} fontSize={10} fontWeight="600"
                fill={isLocked ? '#1f1f2e' : '#6b7280'}
              >
                {reqLabel}
                {region.isFortress && !isLocked ? '  🏰' : ''}
                {isLocked ? `  R${region.unlocksRound}` : ''}
                {cardLocked ? '  🔐' : ''}
              </text>

              {/* ── Garrison bar ── */}
              {garrisonCount > 0 && garrisonOwner && (() => {
                const color = getPlayerColor(garrisonOwner, state);
                return (
                  <g filter="url(#garrison-glow)">
                    <rect x={x+8} y={y+40} width={NODE_W-16} height={18} rx={4}
                      fill={color} opacity={0.13}
                    />
                    <rect x={x+8} y={y+40} width={NODE_W-16} height={18} rx={4}
                      fill="none" stroke={color} strokeWidth={0.7} opacity={0.4}
                    />
                    <circle cx={x+18} cy={y+49} r={5} fill={color} opacity={0.9} />
                    <text x={x+27} y={y+53} fontSize={9.5} fill={color} fontWeight="700">
                      {garrisonOwner} ×{garrisonCount}
                      {(rt?.heldRounds ?? 0) > 0 ? `  ·  ${rt?.heldRounds}r` : ''}
                    </text>
                  </g>
                );
              })()}

              {/* Structure badge */}
              {hasStructure && rt?.structure && (
                <g>
                  <rect x={x+NODE_W-60} y={y+38} width={52} height={14} rx={4}
                    fill="#78350f" opacity={0.6}
                  />
                  <text x={x+NODE_W-34} y={y+49} textAnchor="middle" fontSize={8.5} fill="#fbbf24" fontWeight="600">
                    🏗 {rt.structure.structureId.replace(/-/g,' ')}
                  </text>
                </g>
              )}

              {/* ── Placed dice row ── */}
              {placedDice.length > 0 && (
                <g>
                  {placedDice.slice(0, 7).map((d, i) => {
                    const color = getPlayerColor(d.ownerId, state);
                    const dx = x + 10 + i * 20;
                    const dy = y + NODE_H - 22;
                    return (
                      <g key={i}>
                        {/* Die face */}
                        <rect x={dx} y={dy} width={17} height={17} rx={4}
                          fill="#0e0e18" stroke={color} strokeWidth={1.5}
                        />
                        {/* Die pip — centre dot for value display */}
                        <text x={dx+8.5} y={dy+12} textAnchor="middle" fontSize={10} fontWeight="900" fill={color}>
                          {d.val ?? '?'}
                        </text>
                      </g>
                    );
                  })}
                  {placedDice.length > 7 && (
                    <text x={x + 10 + 7 * 20} y={y + NODE_H - 9} fontSize={8} fill="#6b7280">
                      +{placedDice.length - 7}
                    </text>
                  )}
                </g>
              )}

              {/* Click hint */}
              {isPlayable && (
                <text x={x+NODE_W-8} y={y+NODE_H-6} textAnchor="end" fontSize={8.5} fill="#2dd4bf" fontWeight="700" opacity={0.85}>
                  click ›
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
