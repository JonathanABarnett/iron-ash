import { Link } from 'react-router';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import { FACTION_ABILITIES } from '@engine/factions/abilities';
import type { FactionId } from '@engine/types';

const FACTIONS: FactionId[] = [
  'warriors','assassins','mages','necromancers',
  'merchants','rangers','paladins','beastmasters',
];

// Card data for each app section
const SECTIONS = [
  {
    to: '/play',
    icon: '🎮',
    label: 'Play',
    description: 'Pick 2–4 factions, mark one YOU, and play against AI opponents with full map, action menu, and AI reasoning panel.',
    cta: 'Start game →',
    accent: 'purple',
    hints: ['2-player · 3-player · 4-player', 'Easy / Medium / Hard AI', 'Export replay when done'],
  },
  {
    to: '/sim',
    icon: '📊',
    label: 'Simulate',
    description: 'Run 10–5000 AI-vs-AI games headlessly. Faction win rates, VP breakdowns, balance warnings, and side-by-side comparison.',
    cta: 'Run sim →',
    accent: 'teal',
    hints: ['Faction win rate charts', 'Specialist claim curve', 'Load baseline to compare'],
  },
  {
    to: '/rules',
    icon: '📖',
    label: 'Rules & FAQ',
    description: 'Full rulebook — placement rules, fortress mechanics, all 8 factions, 16 regions, card effects, and 20+ FAQ answers.',
    cta: 'Open rules →',
    accent: 'amber',
    hints: ['Searchable by keyword', 'Collapsible sections', 'Quick reference card'],
  },
  {
    to: '/replay',
    icon: '▶',
    label: 'Replay',
    description: 'Load a saved game replay JSON to browse round-by-round log entries and review the final score breakdown.',
    cta: 'Open replay →',
    accent: 'blue',
    hints: ['Export from Play page', 'Step through rounds', 'Score breakdown view'],
  },
  {
    to: '/config',
    icon: '⚙',
    label: 'Config Editor',
    description: 'Tune rules, economy costs, and AI personality weights in-browser. Changes persist in localStorage and affect live sim runs.',
    cta: 'Edit config →',
    accent: 'rose',
    hints: ['AI weight sliders', 'Rules & cost overrides', 'Reset to defaults'],
  },
] as const;

const ACCENT: Record<string, { border: string; bg: string; cta: string; badge: string; hint: string }> = {
  purple: { border: 'border-purple-800/50 hover:border-purple-500', bg: 'from-purple-950/50 to-neutral-900', cta: 'bg-purple-700 hover:bg-purple-600', badge: 'bg-purple-900/40 text-purple-300', hint: 'text-purple-400/70' },
  teal:   { border: 'border-teal-800/50 hover:border-teal-500',   bg: 'from-teal-950/50 to-neutral-900',   cta: 'bg-teal-700 hover:bg-teal-600',   badge: 'bg-teal-900/40 text-teal-300',   hint: 'text-teal-400/70'   },
  amber:  { border: 'border-amber-800/50 hover:border-amber-500', bg: 'from-amber-950/50 to-neutral-900', cta: 'bg-amber-700 hover:bg-amber-600', badge: 'bg-amber-900/40 text-amber-300', hint: 'text-amber-400/70' },
  blue:   { border: 'border-blue-800/50 hover:border-blue-500',   bg: 'from-blue-950/50 to-neutral-900',   cta: 'bg-blue-700 hover:bg-blue-600',   badge: 'bg-blue-900/40 text-blue-300',   hint: 'text-blue-400/70'   },
  rose:   { border: 'border-rose-800/50 hover:border-rose-500',   bg: 'from-rose-950/50 to-neutral-900',   cta: 'bg-rose-700 hover:bg-rose-600',   badge: 'bg-rose-900/40 text-rose-300',   hint: 'text-rose-400/70'   },
};

