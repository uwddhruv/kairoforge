'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface DataPoint {
  date: string;
  price: number;
}

interface Props {
  data: DataPoint[];
  symbol: string;
  color?: string;
}

export function PriceChart({ data, symbol, color = '#7B5EDB' }: Props) {
  if (!data || data.length === 0) return null;

  return (
    <div className="kf-card p-6">
      <h3 className="text-sm font-semibold text-white mb-4">{symbol} — Price History</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`gradient-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#6b6b80', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6b6b80', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={v => `₹${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#111118',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '12px',
              color: '#e0e0f0',
            }}
            formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Price']}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill={`url(#gradient-${symbol})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
