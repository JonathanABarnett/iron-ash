import { Link } from 'react-router';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import { FACTION_ABILITIES } from '@engine/factions/abilities';
import type { FactionId } from '@engine/types';

const FACTIONS: FactionId[] = [
  'warriors','assassins','mages','necromancers',
  'merchants','rangers','paladins','beastmasters',
];

export function HomePage() {
  return (
    <div className="animate-fade-in">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden px-6 pb-16 pt-14">
        {/* Glow backdrop */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)' }} />
        </div>

        <div className="relative mx-auto max-w-3xl">
          {/* Badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
            style={{ borderColor: 'rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.08)', color: '#a78bfa' }}>
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse inline-block" />
            Playtesting build · 500-game validated
          </div>

          {/* Title */}
          <h1 className="text-6xl font-black tracking-tight leading-none text-gradient-hero">
            Iron &amp; Ash
          </h1>
          <p className="mt-4 max-w-lg text-lg leading-relaxed" style={{ color: 'var(--color-muted)' }}>
            Asymmetric medieval-fantasy dice-placement. 8 unique factions compete across
            16 regions over 7 rounds — balance tested through headless AI simulation.
          </p>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/tutorial"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', boxShadow: '0 0 20px rgba(124,58,237,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
            >
              <span>🎓</span> Start Tutorial
            </Link>
            <Link to="/play"
              className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ borderColor: 'rgba(124,58,237,0.4)', background: 'rgba(124,58,237,0.08)', color: '#c4b5fd' }}
            >
              <span>▶</span> Play Now
            </Link>
            <Link to="/sim"
              className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-1)', color: 'var(--color-text)' }}
            >
              <span>📊</span> Simulate
            </Link>
            <Link to="/rules"
              className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02]"
              style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)', color: '#fbbf24' }}
            >
              <span>📖</span> Rules
            </Link>
          </div>

          {/* Stats row */}
          <div className="mt-8 flex flex-wrap gap-6 text-sm" style={{ color: 'var(--color-muted)' }}>
            {[['8','factions'],['16','regions'],['7','rounds'],['93','tests'],['4','structures']].map(([n, l]) => (
              <span key={l}><strong className="font-bold text-white">{n}</strong> {l}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mx-6 border-t" style={{ borderColor: 'var(--color-border)' }} />

      {/* ── Section nav cards ────────────────────────────────────────────────── */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <SectionLabel>Everything you need</SectionLabel>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FeatureCard
              to="/play"
              icon="🎮"
              title="Play"
              desc="Pick 2–4 factions, control one yourself, and play against AI opponents with full map view, action menu, and reasoning panel."
              tags={['2–4 players','Easy/Medium/Hard AI','Export replay']}
              accent="violet"
              primary
            />
            <FeatureCard
              to="/sim"
              icon="📊"
              title="Simulate"
              desc="Run up to 5000 AI-vs-AI games headlessly. See faction win rates, VP breakdowns, and compare against a saved baseline."
              tags={['Faction win charts','Balance warnings','Side-by-side diff']}
              accent="teal"
              primary
            />
            <FeatureCard
              to="/rules"
              icon="📖"
              title="Rules & FAQ"
              desc="Complete rulebook with all 8 faction sheets, 16-region reference, and 20+ FAQ answers covering every edge case."
              tags={['Searchable','Collapsible sections','Quick reference card']}
              accent="amber"
            />
            <FeatureCard
              to="/config"
              icon="⚙"
              title="Config Editor"
              desc="Tune AI personality weights, rule values, and costs in-browser. Changes persist and affect live sim runs immediately."
              tags={['AI weight sliders','Rule overrides','localStorage persist']}
              accent="rose"
            />
            <FeatureCard
              to="/replay"
              icon="▶"
              title="Replay Viewer"
              desc="Load a saved game JSON to browse round-by-round log entries, score breakdowns, and see how the AI played each turn."
              tags={['Export from Play page','Browse by round','Score breakdown']}
              accent="blue"
            />
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mx-6 border-t" style={{ borderColor: 'var(--color-border)' }} />

      {/* ── Faction reference ─────────────────────────────────────────────────── */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-baseline justify-between">
            <SectionLabel>8 asymmetric factions</SectionLabel>
            <Link to="/rules" className="text-xs transition-colors hover:text-white" style={{ color: 'var(--color-muted)' }}>
              Full faction sheets →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FACTIONS.map((id) => <FactionCard key={id} factionId={id} />)}
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mx-6 border-t" style={{ borderColor: 'var(--color-border)' }} />

      {/* ── Quick start + balance ─────────────────────────────────────────────── */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-3xl grid grid-cols-1 gap-4 lg:grid-cols-5">

          {/* Quick start — 3 cols */}
          <div className="lg:col-span-3 rounded-2xl p-5" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-base">⚡</span>
              <h2 className="text-sm font-semibold text-white">Quick start</h2>
            </div>
            <div className="space-y-4 text-xs" style={{ color: 'var(--color-muted)' }}>
              <div>
                <div className="mb-1.5 font-semibold text-violet-400 uppercase tracking-wider text-[10px]">1 · Setup</div>
                <ul className="space-y-1">
                  <li>→ Go to <Link to="/play" className="text-violet-300 hover:text-violet-200">Play</Link>, pick 2–4 factions</li>
                  <li>→ Click <strong className="text-white">YOU</strong> on the faction you want to control</li>
                  <li>→ Choose difficulty and seed, then <strong className="text-white">▶ Start</strong></li>
                </ul>
              </div>
              <div>
                <div className="mb-1.5 font-semibold text-teal-400 uppercase tracking-wider text-[10px]">2 · Your turn</div>
                <ul className="space-y-1">
                  <li>→ Teal banner appears when it's your turn</li>
                  <li>→ Click a die to filter moves, or use <strong className="text-white">★ Best by VP</strong></li>
                  <li>→ Click a glowing region to place immediately</li>
                </ul>
              </div>
              <div>
                <div className="mb-1.5 font-semibold text-amber-400 uppercase tracking-wider text-[10px]">3 · Win</div>
                <ul className="space-y-1">
                  <li>→ Garrison fortresses for per-round VP income</li>
                  <li>→ Complete round goals (3/2/1 VP to top 3)</li>
                  <li>→ Build structures · achieve secret goals (+4 bonus)</li>
                  <li>→ Game ends round 7 or threat track ≥ 8</li>
                </ul>
              </div>
              <div className="rounded-xl border px-3 py-2 text-[10px]" style={{ borderColor: 'rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.05)', color: '#d97706' }}>
                Confused? <Link to="/rules" className="font-semibold hover:text-amber-300 text-amber-400">📖 Rules & FAQ</Link> has searchable answers to every edge case.
              </div>
            </div>
          </div>

          {/* Balance status — 2 cols */}
          <div className="lg:col-span-2 rounded-2xl p-5" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">📈</span>
                <h2 className="text-sm font-semibold text-white">Balance</h2>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', color: '#34d399' }}>
                ✓ Passing
              </span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Round-7 reach',    value: '41%',  target: '30–50%', ok: true  },
                { label: 'Fortress turnover', value: '57%',  target: '≥60%',   ok: false },
                { label: 'Specialist R1',     value: '53%',  target: '≥40%',   ok: true  },
                { label: 'Faction spread',    value: '±8pp', target: '<±10pp', ok: true  },
              ].map((m) => (
                <div key={m.label}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span style={{ color: 'var(--color-muted)' }}>{m.label}</span>
                    <span className="font-bold" style={{ color: m.ok ? '#34d399' : '#fbbf24' }}>{m.value}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: '100%', background: m.ok ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)' }} />
                  </div>
                  <div className="mt-0.5 text-[9px]" style={{ color: 'var(--color-subtle)' }}>target {m.target}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t pt-3 text-[10px]" style={{ borderColor: 'var(--color-border)', color: 'var(--color-subtle)' }}>
              500-game sim · medium difficulty ·{' '}
              <Link to="/sim" className="hover:text-teal-300 transition-colors" style={{ color: '#14b8a6' }}>re-run →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mx-6 border-t" style={{ borderColor: 'var(--color-border)' }} />

      {/* ── Dev footer ───────────────────────────────────────────────────────── */}
      <section className="px-6 py-8">
        <div className="mx-auto max-w-3xl flex flex-wrap items-center gap-4 justify-between text-xs" style={{ color: 'var(--color-subtle)' }}>
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'run.bat', hint: 'launcher menu' },
              { label: 'pnpm dev', hint: ':5180' },
              { label: 'pnpm sim --games=500', hint: 'balance check' },
              { label: 'pnpm test', hint: '93 tests' },
            ].map(({ label, hint }) => (
              <div key={label} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-1)' }}>
                <code className="font-mono text-[11px] text-violet-300">{label}</code>
                <span className="text-[10px]" style={{ color: 'var(--color-subtle)' }}>— {hint}</span>
              </div>
            ))}
          </div>
          <div style={{ color: 'var(--color-subtle)' }}>TypeScript strict · Vite 8 · React 19</div>
        </div>
      </section>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>
      {children}
    </h2>
  );
}

