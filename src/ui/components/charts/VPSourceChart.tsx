import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FactionStats } from '@simulation/types';

const SOURCES = [
  { key: 'roundGoalsAndFortressPerRound', label: 'goals + fortress/round', color: '#aa3bff' },
  { key: 'regionControl', label: 'region control', color: '#22d3ee' },
  { key: 'fortressEndGame', label: 'fortress endgame', color: '#facc15' },
  { key: 'fullBarracksBonus', label: 'full barracks', color: '#34d399' },
  { key: 'secretGoals', label: 'secret goals', color: '#f472b6' },
  { key: 'bothSecretGoalsBonus', label: 'both-secrets bonus', color: '#fb923c' },
] as const;

export function VPSourceChart({
  factionStats,
}: {
  factionStats: Record<string, FactionStats>;
}) {
  const data = Object.values(factionStats)
    .filter((f) => f.playCount > 0)
    .map((f) => ({
      faction: f.factionId,
      ...f.vpSources,
    }));

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#26262e" />
          <XAxis dataKey="faction" stroke="#9aa0a6" tick={{ fontSize: 11 }} />
          <YAxis stroke="#9aa0a6" tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#15161c', border: '1px solid #2e303a' }}
            labelStyle={{ color: '#e8e6f0' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {SOURCES.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="vp" fill={s.color} name={s.label} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
