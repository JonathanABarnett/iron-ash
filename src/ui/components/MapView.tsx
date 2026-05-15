// SVG-backed map of the 16 Iron & Ash regions laid out on a 4×4 grid.
// The adjacency data in config/regions.json is purely horizontal + vertical,
// so the grid positions exactly match the graph topology.
//
// Props:
//   state         — live game state for dice / garrison / lock overlays
//   humanMoves    — optional Move[] to highlight regions where human can act
//   onRegionClick — optional callback when the human clicks a playable region

import type { GameState, Move, RegionId } from '@engine/types';

/** Grid column/row for each region id. */
const GRID: Record<string, [col: number, row: number]> = {
  'iron-pass':       [0, 0],
  'black-citadel':   [1, 0],
  'silverwood':      [2, 0],
  'marshlands':      [3, 0],
  'whispering-vale': [0, 1],
  'skull-ruins':     [1, 1],
  'stormwall-keep':  [2, 1],
  'goldhaven':       [3, 1],
  'dragons-reach':   [0, 2],
  'mireborn-bog':    [1, 2],
  'emerald-glade':   [2, 2],
  'crows-nest':      [3, 2],
  'highspire':       [0, 3],
  'bonewatch':       [1, 3],
  'verdant-grove':   [2, 3],
  'drownland':       [3, 3],
};

const NODE_W = 138;
const NODE_H = 88;
const COL_STRIDE = NODE_W + 20;   // 158
const ROW_STRIDE = NODE_H + 22;   // 110
const PAD = 14;
const SVG_W = PAD * 2 + 4 * COL_STRIDE - 20;
const SVG_H = PAD * 2 + 4 * ROW_STRIDE - 22;

function cx(col: number) { return PAD + col * COL_STRIDE; }
function cy(row: number) { return PAD + row * ROW_STRIDE; }
function midX(col: number) { return cx(col) + NODE_W / 2; }
function midY(row: number) { return cy(row) + NODE_H / 2; }

// Simple emoji / unicode symbol per terrain — avoids foreignObject for compat.
const TERRAIN_ICON: Record<string, string> = {
  fortress: '🏰',
  forest:   '🌲',
  mountain: '⛰',
  swamp:    '🌿',
  plains:   '🌾',
  ruins:    '🗿',
};

const TERRAIN_FILL: Record<string, string> = {
  fortress: '#451a03',   // deep amber
  forest:   '#052e16',   // deep green
  mountain: '#0f172a',   // deep slate
  swamp:    '#042f2e',   // deep teal
  plains:   '#1a2e05',   // deep lime
  ruins:    '#1e1b4b',   // deep indigo
};

const TERRAIN_BORDER: Record<string, string> = {
  fortress: '#d97706',
  forest:   '#16a34a',
  mountain: '#64748b',
  swamp:    '#0d9488',
  plains:   '#65a30d',
  ruins:    '#7c3aed',
};

interface MapViewProps {
  state: GameState;
  humanMoves?: Move[];
  /** When set, only regions reachable by this specific die glow teal. */
  selectedDieId?: string | null;
  onRegionClick?: (regionId: RegionId, moves: Move[]) => void;
}

