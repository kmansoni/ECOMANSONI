/**
 * SellerStatsCards — карточки статистики продавца.
 */

import { DollarSign, ShoppingBag, Star, Truck, TrendingDown, BarChart3 } from 'lucide-react';
import { type SellerStats } from '@/hooks/useSellerDashboard';

interface SellerStatsCardsProps {
  stats: SellerStats;
  loading?: boolean;
}

export function SellerStatsCards({ stats, loading }: SellerStatsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-zinc-800/60 rounded-xl p-4 animate-pulse">
            <div className="w-8 h-8 bg-zinc-700 rounded-lg mb-3" />
            <div className="w-16 h-5 bg-zinc-700 rounded mb-1" />
            <div className="w-24 h-3 bg-zinc-700 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Выручка',
      value: formatMoney(stats.totalRevenue),
      icon: DollarSign,
      iconBg: 'bg-green-900/40',
      iconColor: 'text-green-400',
    },
    {
      label: 'Заказы',
      value: stats.totalOrders.toString(),
      icon: ShoppingBag,
      iconBg: 'bg-blue-900/40',
      iconColor: 'text-blue-400',
    },
    {
      label: 'Рейтинг',
      value: stats.averageRating > 0 ? stats.averageRating.toFixed(1) : '—',
      icon: Star,
      iconBg: 'bg-yellow-900/40',
      iconColor: 'text-yellow-400',
    },
    {
      label: 'К отправке',
      value: stats.pendingShipments.toString(),
      icon: Truck,
      iconBg: 'bg-orange-900/40',
      iconColor: 'text-orange-400',
    },
    {
      label: 'Возвраты',
      value: `${stats.returnRate}%`,
      icon: TrendingDown,
      iconBg: stats.returnRate > 10 ? 'bg-red-900/40' : 'bg-zinc-800',
      iconColor: stats.returnRate > 10 ? 'text-red-400' : 'text-zinc-400',
    },
    {
      label: 'Топ товар',
      value: stats.topProducts[0]?.name ?? '—',
      icon: BarChart3,
      iconBg: 'bg-purple-900/40',
      iconColor: 'text-purple-400',
      truncate: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className="bg-zinc-800/60 rounded-xl p-4 flex flex-col gap-2"
        >
          <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center`}>
            <card.icon className={`w-4 h-4 ${card.iconColor}`} />
          </div>
          <p className={`text-white font-bold text-lg leading-tight ${card.truncate ? 'truncate text-sm' : ''}`}>
            {card.value}
          </p>
          <p className="text-zinc-500 text-xs">{card.label}</p>
        </div>
      ))}
    </div>
  );
}

function formatMoney(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M ₽`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(1)}K ₽`;
  }
  return `${amount.toLocaleString('ru-RU')} ₽`;
}