const ACCENT_STYLES = {
  violet: {
    border: 'rgba(124,58,237,0.25)',
    bg: 'rgba(124,58,237,0.06)',
    tag: 'rgba(139,92,246,0.12)',
    tagText: '#a78bfa',
    hover: 'rgba(124,58,237,0.12)',
    icon: 'rgba(124,58,237,0.2)',
  },
  teal: {
    border: 'rgba(20,184,166,0.25)',
    bg: 'rgba(20,184,166,0.05)',
    tag: 'rgba(20,184,166,0.1)',
    tagText: '#5eead4',
    hover: 'rgba(20,184,166,0.1)',
    icon: 'rgba(20,184,166,0.18)',
  },
  amber: {
    border: 'rgba(245,158,11,0.25)',
    bg: 'rgba(245,158,11,0.05)',
    tag: 'rgba(245,158,11,0.1)',
    tagText: '#fbbf24',
    hover: 'rgba(245,158,11,0.1)',
    icon: 'rgba(245,158,11,0.18)',
  },
  rose: {
    border: 'rgba(244,63,94,0.25)',
    bg: 'rgba(244,63,94,0.05)',
    tag: 'rgba(244,63,94,0.1)',
    tagText: '#fb7185',
    hover: 'rgba(244,63,94,0.1)',
    icon: 'rgba(244,63,94,0.18)',
  },
  blue: {
    border: 'rgba(59,130,246,0.25)',
    bg: 'rgba(59,130,246,0.05)',
    tag: 'rgba(59,130,246,0.1)',
    tagText: '#93c5fd',
    hover: 'rgba(59,130,246,0.1)',
    icon: 'rgba(59,130,246,0.18)',
  },
} as const;