export function MapView({ state, humanMoves = [], selectedDieId, onRegionClick }: MapViewProps) {
  // When a die is selected, only show regions where that specific die can go.
  // When no die is selected, show all reachable regions.
  const humanTargetRegions = new Set<string>();
  for (const m of humanMoves) {
    const dieOk =
      !selectedDieId ||
      (m.kind === 'place' && m.dieId === selectedDieId) ||
      (m.kind === 'combine' && m.dieIds.includes(selectedDieId as never)) ||
      (m.kind === 'battle' && m.attackerDieId === selectedDieId);
    if (!dieOk) continue;
    if (m.kind === 'place' || m.kind === 'combine') humanTargetRegions.add(m.regionId);
    if (m.kind === 'battle') humanTargetRegions.add(m.targetRegionId);
  }

  // Build edge list from adjacency data (de-duped).
  const edges: Array<[string, string]> = [];
  const seen = new Set<string>();
  for (const [id, region] of Object.entries(state.regionDefs)) {
    for (const adjId of region.adjacency) {
      const key = [id, adjId].sort().join('|');
      if (!seen.has(key)) { seen.add(key); edges.push([id, adjId]); }
    }
  }

  return (
    <div className="w-full overflow-x-auto rounded border border-neutral-800 bg-neutral-950">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="h-auto w-full"
      >
        {/* Adjacency edges */}
        {edges.map(([a, b]) => {
          const ga = GRID[a], gb = GRID[b];
          if (!ga || !gb) return null;
          return (
            <line
              key={`${a}|${b}`}
              x1={midX(ga[0])} y1={midY(ga[1])}
              x2={midX(gb[0])} y2={midY(gb[1])}
              stroke="#374151"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
          );
        })}

        {/* Region nodes */}
        {Object.entries(state.regionDefs).map(([id, region]) => {
          const pos = GRID[id];
          if (!pos) return null;
          const [col, row] = pos;
          const x = cx(col), y = cy(row);
          const rt = state.regions[id];
          const isLocked = region.unlocksRound !== undefined && state.round < region.unlocksRound;
          const isPlayable = humanTargetRegions.has(id);
          const garrisonOwner = rt?.garrisonOwnerId;
          const garrisonCount = rt?.garrisonedDieIds.length ?? 0;
          const fill = isLocked ? '#0a0a0f' : TERRAIN_FILL[region.terrain] ?? '#111';
          const stroke = isPlayable
            ? '#14b8a6'
            : region.isFortress
              ? TERRAIN_BORDER.fortress
              : TERRAIN_BORDER[region.terrain] ?? '#374151';
          const strokeWidth = isPlayable ? 2.5 : region.isFortress ? 2 : 1.5;

          // Collect placed dice info
          const placedDice: Array<{ val: number | null; owner: string }> = [];
          for (const dieId of rt?.placedDieIds ?? []) {
            for (const player of Object.values(state.players)) {
              const die = player.dice.find((d) => d.id === dieId);
              if (die) { placedDice.push({ val: die.faceValue, owner: player.id }); break; }
            }
          }

          const reqLabel =
            region.valueRequirement.kind === 'min'    ? `≥${region.valueRequirement.value}` :
            region.valueRequirement.kind === 'max'    ? `≤${region.valueRequirement.value}` :
            region.valueRequirement.kind === 'exact'  ? `=${region.valueRequirement.value}` :
            `Σ≥${region.valueRequirement.value}`;

          return (
            <g
              key={id}
              style={{ cursor: isPlayable ? 'pointer' : 'default' }}
              onClick={() => {
                if (isPlayable && onRegionClick) {
                  const regionMoves = humanMoves.filter(
                    (m) =>
                      (m.kind === 'place' || m.kind === 'combine') && m.regionId === id ||
                      m.kind === 'battle' && m.targetRegionId === id,
                  );
                  onRegionClick(id, regionMoves);
                }
              }}
            >
              {/* Node background */}
              <rect
                x={x} y={y}
                width={NODE_W} height={NODE_H}
                rx={6}
                fill={fill}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={isLocked ? 0.4 : 1}
              />
              {/* Playable glow */}
              {isPlayable && (
                <rect
                  x={x - 2} y={y - 2}
                  width={NODE_W + 4} height={NODE_H + 4}
                  rx={8}
                  fill="none"
                  stroke="#14b8a6"
                  strokeWidth={1}
                  opacity={0.4}
                />
              )}

              {/* Row 1: terrain icon + name */}
              <text x={x + 7} y={y + 17} fontSize={13}>
                {TERRAIN_ICON[region.terrain] ?? '·'}
              </text>
              <text
                x={x + 22} y={y + 17}
                fontSize={11} fontWeight="600"
                fill={isLocked ? '#4b5563' : '#e5e7eb'}
                clipPath={`url(#clip-${id})`}
              >
                {region.name.length > 12 ? region.name.slice(0, 11) + '…' : region.name}
              </text>
              {/* VP badge top-right */}
              <text x={x + NODE_W - 5} y={y + 17} textAnchor="end" fontSize={10} fill="#9ca3af">
                {region.vp}VP
              </text>

              {/* Row 2: requirement + unlock or fortress marker */}
              <text x={x + 7} y={y + 37} fontSize={10} fill="#6b7280">
                {reqLabel}
                {region.isFortress ? '  🏰' : ''}
                {isLocked ? `  R${region.unlocksRound}` : ''}
              </text>

              {/* Row 3: garrison badge */}
              {garrisonCount > 0 && garrisonOwner && (
                <text x={x + 7} y={y + 51} fontSize={10} fill="#d97706">
                  🛡 {garrisonOwner} ×{garrisonCount} ({rt?.heldRounds ?? 0}r)
                </text>
              )}

              {/* Row 4: placed dice pips */}
              {placedDice.length > 0 && (
                <g>
                  {placedDice.slice(0, 6).map((d, i) => (
                    <g key={i} transform={`translate(${x + 7 + i * 20}, ${y + NODE_H - 20})`}>
                      <rect width={16} height={16} rx={3} fill="#1f2937" stroke="#374151" />
                      <text x={8} y={12} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#e5e7eb">
                        {d.val ?? '?'}
                      </text>
                    </g>
                  ))}
                  {placedDice.length > 6 && (
                    <text x={x + 7 + 6 * 20} y={y + NODE_H - 7} fontSize={9} fill="#6b7280">
                      +{placedDice.length - 6}
                    </text>
                  )}
                </g>
              )}

              {/* Playable hint */}
              {isPlayable && (
                <text x={x + NODE_W - 7} y={y + NODE_H - 7} textAnchor="end" fontSize={9} fill="#14b8a6">
                  tap
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
