import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export function SpecialistCurveChart({ values }: { values: Array<number | null> }) {
  const data = values.map((v, idx) => ({
    round: idx + 1,
    rate: v === null ? null : Number((v * 100).toFixed(1)),
  }));

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#26262e" />
          <XAxis dataKey="round" stroke="#9aa0a6" tick={{ fontSize: 11 }} />
          <YAxis stroke="#9aa0a6" tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
          <Tooltip
            contentStyle={{ background: '#15161c', border: '1px solid #2e303a' }}
            labelStyle={{ color: '#e8e6f0' }}
          />
          <ReferenceLine y={40} stroke="#6b7280" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="rate"
            stroke="#aa3bff"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
