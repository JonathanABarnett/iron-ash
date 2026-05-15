// SVG-backed map of the 16 Iron & Ash regions on a 4×4 grid.
// Each region tile shows: terrain, name, VP, requirement, garrison, placed dice, structures.
// Placed dice are colour-coded per player for instant visual reads.

import type { GameState, Move, PlayerId, RegionId } from '@engine/types';

const GRID: Record<string, [col: number, row: number]> = {
  'iron-pass':       [0, 0], 'black-citadel':   [1, 0],
  'silverwood':      [2, 0], 'marshlands':       [3, 0],
  'whispering-vale': [0, 1], 'skull-ruins':      [1, 1],
  'stormwall-keep':  [2, 1], 'goldhaven':        [3, 1],
  'dragons-reach':   [0, 2], 'mireborn-bog':     [1, 2],
  'emerald-glade':   [2, 2], 'crows-nest':       [3, 2],
  'highspire':       [0, 3], 'bonewatch':        [1, 3],
  'verdant-grove':   [2, 3], 'drownland':        [3, 3],
};

// Bigger tiles for more readable text
const NODE_W = 148;
const NODE_H = 96;
const GAP_X  = 18;
const GAP_Y  = 18;
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
  fortress: '🏰', forest: '🌲', mountain: '⛰',
  swamp: '🌿', plains: '🌾', ruins: '🗿',
};

// Richer, more saturated background fills
const TERRAIN_FILL: Record<string, string> = {
  fortress: '#3b1200',
  forest:   '#052a12',
  mountain: '#0c1526',
  swamp:    '#042624',
  plains:   '#182700',
  ruins:    '#17124a',
};

// Brighter accent borders per terrain
const TERRAIN_BORDER: Record<string, string> = {
  fortress: '#ea580c',
  forest:   '#22c55e',
  mountain: '#94a3b8',
  swamp:    '#2dd4bf',
  plains:   '#84cc16',
  ruins:    '#a855f7',
};

// Per-player accent colours for dice ownership
const PLAYER_COLORS: Record<PlayerId, string> = {};
const PLAYER_PALETTE = ['#2dd4bf', '#a78bfa', '#fb923c', '#f472b6', '#60a5fa', '#34d399'];

