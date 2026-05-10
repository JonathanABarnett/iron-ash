import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { FactionStats } from '@simulation/types';

export function FactionWinChart({
  factionStats,
}: {
  factionStats: Record<string, FactionStats>;
}) {
  const data = Object.values(factionStats)
    .filter((f) => f.playCount > 0)
    .map((f) => ({
      faction: f.factionId,
      winRate: Number((f.winRate * 100).toFixed(1)),
      avgVP: Number(f.avgVP.toFixed(1)),
    }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#26262e" />
          <XAxis dataKey="faction" stroke="#9aa0a6" tick={{ fontSize: 11 }} />
          <YAxis stroke="#9aa0a6" tick={{ fontSize: 11 }} unit="%" />
          <Tooltip
            contentStyle={{ background: '#15161c', border: '1px solid #2e303a' }}
            labelStyle={{ color: '#e8e6f0' }}
          />
          <Bar dataKey="winRate" fill="#aa3bff" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