export function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-10">

      {/* ── Hero ── */}
      <section>
        <h1 className="text-5xl font-black tracking-tight text-white leading-none">
          Iron &amp; Ash
        </h1>
        <p className="mt-3 text-base text-neutral-400 max-w-xl">
          Asymmetric medieval-fantasy dice-placement. 8 factions, 16 regions, 7 rounds.
          Balance through simulation — play through the browser.
        </p>

        {/* Stat badges */}
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ['8','Factions'],['16','Regions'],['7','Rounds'],
            ['4','Structures'],['8','Cards'],['93','Tests'],
          ].map(([n, label]) => (
            <div key={label} className="flex items-baseline gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-1.5">
              <span className="text-base font-black text-white">{n}</span>
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Navigation cards ── */}
      <section>
        <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
          Quick navigation
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => {
            const a = ACCENT[s.accent]!;
            return (
              <Link
                key={s.to}
                to={s.to}
                className={`group flex flex-col gap-3 overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all ${a.border} ${a.bg}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${a.badge}`}>
                    {s.icon}
                  </span>
                  <span className="text-base font-bold text-white">{s.label}</span>
                </div>
                <p className="text-xs leading-relaxed text-neutral-400 group-hover:text-neutral-300 transition-colors">
                  {s.description}
                </p>
                <div className="mt-auto space-y-1">
                  {s.hints.map((h) => (
                    <div key={h} className={`text-[10px] ${a.hint}`}>· {h}</div>
                  ))}
                </div>
                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white transition ${a.cta}`}>
                  {s.cta}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Faction quick-reference ── */}
      <section>
        <h2 className="mb-4 text-[10px] font-bold uppercase tracking-widest text-neutral-600">
          Factions — click to view full rules
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FACTIONS.map((id) => {
            const ab = FACTION_ABILITIES[id];
            return (
              <Link
                key={id}
                to={`/rules#${id}`}
                className="group flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-3 transition hover:border-neutral-600 hover:bg-neutral-800/60"
              >
                <div className="flex items-center gap-2">
                  <FactionEmblem factionId={id} size={32} className="rounded-lg shrink-0" />
                  <span className="text-sm font-bold text-neutral-100">{factionLabel(id)}</span>
                </div>
                {ab && (
                  <div className="space-y-0.5">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-neutral-600">Active</div>
                    <div className="text-[10px] text-neutral-400 leading-tight">
                      <span className="text-neutral-300 font-semibold">{ab.activeLabel}</span>
                    </div>
                    <div className="text-[9px] text-neutral-500 leading-tight line-clamp-2">
                      {ab.activeDescription}
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── How to play quick guide ── */}
      <section className="rounded-2xl border border-neutral-800/60 bg-neutral-900/30 p-5">
        <h2 className="mb-4 text-sm font-bold text-neutral-200">⚡ Quick start guide</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs text-neutral-400">
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-purple-400">1. Setup</div>
            <ul className="space-y-1">
              <li>· Go to <Link to="/play" className="text-purple-300 hover:text-purple-200">Play</Link> and pick 2–4 factions</li>
              <li>· Click <strong className="text-neutral-200">YOU</strong> on the faction you want to play</li>
              <li>· Choose difficulty and a seed, then <strong className="text-neutral-200">▶ Start</strong></li>
            </ul>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-teal-400">2. On your turn</div>
            <ul className="space-y-1">
              <li>· The teal banner appears — you have multiple action options</li>
              <li>· Click a die in your barracks to filter moves</li>
              <li>· Click a glowing region on the map to place instantly</li>
              <li>· Or choose from the <strong className="text-neutral-200">★ Best by VP</strong> section</li>
            </ul>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-400">3. Win conditions</div>
            <ul className="space-y-1">
              <li>· Garrison fortresses for per-round VP income</li>
              <li>· Complete round goals (3/2/1 VP to top 3)</li>
              <li>· Build structures for end-game VP</li>
              <li>· Achieve both secret goals (+4 bonus VP)</li>
              <li>· Game ends at round 7 or threat track ≥ 8</li>
            </ul>
          </div>
        </div>
        <div className="mt-4 border-t border-neutral-800 pt-4 text-xs text-neutral-500">
          Not sure about a rule? Visit <Link to="/rules" className="text-amber-400 hover:text-amber-300">📖 Rules & FAQ</Link> — it has a searchable rulebook with all 16 regions, 8 faction sheets, and 20+ FAQ answers.
        </div>
      </section>

      {/* ── Balance status ── */}
      <section className="rounded-2xl border border-neutral-800/60 bg-neutral-900/30 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-neutral-200">📈 Current balance status</h2>
          <span className="rounded-full border border-emerald-700 bg-emerald-950/40 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
            ✓ No warnings
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs text-center">
          {[
            { label: 'Round-7 Reach', value: '41%', target: '30–50%', ok: true },
            { label: 'Fortress Turnover', value: '57%', target: '≥60%', ok: false },
            { label: 'Specialist R1 Claim', value: '53%', target: '≥40%', ok: true },
            { label: 'Faction Spread', value: '±8pp', target: '<±10pp', ok: true },
          ].map((m) => (
            <div key={m.label} className={`rounded-xl border p-3 ${m.ok ? 'border-emerald-800/40 bg-emerald-950/20' : 'border-amber-800/40 bg-amber-950/20'}`}>
              <div className="text-lg font-black tabular-nums" style={{ color: m.ok ? '#34d399' : '#fbbf24' }}>{m.value}</div>
              <div className="text-[10px] text-neutral-400 mt-0.5">{m.label}</div>
              <div className={`text-[9px] mt-0.5 ${m.ok ? 'text-emerald-600' : 'text-amber-600'}`}>target {m.target}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-neutral-600">
          Based on 500-game medium-difficulty simulation. Run <Link to="/sim" className="text-teal-400 hover:text-teal-300">Simulate</Link> to re-check after config changes.
          Full history in <code className="rounded bg-neutral-800 px-1">docs/ideas-and-testing.md</code>.
        </p>
      </section>

      {/* ── Dev commands ── */}
      <section>
        <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-neutral-600">Dev commands</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
          {[
            { cmd: 'run.bat', desc: 'Interactive launcher menu', color: 'text-purple-300' },
            { cmd: 'pnpm dev', desc: 'Start dev server (:5180)', color: 'text-teal-300' },
            { cmd: 'pnpm sim --games=500', desc: 'Balance check', color: 'text-amber-300' },
            { cmd: 'pnpm test', desc: '93 engine tests', color: 'text-emerald-300' },
          ].map(({ cmd, desc, color }) => (
            <div key={cmd} className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
              <code className={`font-mono text-[11px] font-bold ${color}`}>{cmd}</code>
              <div className="mt-1 text-[10px] text-neutral-500">{desc}</div>
            </div>
          ))}
        </div>
      </section>

    </main>
  );
}