function getPlayerColor(playerId: PlayerId, state: GameState): string {
  if (!PLAYER_COLORS[playerId]) {
    const idx = Object.keys(state.players).indexOf(playerId);
    PLAYER_COLORS[playerId] = PLAYER_PALETTE[idx % PLAYER_PALETTE.length] ?? '#9ca3af';
  }
  return PLAYER_COLORS[playerId]!;
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

  // De-duped edge list from adjacency data
  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [id, region] of Object.entries(state.regionDefs)) {
    for (const adjId of region.adjacency) {
      const key = [id, adjId].sort().join('|');
      if (!seen.has(key)) { seen.add(key); edges.push([id, adjId]); }
    }
  }

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-neutral-800/80 bg-neutral-950/80">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="h-auto w-full">
        <defs>
          {/* Teal glow filter for playable regions */}
          <filter id="glow-teal" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Adjacency lines */}
        {edges.map(([a, b]) => {
          const ga = GRID[a], gb = GRID[b];
          if (!ga || !gb) return null;
          return (
            <line key={`${a}|${b}`}
              x1={midX(ga[0])} y1={midY(ga[1])}
              x2={midX(gb[0])} y2={midY(gb[1])}
              stroke="#2d3748" strokeWidth={1.5} strokeDasharray="5 4"
            />
          );
        })}

        {/* Region tiles */}
        {Object.entries(state.regionDefs).map(([id, region]) => {
          const pos = GRID[id];
          if (!pos) return null;
          const [col, row] = pos;
          const x = cx(col), y = cy(row);
          const rt       = state.regions[id];
          const isLocked = region.unlocksRound !== undefined && state.round < region.unlocksRound;
          const isPlayable      = humanTargetRegions.has(id);
          const isCardLocked    = !!state.lockedRegions[id];
          const garrisonOwner   = rt?.garrisonOwnerId;
          const garrisonCount   = rt?.garrisonedDieIds.length ?? 0;
          const hasStructure    = !!rt?.structure;
          const fill     = isLocked ? '#07080f' : TERRAIN_FILL[region.terrain] ?? '#111';
          const border   = isPlayable ? '#14b8a6' : TERRAIN_BORDER[region.terrain] ?? '#374151';
          const sw       = isPlayable ? 2.5 : region.isFortress ? 2 : 1.5;

          // Gather placed dice with owner
          const placedDice: Array<{ val: number | null; ownerId: string }> = [];
          for (const dieId of rt?.placedDieIds ?? []) {
            for (const player of Object.values(state.players)) {
              const die = player.dice.find((d) => d.id === dieId);
              if (die) { placedDice.push({ val: die.faceValue, ownerId: player.id }); break; }
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
                const regionMoves = humanMoves.filter((m) =>
                  ((m.kind === 'place' || m.kind === 'combine') && m.regionId === id) ||
                  (m.kind === 'battle' && m.targetRegionId === id),
                );
                onRegionClick(id, regionMoves);
              }}
            >
              {/* Outer glow for playable regions */}
              {isPlayable && (
                <rect x={x - 3} y={y - 3} width={NODE_W + 6} height={NODE_H + 6}
                  rx={10} fill="none" stroke="#14b8a6" strokeWidth={1} opacity={0.35}
                  filter="url(#glow-teal)"
                />
              )}

              {/* Tile background */}
              <rect x={x} y={y} width={NODE_W} height={NODE_H}
                rx={7} fill={fill} stroke={border} strokeWidth={sw}
                opacity={isLocked ? 0.35 : 1}
              />

              {/* Card-lock overlay (soft pattern) */}
              {isCardLocked && (
                <rect x={x} y={y} width={NODE_W} height={NODE_H}
                  rx={7} fill="url(#locked-pattern)" opacity={0.15}
                />
              )}

              {/* ── Row 1: icon + name + VP ── */}
              <text x={x + 8} y={y + 16} fontSize={14}>
                {isLocked ? '🔒' : TERRAIN_ICON[region.terrain] ?? '·'}
              </text>
              <text x={x + 26} y={y + 16}
                fontSize={isLocked ? 10 : 11} fontWeight="700"
                fill={isLocked ? '#4b5563' : '#f3f4f6'}
                style={{ letterSpacing: '-0.01em' }}
              >
                {region.name.length > 13 ? region.name.slice(0, 12) + '…' : region.name}
              </text>
              {/* VP — top right */}
              <rect x={x + NODE_W - 28} y={y + 4} width={24} height={14} rx={4} fill="#1f2937" />
              <text x={x + NODE_W - 16} y={y + 14} textAnchor="middle" fontSize={10} fontWeight="700" fill="#9ca3af">
                {region.vp}VP
              </text>

              {/* ── Row 2: requirement + markers ── */}
              <text x={x + 8} y={y + 32} fontSize={10} fontWeight="600"
                fill={isLocked ? '#374151' : '#6b7280'}
              >
                {reqLabel}
                {region.isFortress && !isLocked ? '  🏰' : ''}
                {isLocked ? `  unlocks R${region.unlocksRound}` : ''}
                {isCardLocked ? '  🔐' : ''}
              </text>

              {/* ── Row 3: garrison badge ── */}
              {garrisonCount > 0 && garrisonOwner && (() => {
                const color = getPlayerColor(garrisonOwner, state);
                return (
                  <g>
                    <rect x={x + 8} y={y + 38} width={NODE_W - 16} height={16} rx={3}
                      fill={color} opacity={0.15} />
                    <circle cx={x + 17} cy={y + 46} r={5} fill={color} opacity={0.9} />
                    <text x={x + 27} y={y + 50} fontSize={10} fill={color} fontWeight="600">
                      {garrisonOwner} ×{garrisonCount}
                      {(rt?.heldRounds ?? 0) > 0 ? ` · ${rt?.heldRounds}r` : ''}
                    </text>
                  </g>
                );
              })()}

              {/* Structure badge */}
              {hasStructure && rt?.structure && (
                <text x={x + NODE_W - 8} y={y + 48} textAnchor="end" fontSize={9} fill="#fbbf24">
                  🏗 {rt.structure.structureId.replace(/-/g,' ')}
                </text>
              )}

              {/* ── Row 4: placed dice ── */}
              {placedDice.length > 0 && (
                <g>
                  {placedDice.slice(0, 6).map((d, i) => {
                    const color = getPlayerColor(d.ownerId, state);
                    return (
                      <g key={i} transform={`translate(${x + 8 + i * 22}, ${y + NODE_H - 22})`}>
                        <rect width={18} height={18} rx={4} fill="#111827" stroke={color} strokeWidth={1.5} />
                        <text x={9} y={13} textAnchor="middle" fontSize={11} fontWeight="bold" fill={color}>
                          {d.val ?? '?'}
                        </text>
                      </g>
                    );
                  })}
                  {placedDice.length > 6 && (
                    <text x={x + 8 + 6 * 22} y={y + NODE_H - 8} fontSize={9} fill="#6b7280">
                      +{placedDice.length - 6}
                    </text>
                  )}
                </g>
              )}

              {/* Playable hint */}
              {isPlayable && (
                <text x={x + NODE_W - 7} y={y + NODE_H - 6} textAnchor="end" fontSize={9} fill="#2dd4bf" fontWeight="600">
                  click
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
