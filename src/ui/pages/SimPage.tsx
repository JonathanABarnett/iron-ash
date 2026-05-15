import { useRef, useState } from 'react';
import { runSimulation } from '@simulation/runner';
import { useUIStore } from '@ui/store';
import { useConfigStore } from '@ui/configStore';
import { loadConfigs } from '@ui/configLoader';
import { FactionWinChart } from '@ui/components/charts/FactionWinChart';
import { SpecialistCurveChart } from '@ui/components/charts/SpecialistCurveChart';
import { VPSourceChart } from '@ui/components/charts/VPSourceChart';
import { FactionEmblem, factionLabel } from '@ui/components/FactionEmblem';
import type { FactionId } from '@engine/types';
import type { SimulationResult } from '@simulation/types';

export function SimPage() {
  const form = useUIStore((s) => s.form);
  const runState = useUIStore((s) => s.runState);
  const result = useUIStore((s) => s.result);
  const error = useUIStore((s) => s.error);
  const setForm = useUIStore((s) => s.setForm);
  const setRunState = useUIStore((s) => s.setRunState);
  const setResult = useUIStore((s) => s.setResult);
  const setError = useUIStore((s) => s.setError);
  const configOverrides = useConfigStore((s) => s.overrides);

  // Baseline for side-by-side comparison.
  const [baseline, setBaseline] = useState<SimulationResult | null>(null);
  const [baselineLabel, setBaselineLabel] = useState<string>('');
  const baselineRef = useRef<HTMLInputElement>(null);

  function onLoadBaseline(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string) as SimulationResult;
        setBaseline(data);
        setBaselineLabel(file.name.replace(/\.json$/, ''));
      } catch {
        /* silently ignore bad files */
      }
    };
    reader.readAsText(file);
  }

  function onRun() {
    setRunState('running');
    // Yield to the event loop so the "running" state paints before we block.
    setTimeout(() => {
      try {
        const configs = loadConfigs({
          rules: configOverrides.rules,
          costs: configOverrides.costs,
          factionWeightOverrides: configOverrides.factionWeights,
        });
        const r = runSimulation({
          numGames: form.numGames,
          difficulty: form.difficulty,
          seed: form.seed,
          configs,
        });
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, 50);
  }

  function onExportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.simulationId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const meanWinRate = result
    ? Object.values(result.factionStats).filter(f => f.playCount > 0).reduce((a, f) => a + f.winRate, 0)
      / Object.values(result.factionStats).filter(f => f.playCount > 0).length
    : 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 animate-fade-in">

      {/* ── Header ── */}
      <div className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Balance Simulation</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
              Run AI-vs-AI batches and check balance warnings against spec targets.
            </p>
          </div>
          {result && (
            <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              result.warnings.length === 0
                ? 'border-emerald-700/50 bg-emerald-950/30 text-emerald-300'
                : 'border-amber-700/50 bg-amber-950/30 text-amber-300'
            }`}>
              {result.warnings.length === 0 ? '✓ No warnings' : `⚠ ${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`}
            </div>
          )}
        </div>
      </div>

      {/* ── Config panel ── */}
      <div className="mb-8 rounded-2xl p-5" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
        <div className="mb-4 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>
          Simulation settings
        </div>

        {/* Quick presets */}
        <div className="mb-4">
          <div className="mb-2 text-[10px]" style={{ color: 'var(--color-subtle)' }}>Quick game count</div>
          <div className="flex gap-2 flex-wrap">
            {[50, 100, 200, 500, 1000].map((n) => (
              <button key={n} type="button"
                onClick={() => setForm({ numGames: n })}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:scale-[1.02]"
                style={{
                  borderColor: form.numGames === n ? 'rgba(124,58,237,0.6)' : 'var(--color-border)',
                  background: form.numGames === n ? 'rgba(124,58,237,0.12)' : 'transparent',
                  color: form.numGames === n ? '#a78bfa' : 'var(--color-muted)',
                }}
              >
                {n.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>Games</span>
            <input
              type="number" min={1} max={5000}
              value={form.numGames}
              onChange={(e) => setForm({ numGames: Number(e.target.value) })}
              className="rounded-xl border px-3 py-2 text-sm font-mono text-white focus:outline-none transition-colors"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>Difficulty</span>
            <select
              value={form.difficulty}
              onChange={(e) => setForm({ difficulty: e.target.value as 'easy' | 'medium' | 'hard' })}
              className="rounded-xl border px-3 py-2 text-sm text-white focus:outline-none transition-colors"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
            >
              <option value="easy">🟢 Easy (30% noise)</option>
              <option value="medium">🟡 Medium (10% noise)</option>
              <option value="hard">🔴 Hard (3% noise)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>Seed</span>
            <input
              type="text"
              value={form.seed}
              onChange={(e) => setForm({ seed: e.target.value })}
              className="rounded-xl border px-3 py-2 text-sm font-mono text-white focus:outline-none transition-colors"
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
              onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(124,58,237,0.5)'}
              onBlur={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={runState === 'running'}
              onClick={onRun}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: runState === 'running'
                  ? 'rgba(124,58,237,0.4)'
                  : 'linear-gradient(135deg,#7c3aed,#4f46e5)',
                boxShadow: runState === 'running' ? 'none' : '0 0 20px rgba(124,58,237,0.3)',
              }}
            >
              {runState === 'running' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white inline-block" />
                  Running…
                </span>
              ) : '▶ Run Sim'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div className="space-y-5 animate-slide-up">

          {/* Run summary bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
            <div className="flex flex-wrap gap-4 text-xs" style={{ color: 'var(--color-muted)' }}>
              <span><strong className="font-semibold text-white">{result.gamesRun.toLocaleString()}</strong> games</span>
              <span><strong className="font-semibold text-white">{result.elapsedMs}ms</strong> elapsed</span>
              <span><strong className="font-semibold text-white">{(result.gamesRun / Math.max(1, result.elapsedMs / 1000)).toFixed(0)}</strong> games/sec</span>
              <span><strong className="font-semibold text-white">{result.difficulty}</strong> difficulty</span>
            </div>
            <button type="button" onClick={onExportJson}
              className="rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:text-white"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
              Export JSON ↓
            </button>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-xl border p-4"
              style={{ borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)' }}>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-400">
                ⚠ Balance warnings ({result.warnings.length})
              </div>
              <ul className="space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-sm text-amber-200/90">· {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            <SimStat label="Avg length" value={`${result.rulePressure.avgGameLength.toFixed(1)}r`}
              warn={false} />
            <SimStat label="Round-7 reach" value={`${(result.rulePressure.round7ReachRate * 100).toFixed(1)}%`}
              warn={result.rulePressure.round7ReachRate < 0.3 || result.rulePressure.round7ReachRate > 0.5}
              target="30–50%" />
            <SimStat label="Fortress turn." value={`${(result.rulePressure.fortressTurnoverRate * 100).toFixed(1)}%`}
              warn={result.rulePressure.fortressTurnoverRate < 0.6}
              target="≥60%" />
            <SimStat label="Combine rate" value={`${(result.rulePressure.combineActionRate * 100).toFixed(1)}%`}
              warn={false} />
            <SimStat label="Merc hire" value={`${(result.rulePressure.mercenaryHireRate * 100).toFixed(1)}%`}
              warn={false} />
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SimPanel title="Faction win rate">
              <FactionWinChart factionStats={result.factionStats} />
            </SimPanel>
            <SimPanel title="Specialist claim by round">
              <SpecialistCurveChart values={result.rulePressure.specialistClaimByRound} />
              <p className="mt-2 text-[10px]" style={{ color: 'var(--color-subtle)' }}>
                Dashed = 40% target for rounds 1–2
              </p>
            </SimPanel>
          </div>

          <SimPanel title="VP sources by faction">
            <VPSourceChart factionStats={result.factionStats} />
          </SimPanel>

          {/* Faction stats table */}
          <SimPanel title="Faction breakdown">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>
                    <th className="pb-3">Faction</th>
                    <th className="pb-3 text-right">Plays</th>
                    <th className="pb-3 text-right">Win %</th>
                    <th className="pb-3 w-24">vs mean</th>
                    <th className="pb-3 text-right">Avg VP</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(result.factionStats)
                    .filter((f) => f.playCount > 0)
                    .sort((a, b) => b.winRate - a.winRate)
                    .map((f) => {
                      const deviation = f.winRate - meanWinRate;
                      const devPct = deviation * 100;
                      const isWarn = Math.abs(devPct) > 10;
                      return (
                        <tr key={f.factionId} className="border-t transition-colors"
                          style={{ borderColor: 'var(--color-border)' }}>
                          <td className="py-2.5">
                            <span className="inline-flex items-center gap-2.5">
                              <FactionEmblem factionId={f.factionId as FactionId} size={26} className="rounded-lg" />
                              <span className="font-medium text-white">{factionLabel(f.factionId as FactionId)}</span>
                            </span>
                          </td>
                          <td className="py-2.5 text-right tabular-nums" style={{ color: 'var(--color-muted)' }}>{f.playCount}</td>
                          <td className="py-2.5 text-right tabular-nums font-semibold"
                            style={{ color: isWarn ? (devPct > 0 ? '#fbbf24' : '#f87171') : 'white' }}>
                            {(f.winRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2">
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(100, Math.abs(devPct) * 5)}%`,
                                    background: isWarn ? (devPct > 0 ? '#fbbf24' : '#f87171') : '#34d399',
                                    marginLeft: devPct < 0 ? `${Math.min(50, Math.abs(devPct) * 5)}%` : '50%',
                                  }} />
                              </div>
                              <span className="text-[10px] tabular-nums" style={{ color: isWarn ? (devPct > 0 ? '#fbbf24' : '#f87171') : 'var(--color-subtle)' }}>
                                {devPct >= 0 ? '+' : ''}{devPct.toFixed(1)}pp
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right tabular-nums" style={{ color: 'var(--color-muted)' }}>
                            {f.avgVP.toFixed(1)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </SimPanel>

          {/* Compare vs baseline */}
          <SimPanel title="Compare vs baseline">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => baselineRef.current?.click()}
                className="rounded-xl border px-3 py-2 text-xs font-medium transition-all hover:text-white"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-muted)' }}>
                {baseline ? '↩ Replace baseline…' : '+ Load baseline JSON…'}
              </button>
              <input ref={baselineRef} type="file" accept=".json" className="hidden" onChange={onLoadBaseline} />
              {baseline && (
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  Comparing against <strong className="text-white">{baselineLabel}</strong> ({baseline.gamesRun} games)
                </span>
              )}
            </div>
            {baseline ? (
              <CompareTable current={result} baseline={baseline} />
            ) : (
              <p className="text-xs" style={{ color: 'var(--color-subtle)' }}>
                Export a previous sim result (button above) then load it here to diff faction win rates and key metrics side-by-side.
              </p>
            )}
          </SimPanel>
        </div>
      )}
    </main>
  );
}

