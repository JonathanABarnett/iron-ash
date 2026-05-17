// MapView — steam branch. Hand-crafted continent map.
//
// Each region is defined as an explicit polygon, not derived from a grid.
// Adjacent regions share exact edge vertices — no gaps.
//
// Geographic design:
//   Left col  — narrow mountain corridor (Iron Pass, Whispering Vale, Dragon's Reach, Highspire)
//   Col 2     — central heartland, widening south (Black Citadel, Skull Ruins, Mireborn Bog, Bonewatch)
//   Col 3     — wide fertile centre (Silverwood, Stormwall Keep, Emerald Glade, Verdant Grove)
//   Right col — broad coastal strip, widest region in game (Marshlands, Goldhaven, Crow's Nest, Drownland)
//
// Column dividers lean LEFT as they go south, so every region is a true parallelogram
// or trapezoid — nothing in the map is a rectangle.

import type { GameState, Move, PlayerId, RegionId, Terrain } from '@engine/types';
import { TerrainInlineSVG } from './TerrainIllustration';

// ─── Vertices ────────────────────────────────────────────────────────────────
// Named for their role, not their grid position.

type V = readonly [number, number];

// Outer perimeter (clockwise, organic coastline)
const TL: V  = [40,  55];   // iron-pass  top-left
const T1: V  = [175, 28];   // iron-pass / black-citadel  top divide
const T2: V  = [368, 22];   // black-citadel / silverwood top divide
const T3: V  = [558, 26];   // silverwood / marshlands    top divide
const TR: V  = [818, 55];   // marshlands top-right
const R1: V  = [825, 178];  // marshlands / goldhaven     right divide
const R2: V  = [832, 340];  // goldhaven  / crows-nest    right divide
const R3: V  = [820, 472];  // crows-nest / drownland     right divide
const BR: V  = [808, 542];  // drownland  bottom-right
const B3: V  = [535, 555];  // verdant / drownland        bottom divide
const B2: V  = [342, 552];  // bonewatch / verdant        bottom divide
const B1: V  = [118, 548];  // highspire / bonewatch      bottom divide
const BL: V  = [25,  538];  // highspire  bottom-left
const L3: V  = [18,  442];  // dragons-reach / highspire  left divide
const L2: V  = [22,  315];  // whispering / dragons-reach left divide
const L1: V  = [28,  175];  // iron-pass / whispering     left divide

// Interior column-boundary vertices
// Col-1 divider: leans left as it descends (creates slanted mountain corridor feel)
const I11: V = [158, 188];  // col1 @ row1
const I12: V = [145, 322];  // col1 @ row2  (−13 from I11)
const I13: V = [132, 455];  // col1 @ row3  (−13 from I12)

// Col-2 divider: also leans left but less steeply
const I21: V = [385, 195];  // col2 @ row1
const I22: V = [370, 332];  // col2 @ row2  (−15 from I21)
const I23: V = [355, 462];  // col2 @ row3  (−15 from I22)

// Col-3 divider: slight rightward bulge in the middle (fortress dominance)
const I31: V = [545, 178];  // col3 @ row1
const I32: V = [562, 338];  // col3 @ row2  (+17 — Stormwall juts out)
const I33: V = [548, 468];  // col3 @ row3  (−14)

// ─── Region polygons ──────────────────────────────────────────────────────────

function pts(...vs: V[]) { return vs.map(([x,y]) => `${x},${y}`).join(' '); }
function mid(...vs: V[]): V {
  return [
    Math.round(vs.reduce((s,[x])=>s+x,0)/vs.length),
    Math.round(vs.reduce((s,[,y])=>s+y,0)/vs.length),
  ] as const;
}

type RegionShape = { poly: string; cx: number; cy: number };

const SHAPES: Record<string, RegionShape> = (() => {
  const mk = (...vs: V[]): RegionShape => { const [cx,cy]=mid(...vs); return {poly:pts(...vs),cx,cy}; };
  return {
    // Row 0 — northern frontier (shallow)
    'iron-pass':       mk(TL,  T1,  I11, L1),
    'black-citadel':   mk(T1,  T2,  I21, I11),
    'silverwood':      mk(T2,  T3,  I31, I21),
    'marshlands':      mk(T3,  TR,  R1,  I31),
    // Row 1 — central heartland
    'whispering-vale': mk(L1,  I11, I12, L2),
    'skull-ruins':     mk(I11, I21, I22, I12),
    'stormwall-keep':  mk(I21, I31, I32, I22),
    'goldhaven':       mk(I31, R1,  R2,  I32),
    // Row 2 — contested lowlands
    'dragons-reach':   mk(L2,  I12, I13, L3),
    'mireborn-bog':    mk(I12, I22, I23, I13),
    'emerald-glade':   mk(I22, I32, I33, I23),
    'crows-nest':      mk(I32, R2,  R3,  I33),
    // Row 3 — southern reaches (shallow)
    'highspire':       mk(L3,  I13, B1,  BL),
    'bonewatch':       mk(I13, I23, B2,  B1),
    'verdant-grove':   mk(I23, I33, B3,  B2),
    'drownland':       mk(I33, R3,  BR,  B3),
  };
})();

