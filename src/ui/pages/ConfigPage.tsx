// Phase 6: in-browser config editor.
// Changes are stored in localStorage via configStore and picked up by the
// sim runner and loadConfigs() calls automatically.

import { useNavigate } from 'react-router';
import { useConfigStore } from '@ui/configStore';
import { PERSONALITIES } from '@ai/personalities';
import { FACTION_ABILITIES } from '@engine/factions/abilities';
import type { FactionId, RulesConfig } from '@engine/types';
import type { FactionWeights } from '@ai/types';
import rulesDefault from '@config/rules.json';
import costsDefault from '@config/costs.json';

const ALL_FACTIONS: FactionId[] = [
  'warriors', 'assassins', 'mages', 'necromancers',
  'merchants', 'rangers', 'paladins', 'beastmasters',
];

const WEIGHT_FIELDS: { key: keyof FactionWeights; label: string }[] = [
  { key: 'fortressPriority',    label: 'Fortress' },
  { key: 'battlePriority',      label: 'Battle' },
  { key: 'enginePriority',      label: 'Engine' },
  { key: 'resourceHoarding',    label: 'Hoard' },
  { key: 'riskTolerance',       label: 'Risk' },
  { key: 'goalFocus',           label: 'Goals' },
  { key: 'combinationAffinity', label: 'Combine' },
  { key: 'mercenaryAffinity',   label: 'Mercs' },
];

function Section({
  title,
  onReset,
  children,
}: {
  title: string;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-neutral-800 bg-neutral-900/40 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-300">{title}</h2>
        <button
          type="button"
          onClick={onReset}
          className="rounded border border-neutral-700 px-2 py-1 text-[10px] text-neutral-400 hover:bg-neutral-800"
        >
          Reset to default
        </button>
      </div>
      {children}
    </section>
  );
}

function NumInput({
  label,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number | undefined;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}) {
  const displayed = value ?? defaultValue;
  const modified = value !== undefined && value !== defaultValue;
  return (
    <label className="flex flex-col gap-1">
      <span className={`text-[10px] uppercase tracking-wide ${modified ? 'text-amber-400' : 'text-neutral-500'}`}>
        {label}{modified ? ' *' : ''}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={displayed}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-20 rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-100"
      />
    </label>
  );
}

function WeightSlider({
  label,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  value: number | undefined;
  defaultValue: number;
  onChange: (n: number) => void;
}) {
  const displayed = value ?? defaultValue;
  const modified = value !== undefined && Math.abs(value - defaultValue) > 0.001;
  return (
    <div className="flex items-center gap-2">
      <span className={`w-16 text-[10px] ${modified ? 'text-amber-400' : 'text-neutral-500'}`}>
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={displayed}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-purple-500"
      />
      <span className={`w-8 text-right text-[10px] tabular-nums ${modified ? 'text-amber-300 font-semibold' : 'text-neutral-400'}`}>
        {displayed.toFixed(2)}
      </span>
    </div>
  );
}

export function ConfigPage() {
  const navigate = useNavigate();
  const {
    overrides,
    setRuleOverride,
    setCostOverride,
    setWeightOverride,
    resetAll,
    resetRules,
    resetCosts,
    resetWeights,
  } = useConfigStore();

  const ruleVal = <K extends keyof RulesConfig>(k: K): RulesConfig[K] | undefined =>
    overrides.rules[k] as RulesConfig[K] | undefined;

  const defaultRules = rulesDefault as RulesConfig;
  const defaultCosts = costsDefault as typeof costsDefault & {
    dieUpgrade: { iron: number; gold: number; essence: number };
    barracksExpand: { iron: number; gold: number; essence: number };
    cardKeep: { iron: number; gold: number; essence: number };
  };

  const hasAnyOverride =
    Object.keys(overrides.rules).length > 0 ||
    Object.keys(overrides.costs).length > 0 ||
    Object.keys(overrides.factionWeights).length > 0;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Config Editor</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Tweak rules, costs, and AI weights. Changes persist in localStorage and take effect
            immediately on the next sim run.
          </p>
        </div>
        <div className="flex gap-2">
          {hasAnyOverride && (
            <button
              type="button"
              onClick={resetAll}
              className="rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-300 hover:bg-red-900/50"
            >
              Reset all
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate('/sim')}
            className="rounded bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-600"
          >
            Run sim →
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* ── Rules ── */}
        <Section title="Rules" onReset={resetRules}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <NumInput
              label="Total rounds"
              value={ruleVal('totalRounds') as number | undefined}
              defaultValue={defaultRules.totalRounds}
              min={4} max={12}
              onChange={(v) => setRuleOverride('totalRounds', v)}
            />
            <NumInput
              label="Resource cap"
              value={ruleVal('resourceCap') as number | undefined}
              defaultValue={defaultRules.resourceCap}
              min={4} max={16}
              onChange={(v) => setRuleOverride('resourceCap', v)}
            />
            <NumInput
              label="Threat threshold"
              value={ruleVal('threatTrackThreshold') as number | undefined}
              defaultValue={defaultRules.threatTrackThreshold}
              min={3} max={20}
              onChange={(v) => setRuleOverride('threatTrackThreshold', v)}
            />
            <NumInput
              label="Free-for-all round"
              value={ruleVal('freeForAllRound') as number | undefined}
              defaultValue={defaultRules.freeForAllRound}
              min={4} max={12}
              onChange={(v) => setRuleOverride('freeForAllRound', v)}
            />
          </div>
          <p className="mt-3 text-[10px] text-neutral-600">
            Specialist sequence and toggle flags are edited in config/rules.json directly.
          </p>
        </Section>

        {/* ── Costs ── */}
        <Section title="Economy costs" onReset={resetCosts}>
          <div className="space-y-3">
            {(['dieUpgrade', 'barracksExpand', 'cardKeep'] as const).map((section) => (
              <div key={section} className="flex flex-wrap items-center gap-4">
                <span className="w-28 text-xs text-neutral-400">
                  {section === 'dieUpgrade' ? 'Die upgrade'
                    : section === 'barracksExpand' ? 'Barracks expand'
                    : 'Card keep (extra)'}
                </span>
                {(['iron', 'gold', 'essence'] as const).map((res) => (
                  <NumInput
                    key={res}
                    label={res}
                    value={overrides.costs[section]?.[res]}
                    defaultValue={defaultCosts[section][res]}
                    min={0} max={10}
                    onChange={(v) => setCostOverride(section, res, v)}
                  />
                ))}
              </div>
            ))}
          </div>
        </Section>

        {/* ── Faction weights ── */}
        <Section title="AI faction weights" onReset={resetWeights}>
          <p className="mb-3 text-[10px] text-neutral-500">
            Amber = modified from default. Drag a slider to override a faction's AI personality.
            Run Sim to see balance impact.
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {ALL_FACTIONS.map((factionId) => {
              const defaults = PERSONALITIES[factionId];
              const over = overrides.factionWeights[factionId] ?? {};
              const ab = FACTION_ABILITIES[factionId];
              return (
                <div key={factionId} className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold capitalize">{factionId}</span>
                    <span className="text-[10px] text-neutral-500">{ab?.activeLabel}</span>
                  </div>
                  <div className="space-y-1">
                    {WEIGHT_FIELDS.map(({ key, label }) => (
                      <WeightSlider
                        key={key}
                        label={label}
                        value={over[key]}
                        defaultValue={defaults[key]}
                        onChange={(v) => setWeightOverride(factionId, key, v)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>
    </main>
  );
}