function SimStat({ label, value, warn, target }: { label: string; value: string; warn: boolean; target?: string }) {
  return (
    <div className="rounded-xl p-3 transition-colors"
      style={{
        border: `1px solid ${warn ? 'rgba(245,158,11,0.3)' : 'var(--color-border)'}`,
        background: warn ? 'rgba(245,158,11,0.06)' : 'var(--color-surface-1)',
      }}>
      <div className="text-[10px] font-medium uppercase tracking-widest mb-1" style={{ color: 'var(--color-subtle)' }}>{label}</div>
      <div className="text-lg font-black tabular-nums" style={{ color: warn ? '#fbbf24' : 'white' }}>{value}</div>
      {target && <div className="text-[9px] mt-0.5" style={{ color: 'var(--color-subtle)' }}>target {target}</div>}
    </div>
  );
}

function SimPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--color-surface-1)', border: '1px solid var(--color-border)' }}>
      <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

// ── Sim compare table ───────────────────────────────────────────────────────

const ALL_FACTIONS: FactionId[] = [
  'warriors', 'assassins', 'mages', 'necromancers',
  'merchants', 'rangers', 'paladins', 'beastmasters',
];

const METRICS: { label: string; key: keyof import('@simulation/types').RulePressure; fmt: (v: number) => string; warnDir?: 'hi' | 'lo' }[] = [
  { label: 'avg game length', key: 'avgGameLength', fmt: (v) => v.toFixed(2) + ' rounds' },
  { label: 'round-7 reach', key: 'round7ReachRate', fmt: (v) => (v * 100).toFixed(1) + '%', warnDir: 'hi' },
  { label: 'fortress turnover', key: 'fortressTurnoverRate', fmt: (v) => (v * 100).toFixed(1) + '%', warnDir: 'lo' },
  { label: 'merc hire rate', key: 'mercenaryHireRate', fmt: (v) => (v * 100).toFixed(2) + '%' },
  { label: 'combine rate', key: 'combineActionRate', fmt: (v) => (v * 100).toFixed(1) + '%' },
];