// Full continent outline for clip / sea contrast
const CONTINENT_OUTLINE = [TL,T1,T2,T3,TR,R1,R2,R3,BR,B3,B2,B1,BL,L3,L2,L1]
  .map(([x,y])=>`${x},${y}`).join(' ');

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
  swamp:'#2dd4bf', plains:'#a3e635', ruins:'#c084fc',
};
const PLAYER_PALETTE = ['#2dd4bf','#a78bfa','#fb923c','#f472b6','#60a5fa','#34d399'];
const _cc: Record<string,string> = {};
function pCol(pid: PlayerId, state: GameState): string {
  if (!_cc[pid]) { const i=Object.keys(state.players).indexOf(pid); _cc[pid]=PLAYER_PALETTE[i%PLAYER_PALETTE.length]??'#9ca3af'; }
  return _cc[pid]!;
}

// ─── Decorations ─────────────────────────────────────────────────────────────

// River: Stormwall Keep → Mireborn Bog → Drownland coast
const RIVER = 'M 450,220 C 432,268 395,298 378,332 C 360,368 368,418 358,462 C 350,492 548,508 562,522';

// Mountain ranges in the narrow left-column regions
const MTN_IRON = ['M 45,145 L 78,92 L 110,145','M 82,150 L 125,78 L 165,145','M 132,148 L 156,105 L 180,148'];
const MTN_DRAG = ['M 28,390 L 60,345 L 92,390','M 65,398 L 108,328 L 150,398','M 120,402 L 150,358 L 182,400'];

// ─── Component ────────────────────────────────────────────────────────────────

interface MapViewProps {
  state: GameState;
  humanMoves?: Move[];
  selectedDieId?: string | null;
  onRegionClick?: (regionId: RegionId, moves: Move[]) => void;
}

