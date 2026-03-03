import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { DailyEarning } from '@/hooks/useCreatorFund';

interface EarningsChartProps {
  earnings: DailyEarning[];
}

type Period = '7d' | '30d' | '90d';

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 shadow-xl">
        <p className="text-xs text-zinc-400">{label}</p>
        <p className="text-sm font-bold text-white">
          {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(payload[0].value)}
        </p>
      </div>
    );
  }
  return null;
};

export function EarningsChart({ earnings }: EarningsChartProps) {
  const [period, setPeriod] = useState<Period>('30d');

  const data = useMemo(() => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const sliced = earnings.slice(0, days).reverse();
    return sliced.map(e => ({
      date: new Date(e.earning_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
      amount: Number(e.amount),
    }));
  }, [earnings, period]);

  const periods: { label: string; value: Period }[] = [
    { label: '7 дн', value: '7d' },
    { label: '30 дн', value: '30d' },
    { label: '90 дн', value: '90d' },
  ];

  return (
    <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Динамика заработка</h3>
        <div className="flex gap-1 bg-zinc-800 rounded-xl p-1">
          {periods.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                period === p.value
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-zinc-600 text-sm">
          Нет данных за этот период
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#71717a' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `${v}₽`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="#ffffff"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#ffffff', strokeWidth: 0 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
