/**
 * ShopOrdersPage — "Мои заказы" покупателя B2C.
 *
 * Использует useCheckout.getMyOrders для получения заказов из shop_orders.
 * Показывает:
 *  - поиск по номеру заказа
 *  - фильтр по статусу
 *  - карточки заказов с суммой и статусом
 *  - ссылка на детальный просмотр (OrderDetailPage на /orders/:id)
 */

import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Package, Search, Filter, Truck, Clock,
  CheckCircle2, XCircle, RotateCcw
} from 'lucide-react';
import { useCheckout } from '@/hooks/useCheckout';
import { toast } from 'sonner';

type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';

const ALL_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  pending:   { label: 'Ожидает подтверждения', icon: Clock,         color: 'text-yellow-400' },
  confirmed: { label: 'Подтверждён',           icon: CheckCircle2,  color: 'text-blue-400'   },
  shipped:   { label: 'Отправлен',              icon: Truck,         color: 'text-indigo-400' },
  delivered: { label: 'Доставлен',              icon: CheckCircle2,  color: 'text-green-400'  },
  cancelled: { label: 'Отменён',               icon: XCircle,       color: 'text-red-400'    },
};

export default function ShopOrdersPage() {
  const navigate = useNavigate();
  const { getMyOrders, cancelOrder, loading } = useCheckout();

  const [orders, setOrders] = useState<Awaited<ReturnType<typeof getMyOrders>>>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeStatus, setActiveStatus] = useState<string>('all');

  useEffect(() => {
    void (async () => {
      const data = await getMyOrders();
      setOrders(data ?? []);
    })();
  }, [getMyOrders]);

  const filteredOrders = useMemo(() => {
    return orders
      .filter(o => {
        const matchesSearch = !searchTerm || o.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = activeStatus === 'all' || o.status === activeStatus;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, searchTerm, activeStatus]);

  const handleCancel = async (orderId: string) => {
    if (!window.confirm('Отменить заказ?')) return;
    try {
      await cancelOrder(orderId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
    } catch (e: any) {
      toast.error('Ошибка отмены: ' + e.message);
    }
  };

  const totalAmount = filteredOrders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.total_amount ?? 0), 0);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-lg">Мои заказы</h1>
        <button
          onClick={() => navigate('/shop/returns')}
          className="ml-auto flex items-center gap-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Возвраты
        </button>
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-4">
        {/* Общая сумма */}
        {orders.length > 0 && (
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center justify-between">
            <div>
              <p className="text-zinc-400 text-sm">Общий оборот</p>
              <p className="text-2xl font-bold">{totalAmount.toLocaleString('ru-RU')} ₽</p>
            </div>
            <div className="text-right">
              <p className="text-zinc-400 text-sm">Всего заказов</p>
              <p className="text-2xl font-bold">{orders.length}</p>
            </div>
          </div>
        )}

        {/* Поиск и фильтр по статусу */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Поиск по номеру заказа..."
              className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={activeStatus}
            onChange={e => setActiveStatus(e.target.value)}
            className="bg-zinc-800 text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            title="Фильтрация по статусу"
          >
            <option value="all">Все</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
            ))}
          </select>
        </div>

        {/* Быстрые фильтры-чекбоксы */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {ALL_STATUSES.map(s => {
            const cfg = STATUS_CONFIG[s];
            const count = orders.filter(o => o.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setActiveStatus(prev => prev === s ? 'all' : s)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs transition-colors border ${
                  activeStatus === s
                    ? `${cfg.color.replace('text-','bg-').replace('400','500/20')} ${cfg.color} border-current`
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                }`}
              >
                {cfg.icon && <cfg.icon className="w-3 h-3 inline mr-1" />}
                {cfg.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Список заказов */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
            <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 text-sm">{searchTerm ? 'Ничего не найдено' : 'Заказов пока нет'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order, i) => {
              const cfg = STATUS_CONFIG[order.status as OrderStatus] ?? STATUS_CONFIG.pending;
              return (
                <motion.button
                  key={order.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="w-full bg-zinc-900 rounded-2xl p-4 border border-zinc-800 text-left hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-mono text-xs text-zinc-500">{order.id.slice(0, 8)}…</p>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap ${cfg.color.replace('text-','bg-').replace('400','500/20')} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>
                      <p className="text-zinc-400 text-xs mt-0.5">
                        {new Date(order.created_at).toLocaleDateString('ru-RU')}{' '}
                        {new Date(order.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-white font-semibold text-sm">
                          {(order.total_amount ?? 0).toLocaleString('ru-RU')} ₽
                        </span>
                        <span className="text-zinc-500 text-xs">
                          {Array.isArray(order.items) ? order.items.length : 0} позиц{[
                            'ия','ий','ий'
                          ][(Array.isArray(order.items) ? order.items.length : 0) % 10 === 1 ? 0 : 1]}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {order.status === 'pending' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleCancel(order.id); }}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors"
                          title="Отменить"
                        >
                          <XCircle className="w-4 h-4 text-red-400" />
                        </button>
                      )}
                      <div className={`p-1.5 rounded-lg ${cfg.color.replace('text-','bg-').replace('400','500/10')}`}>
                        <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                      </div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
