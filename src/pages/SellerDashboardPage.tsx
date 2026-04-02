/**
 * SellerDashboardPage — панель продавца.
 *
 * Статистика, заказы к отправке, отзывы, управление купонами, быстрые действия.
 */

import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Package,
  Star,
  Clock,
  ChevronRight,
  Plus,
  BarChart3,
  Store,
} from 'lucide-react';
import { useSellerDashboard } from '@/hooks/useSellerDashboard';
import { SellerStatsCards } from '@/components/shop/SellerStatsCards';
import { CouponManager } from '@/components/shop/CouponManager';

export default function SellerDashboardPage() {
  const navigate = useNavigate();
  const { stats, recentOrders, pendingReviews, loading, refresh } = useSellerDashboard();

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-blue-400" />
          <h1 className="font-bold text-lg">Панель продавца</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">
        {/* Статистика */}
        <section>
          <h2 className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-3">Статистика</h2>
          <SellerStatsCards stats={stats} />
        </section>

        {/* Быстрые действия */}
        <section>
          <h2 className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-3">Быстрые действия</h2>
          <div className="grid grid-cols-2 gap-3">
            <QuickAction
              icon={Plus}
              label="Добавить товар"
              onClick={() => navigate('/shop')}
            />
            <QuickAction
              icon={BarChart3}
              label="Аналитика"
              onClick={refresh}
            />
          </div>
        </section>

        {/* Заказы к отправке */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Последние заказы
            </h2>
            {recentOrders.length > 0 && (
              <span className="text-zinc-600 text-xs">{recentOrders.length}</span>
            )}
          </div>

          {recentOrders.length === 0 ? (
            <div className="bg-zinc-800/40 rounded-xl p-6 text-center">
              <Package className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">Заказов пока нет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentOrders.slice(0, 5).map(order => (
                <div
                  key={order.id}
                  className="bg-zinc-800/60 rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-lg bg-zinc-700 flex items-center justify-center flex-shrink-0">
                    <OrderStatusIcon status={order.status} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      Заказ #{order.id.slice(0, 8)}
                    </p>
                    <p className="text-zinc-500 text-xs">
                      {formatOrderStatus(order.status)} · {formatMoney(Number(order.total_amount))}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Отзывы */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
              Последние отзывы
            </h2>
          </div>

          {pendingReviews.length === 0 ? (
            <div className="bg-zinc-800/40 rounded-xl p-6 text-center">
              <Star className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-500 text-sm">Отзывов пока нет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingReviews.map(review => (
                <div key={review.id} className="bg-zinc-800/60 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-600'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-zinc-500 text-xs">
                      {new Date(review.created_at).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  {review.text && (
                    <p className="text-zinc-300 text-sm line-clamp-2">{review.text}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Купоны */}
        <section>
          <CouponManager />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-zinc-800/60 hover:bg-zinc-800 rounded-xl p-4 flex flex-col items-center gap-2 transition-colors min-h-[44px]"
      aria-label={label}
    >
      <Icon className="w-6 h-6 text-blue-400" />
      <span className="text-white text-xs font-medium">{label}</span>
    </button>
  );
}

function OrderStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return <Clock className="w-4 h-4 text-yellow-400" />;
    case 'confirmed':
      return <Package className="w-4 h-4 text-blue-400" />;
    case 'shipped':
      return <Package className="w-4 h-4 text-green-400" />;
    default:
      return <Package className="w-4 h-4 text-zinc-500" />;
  }
}

function formatOrderStatus(status: string): string {
  const map: Record<string, string> = {
    pending: 'Ожидает',
    confirmed: 'Подтверждён',
    shipped: 'Отправлен',
    delivered: 'Доставлен',
    cancelled: 'Отменён',
    returned: 'Возврат',
  };
  return map[status] ?? status;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(amount);
}