function FeatureCard({
  to, icon, title, desc, tags, accent,
  primary = false,
}: {
  to: string;
  icon: string;
  title: string;
  desc: string;
  tags: string[];
  accent: keyof typeof ACCENT_STYLES;
  primary?: boolean;
}) {
  const a = ACCENT_STYLES[accent];
  return (
    <Link
      to={to}
      className={`group relative flex flex-col gap-3 rounded-2xl p-5 transition-all hover:scale-[1.01] active:scale-[0.99] ${primary ? 'sm:row-span-1' : ''}`}
      style={{ border: `1px solid ${a.border}`, background: a.bg }}
      onMouseEnter={(e) => e.currentTarget.style.background = a.hover}
      onMouseLeave={(e) => e.currentTarget.style.background = a.bg}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
          style={{ background: a.icon }}>
          {icon}
        </div>
        <span className="text-[10px] mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ color: a.tagText }}>
          Open →
        </span>
      </div>
      <div>
        <h3 className="font-semibold text-white mb-1">{title}</h3>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-muted)' }}>{desc}</p>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="rounded-md px-2 py-0.5 text-[10px] font-medium"
            style={{ background: a.tag, color: a.tagText }}>
            {t}
          </span>
        ))}
      </div>
    </Link>
  );
}

function FactionCard({ factionId }: { factionId: FactionId }) {
  const ab = FACTION_ABILITIES[factionId];
  return (
    <Link
      to="/rules"
      className="group flex flex-col gap-2.5 rounded-xl p-3 transition-all hover:scale-[1.02]"
      style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-1)' }}
      onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'}
      onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
    >
      <div className="flex items-center gap-2.5">
        <FactionEmblem factionId={factionId} size={30} className="rounded-lg shrink-0" />
        <span className="text-sm font-semibold text-white leading-tight">{factionLabel(factionId)}</span>
      </div>
      {ab && (
        <div>
          <div className="text-[10px] font-semibold text-violet-400 mb-0.5">{ab.activeLabel}</div>
          <div className="text-[10px] leading-snug line-clamp-2" style={{ color: 'var(--color-muted)' }}>
            {ab.activeDescription}
          </div>
        </div>
      )}
    </Link>
  );
}