function DiffBadge({ delta, warnDir }: { delta: number; warnDir?: 'hi' | 'lo' }) {
  if (Math.abs(delta) < 0.001) return <span className="text-neutral-500">—</span>;
  const isGood = warnDir === 'hi' ? delta > 0 : warnDir === 'lo' ? delta < 0 : false;
  const isBad = warnDir === 'hi' ? delta < 0 : warnDir === 'lo' ? delta > 0 : false;
  const color = isGood ? 'text-green-400' : isBad ? 'text-red-400' : 'text-neutral-300';
  const sign = delta > 0 ? '+' : '';
  const pct = delta * 100;
  const formatted = Math.abs(pct) > 1 ? `${sign}${pct.toFixed(1)}%` : `${sign}${(delta * 1000).toFixed(1)}‰`;
  return <span className={color}>{formatted}</span>;
}

function CompareTable({ current, baseline }: { current: SimulationResult; baseline: SimulationResult }) {
  return (
    <div className="space-y-5">
      {/* Metric rows */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--color-border)' }}>
        <table className="w-full text-left text-xs">
          <thead style={{ background: 'var(--color-surface-2)' }}>
            <tr className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--color-subtle)' }}>
              <th className="px-3 py-2">Metric</th>
              <th className="px-3 py-2 text-right">Baseline</th>
              <th className="px-3 py-2 text-right">Current</th>
              <th className="px-3 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {METRICS.map(({ label, key, fmt, warnDir }) => {
              const bv = baseline.rulePressure[key] as number;
              const cv = current.rulePressure[key] as number;
              const delta = cv - bv;
              return (
                <tr key={label} className="border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <td className="px-3 py-2" style={{ color: 'var(--color-muted)' }}>{label}</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: 'var(--color-muted)' }}>{fmt(bv)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-white">{fmt(cv)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    <DiffBadge delta={delta} {...(warnDir ? { warnDir } : {})} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Faction win rate diff */}
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="py-1">Faction</th>
            <th className="py-1 text-right">Base win%</th>
            <th className="py-1 text-right">Current win%</th>
            <th className="py-1 text-right">Δ</th>
            <th className="py-1 text-right">Base avgVP</th>
            <th className="py-1 text-right">Current avgVP</th>
            <th className="py-1 text-right">Δ VP</th>
          </tr>
        </thead>
        <tbody>
          {ALL_FACTIONS.map((fid) => {
            const bs = baseline.factionStats[fid];
            const cs = current.factionStats[fid];
            if (!bs || !cs || (bs.playCount === 0 && cs.playCount === 0)) return null;
            const winDelta = cs.winRate - bs.winRate;
            const vpDelta = cs.avgVP - bs.avgVP;
            return (
              <tr key={fid} className="border-t border-neutral-800">
                <td className="py-1">
                  <span className="inline-flex items-center gap-1.5">
                    <FactionEmblem factionId={fid} size={20} />
                    {factionLabel(fid)}
                  </span>
                </td>
                <td className="py-1 text-right tabular-nums text-neutral-400">
                  {(bs.winRate * 100).toFixed(1)}%
                </td>
                <td className="py-1 text-right tabular-nums">
                  {(cs.winRate * 100).toFixed(1)}%
                </td>
                <td className="py-1 text-right tabular-nums">
                  <DiffBadge delta={winDelta} />
                </td>
                <td className="py-1 text-right tabular-nums text-neutral-400">
                  {bs.avgVP.toFixed(1)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {cs.avgVP.toFixed(1)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  <DiffBadge delta={vpDelta} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