export function MapView({ state, humanMoves=[], selectedDieId, onRegionClick }: MapViewProps) {
  const playable = new Set<string>();
  for (const m of humanMoves) {
    const ok = !selectedDieId
      || (m.kind==='place'   && m.dieId===selectedDieId)
      || (m.kind==='combine' && m.dieIds.includes(selectedDieId as never))
      || (m.kind==='battle'  && m.attackerDieId===selectedDieId);
    if (!ok) continue;
    if (m.kind==='place'||m.kind==='combine') playable.add(m.regionId);
    if (m.kind==='battle') playable.add(m.targetRegionId);
  }

  return (
    <div className="w-full overflow-x-auto rounded-2xl shadow-2xl shadow-black/70"
      style={{background:'#06080f', border:'1px solid rgba(255,255,255,0.06)', maxWidth:900}}>
      <svg viewBox="0 0 860 580" className="h-auto w-full" style={{display:'block'}}>
        <defs>
          <radialGradient id="sea" cx="50%" cy="50%" r="80%">
            <stop offset="0%"   stopColor="#0a1628" />
            <stop offset="100%" stopColor="#030810" />
          </radialGradient>
          {Object.entries(TERRAIN_GRAD).map(([t,[l,d]]) => (
            <linearGradient key={t} id={`tg-${t}`} x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%"   stopColor={l} />
              <stop offset="100%" stopColor={d} />
            </linearGradient>
          ))}
          <linearGradient id="tg-locked" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#111320" />
            <stop offset="100%" stopColor="#08090e" />
          </linearGradient>
          <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
            <stop offset="60%" stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.5)" />
          </radialGradient>
          <filter id="glow-play" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>
            <feColorMatrix in="b" type="matrix"
              values="0 0 0 0 0.08  0 0 0 0 0.72  0 0 0 0 0.65  0 0 0 0.75 0" result="c"/>
            <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="glow-fort" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b"/>
            <feColorMatrix in="b" type="matrix"
              values="0 0 0 0 0.98  0 0 0 0 0.62  0 0 0 0 0.07  0 0 0 0.55 0" result="c"/>
            <feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="tile-sh" x="-8%" y="-8%" width="116%" height="120%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity="0.6"/>
          </filter>
          <filter id="txt-sh" x="-10%" y="-20%" width="120%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.9"/>
          </filter>
          <clipPath id="cc"><polygon points={CONTINENT_OUTLINE}/></clipPath>
        </defs>

        {/* Sea */}
        <rect width={860} height={580} fill="url(#sea)"/>
        {/* Wave decoration in sea corners */}
        {['M 0,50 Q 18,44 35,50','M 0,66 Q 15,60 28,66',
          'M 822,50 Q 840,44 860,50','M 824,66 Q 842,60 860,66',
          'M 0,520 Q 14,514 28,520','M 0,535 Q 12,529 24,535',
          'M 820,518 Q 836,512 860,518','M 820,534 Q 836,528 860,534',
        ].map((d,i)=><path key={i} d={d} fill="none" stroke="#1e4060" strokeWidth={1.2} opacity={0.45}/>)}

        {/* Continent base */}
        <polygon points={CONTINENT_OUTLINE} fill="#0b1220" stroke="rgba(255,255,255,0.07)" strokeWidth={1.5}/>

        {/* Mountain + river decorations (clipped to continent) */}
        <g clipPath="url(#cc)">
          {MTN_IRON.map((d,i)=><path key={`mi${i}`} d={d} fill="none" stroke="#2a4a6a" strokeWidth={i===1?2:1.5} opacity={0.38+i*0.07}/>)}
          {MTN_DRAG.map((d,i)=><path key={`md${i}`} d={d} fill="none" stroke="#2a4a6a" strokeWidth={i===1?2:1.5} opacity={0.38+i*0.07}/>)}
          <path d={RIVER} fill="none" stroke="#0d4a6e" strokeWidth={3.5} opacity={0.32} strokeLinecap="round"/>
          <path d={RIVER} fill="none" stroke="#0ea5e9" strokeWidth={1.2} opacity={0.18} strokeLinecap="round"/>
        </g>

        {/* Regions */}
        {Object.entries(state.regionDefs).map(([id, region]) => {
          const sh = SHAPES[id]; if (!sh) return null;
          const {poly,cx,cy} = sh;
          const rt           = state.regions[id];
          const isLocked     = region.unlocksRound!=null && state.round<region.unlocksRound;
          const isPlayable   = playable.has(id);
          const cardLocked   = !!state.lockedRegions?.[id];
          const garrison     = rt?.garrisonOwnerId;
          const garrisonN    = rt?.garrisonedDieIds.length??0;
          const hasStruct    = !!rt?.structure;
          const accent       = TERRAIN_ACCENT[region.terrain]??'#6b7280';
          const gradId       = isLocked ? 'tg-locked' : `tg-${region.terrain}`;
          const borderCol    = isPlayable ? '#14b8a6' : isLocked ? '#1a1e2a'
                             : region.isFortress ? '#d97706' : accent;
          const borderW      = isPlayable ? 2.5 : region.isFortress ? 2 : 1;

          const placed: Array<{val:number|null;owner:string}> = [];
          for (const dieId of rt?.placedDieIds??[]) {
            for (const p of Object.values(state.players)) {
              const d=p.dice.find(x=>x.id===dieId);
              if (d) { placed.push({val:d.faceValue,owner:p.id}); break; }
            }
          }

          const req =
            region.valueRequirement.kind==='min'   ? `≥${region.valueRequirement.value}` :
            region.valueRequirement.kind==='max'   ? `≤${region.valueRequirement.value}` :
            region.valueRequirement.kind==='exact' ? `=${region.valueRequirement.value}` :
            `Σ≥${region.valueRequirement.value}`;

          return (
            <g key={id} style={{cursor:isPlayable?'pointer':'default'}}
              onClick={()=>{
                if (!isPlayable||!onRegionClick) return;
                onRegionClick(id, humanMoves.filter(m=>
                  ((m.kind==='place'||m.kind==='combine')&&m.regionId===id)||
                  (m.kind==='battle'&&m.targetRegionId===id)));
              }}>

              {/* Playable glow */}
              {isPlayable && (
                <polygon points={poly} fill="none" stroke="#14b8a6" strokeWidth={8} opacity={0.12}
                  filter="url(#glow-play)">
                  <animate attributeName="opacity" values="0.08;0.28;0.08" dur="1.8s" repeatCount="indefinite"/>
                </polygon>
              )}

              {/* Fortress ambient glow */}
              {region.isFortress&&!isLocked&&(
                <polygon points={poly} fill="none" stroke="#f59e0b" strokeWidth={5} opacity={0.07}
                  filter="url(#glow-fort)"/>
              )}

              {/* Terrain fill */}
              <polygon points={poly}
                fill={`url(#${gradId})`} stroke={borderCol} strokeWidth={borderW}
                opacity={isLocked?0.28:1}
                filter={isLocked?undefined:'url(#tile-sh)'}/>

              {/* Terrain watermark illustration */}
              {!isLocked&&(
                <g opacity={0.18} clipPath="url(#cc)">
                  <TerrainInlineSVG terrain={region.terrain as Terrain} x={cx+30} y={cy+4} size={52}/>
                </g>
              )}

              {/* Fortress shimmer */}
              {region.isFortress&&!isLocked&&(
                <polygon points={poly} fill={accent} opacity={0.055} clipPath="url(#cc)"/>
              )}

              {/* Region name */}
              <text x={cx-72} y={cy-36}
                fontSize={10.5} fontWeight="700" letterSpacing="0.01"
                fill={isLocked?'#232338':'#eeeefc'} filter="url(#txt-sh)">
                {region.name.length>14?region.name.slice(0,13)+'…':region.name}
              </text>

              {/* VP badge */}
              {!isLocked&&<>
                <rect x={cx+50} y={cy-50} width={26} height={14} rx={4} fill={accent} opacity={0.18}/>
                <text x={cx+63} y={cy-39} textAnchor="middle"
                  fontSize={9.5} fontWeight="800" fill={accent} filter="url(#txt-sh)">
                  {region.vp}VP
                </text>
              </>}

              {/* Locked indicator */}
              {isLocked&&(
                <text x={cx} y={cy-35} textAnchor="middle" fontSize={9} fill="#252540" fontWeight="600">
                  🔒 R{region.unlocksRound}
                </text>
              )}

              {/* Requirement */}
              {!isLocked&&(
                <text x={cx-72} y={cy-23} fontSize={9.5} fill={accent} fontWeight="600" opacity={0.8} filter="url(#txt-sh)">
                  {req}{region.isFortress?' 🏰':''}{cardLocked?' 🔐':''}
                </text>
              )}

              {/* Garrison bar */}
              {garrisonN>0&&garrison&&(()=>{
                const col=pCol(garrison,state);
                return (
                  <g>
                    <rect x={cx-72} y={cy-8} width={144} height={17} rx={3} fill={col} opacity={0.12}/>
                    <rect x={cx-72} y={cy-8} width={144} height={17} rx={3} fill="none" stroke={col} strokeWidth={0.7} opacity={0.35}/>
                    <circle cx={cx-60} cy={cy+1} r={5} fill={col} opacity={0.85}/>
                    <text x={cx-50} y={cy+5} fontSize={9} fill={col} fontWeight="700" filter="url(#txt-sh)">
                      {garrison} ×{garrisonN}{(rt?.heldRounds??0)>0?`  ·  ${rt?.heldRounds}r`:''}
                    </text>
                  </g>
                );
              })()}

              {/* Structure */}
              {hasStruct&&rt?.structure&&(
                <g>
                  <rect x={cx+18} y={cy-8} width={58} height={13} rx={3} fill="#78350f" opacity={0.7}/>
                  <text x={cx+47} y={cy+1} textAnchor="middle" fontSize={7.5} fill="#fbbf24" fontWeight="600">
                    🏗 {rt.structure.structureId.replace(/-/g,' ')}
                  </text>
                </g>
              )}

              {/* Placed dice */}
              {placed.length>0&&(
                <g>{placed.slice(0,7).map((d,i)=>{
                  const col=pCol(d.owner,state);
                  return (
                    <g key={i}>
                      <rect x={cx-72+i*22} y={cy+13} width={18} height={18} rx={4} fill="#08080e" stroke={col} strokeWidth={1.5}/>
                      <text x={cx-72+i*22+9} y={cy+26} textAnchor="middle" fontSize={10} fontWeight="900" fill={col}>
                        {d.val??'?'}
                      </text>
                    </g>
                  );
                })}
                {placed.length>7&&<text x={cx-72+7*22+4} y={cy+25} fontSize={8} fill="#6b7280">+{placed.length-7}</text>}
                </g>
              )}

              {/* Click hint */}
              {isPlayable&&(
                <text x={cx+76} y={cy+34} textAnchor="end" fontSize={8} fill="#2dd4bf" fontWeight="700" opacity={0.9}>
                  click ›
                </text>
              )}

              {/* Playable border pulse */}
              {isPlayable&&(
                <polygon points={poly} fill="none" stroke="#14b8a6" strokeWidth={2}>
                  <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="1.8s" repeatCount="indefinite"/>
                </polygon>
              )}
            </g>
          );
        })}

        {/* Vignette */}
        <polygon points={CONTINENT_OUTLINE} fill="url(#vignette)" style={{pointerEvents:'none'}}/>
        {/* Frame */}
        <rect x={1} y={1} width={858} height={578} rx={10} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={2}/>
      </svg>
    </div>
  );
}
