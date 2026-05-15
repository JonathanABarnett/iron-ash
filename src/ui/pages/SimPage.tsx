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

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Iron &amp; Ash — Simulation</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Run AI-vs-AI batches and see balance warnings against the spec's targets.
      </p>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-neutral-400">
          Games
          <input
            type="number"
            min={1}
            max={5000}
            value={form.numGames}
            onChange={(e) => setForm({ numGames: Number(e.target.value) })}
            className="rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-neutral-400">
          Difficulty
          <select
            value={form.difficulty}
            onChange={(e) =>
              setForm({ difficulty: e.target.value as 'easy' | 'medium' | 'hard' })
            }
            className="rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="easy">Easy (30% noise)</option>
            <option value="medium">Medium (10% noise)</option>
            <option value="hard">Hard (3% noise)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-neutral-400">
          Seed
          <input
            type="text"
            value={form.seed}
            onChange={(e) => setForm({ seed: e.target.value })}
            className="rounded bg-neutral-800 px-3 py-2 text-sm font-mono text-neutral-100"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={runState === 'running'}
            onClick={onRun}
            className="w-full rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
          >
            {runState === 'running' ? 'Running…' : 'Run sim'}
          </button>
        </div>
      </section>

      {error && (
        <div className="mt-6 rounded border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {result && (
        <section className="mt-8 space-y-6">
          <header className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold">Results</h2>
            <div className="flex items-center gap-3 text-xs text-neutral-400">
              <span>
                {result.gamesRun} games in {result.elapsedMs}ms (
                {(result.gamesRun / Math.max(1, result.elapsedMs / 1000)).toFixed(1)} games/sec)
              </span>
              <button
                type="button"
                onClick={onExportJson}
                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
              >
                Export JSON
              </button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 md:grid-cols-5">
            <Stat label="avg game length" value={`${result.rulePressure.avgGameLength.toFixed(2)} rounds`} />
            <Stat
              label="round-7 reach"
              value={`${(result.rulePressure.round7ReachRate * 100).toFixed(1)}%`}
              warn={
                result.rulePressure.round7ReachRate < 0.3 ||
                result.rulePressure.round7ReachRate > 0.5
              }
            />
            <Stat
              label="fortress turnover"
              value={`${(result.rulePressure.fortressTurnoverRate * 100).toFixed(1)}%`}
              warn={result.rulePressure.fortressTurnoverRate < 0.6}
            />
            <Stat
              label="combine rate"
              value={`${(result.rulePressure.combineActionRate * 100).toFixed(1)}%`}
            />
            <Stat
              label="merc hire rate"
              value={`${(result.rulePressure.mercenaryHireRate * 100).toFixed(2)}%`}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Faction win rate">
              <FactionWinChart factionStats={result.factionStats} />
            </Panel>
            <Panel title="Specialist claim rate by round">
              <SpecialistCurveChart values={result.rulePressure.specialistClaimByRound} />
              <p className="mt-1 text-xs text-neutral-500">
                Dashed line = 40% target for rounds 1–2.
              </p>
            </Panel>
          </div>

          <Panel title="VP sources by faction">
            <VPSourceChart factionStats={result.factionStats} />
          </Panel>

          <Panel title="Faction stats">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="py-1">Faction</th>
                  <th className="py-1 text-right">Plays</th>
                  <th className="py-1 text-right">Win %</th>
                  <th className="py-1 text-right">Avg VP</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(result.factionStats)
                  .filter((f) => f.playCount > 0)
                  .map((f) => (
                    <tr key={f.factionId} className="border-t border-neutral-800">
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-2">
                          <FactionEmblem factionId={f.factionId as FactionId} size={28} />
                          <span>{factionLabel(f.factionId as FactionId)}</span>
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{f.playCount}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {(f.winRate * 100).toFixed(1)}%
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{f.avgVP.toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Panel>

          {result.warnings.length > 0 && (
            <Panel title={`Warnings (${result.warnings.length})`} warn>
              <ul className="space-y-1 text-sm text-amber-200">
                {result.warnings.map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </Panel>
          )}

          {/* Baseline compare */}
          <Panel title="Compare vs baseline">
            <div className="mb-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => baselineRef.current?.click()}
                className="rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
              >
                {baseline ? 'Replace baseline…' : 'Load baseline JSON…'}
              </button>
              <input
                ref={baselineRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={onLoadBaseline}
              />
              {baseline && (
                <span className="text-xs text-neutral-400">
                  Baseline: {baselineLabel} ({baseline.gamesRun} games)
                </span>
              )}
            </div>

            {baseline ? (
              <CompareTable current={result} baseline={baseline} />
            ) : (
              <p className="text-xs text-neutral-500">
                Export a previous sim result and load it here to diff faction win rates and key metrics.
              </p>
            )}
          </Panel>
        </section>
      )}
    </main>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        warn ? 'border-amber-700 bg-amber-950/30' : 'border-neutral-800 bg-neutral-900/40'
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`text-sm font-medium ${warn ? 'text-amber-200' : 'text-neutral-100'}`}>
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  warn,
}: {
  title: string;
  children: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded border p-4 ${
        warn ? 'border-amber-800 bg-amber-950/20' : 'border-neutral-800 bg-neutral-900/40'
      }`}
    >
      <h3
        className={`mb-3 text-xs font-semibold uppercase tracking-wide ${
          warn ? 'text-amber-300' : 'text-neutral-400'
        }`}
      >
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
    <div className="space-y-4">
      {/* Metric rows */}
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="py-1">Metric</th>
            <th className="py-1 text-right">Baseline</th>
            <th className="py-1 text-right">Current</th>
            <th className="py-1 text-right">Δ</th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map(({ label, key, fmt, warnDir }) => {
            const bv = baseline.rulePressure[key] as number;
            const cv = current.rulePressure[key] as number;
            const delta = cv - bv;
            return (
              <tr key={label} className="border-t border-neutral-800">
                <td className="py-1 text-neutral-400">{label}</td>
                <td className="py-1 text-right tabular-nums text-neutral-400">{fmt(bv)}</td>
                <td className="py-1 text-right tabular-nums">{fmt(cv)}</td>
                <td className="py-1 text-right tabular-nums">
                  <DiffBadge delta={delta} {...(warnDir ? { warnDir } : {})} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
