import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, BarChart3, TrendingUp, TrendingDown, 
  DollarSign, ShoppingBag, Package, Calendar, 
  Download, Filter, RefreshCw
} from 'lucide-react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useMarketplaceAnalytics } from '@/hooks/useMarketplaceAnalytics';
import { toast } from 'sonner';

export default function MarketplaceAnalyticsPage() {
  const navigate = useNavigate();
  const { connections } = useMarketplace();
  const { 
    dailyMetrics, 
    productPerformance, 
    marketplaceComparison,
    loadDailyMetrics,
    loadProductPerformance, 
    loadMarketplaceComparison,
  } = useMarketplaceAnalytics();

  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('all');

  const activeConnections = connections.filter(c => c.is_active);

  useEffect(() => {
    const endDate = new Date();
    const startDate = new Date();
    
    if (period === 'week') startDate.setDate(endDate.getDate() - 7);
    if (period === 'month') startDate.setDate(endDate.getDate() - 30);
    if (period === 'quarter') startDate.setDate(endDate.getDate() - 90);

    void loadDailyMetrics(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    void loadProductPerformance(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
    void loadMarketplaceComparison(
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );
  }, [period, loadDailyMetrics, loadProductPerformance, loadMarketplaceComparison]);

  const stats = {
    totalRevenue: dailyMetrics.reduce((sum, m) => sum + Number(m.revenue || 0), 0),
    totalOrders: dailyMetrics.reduce((sum, m) => sum + Number(m.orders || 0), 0),
    totalProfit: dailyMetrics.reduce((sum, m) => sum + Number(m.profit || 0), 0),
    avgOrderValue: dailyMetrics.length > 0 
      ? dailyMetrics.reduce((sum, m) => sum + Number(m.revenue || 0), 0) / 
        dailyMetrics.reduce((sum, m) => sum + Number(m.orders || 0), 1)
      : 0,
  };

  const getMarketplaceName = (type: string) => {
    const names: Record<string, string> = {
      ozon: 'Ozon',
      wildberries: 'Wildberries',
      amazon: 'Amazon',
      internal: 'Внутренний',
    };
    return names[type] || type;
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-4 py-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/marketplace')}
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              Назад
            </button>
            <h1 className="text-2xl font-bold">Аналитика маркетплейса</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as any)}
              className="bg-zinc-800 text-white rounded-xl px-4 py-2 text-sm outline-none"
            >
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="quarter">Квартал</option>
            </select>
            <button
              onClick={() => {
                void loadDailyMetrics(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], new Date().toISOString().split('T')[0]);
                void loadProductPerformance(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], new Date().toISOString().split('T')[0]);
              }}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Обновить
            </button>
          </div>
        </div>

        {/* Основные метрики */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
          >
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-zinc-400 text-sm">Выручка</p>
                <p className="text-2xl font-bold">{stats.totalRevenue.toLocaleString()} ₽</p>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
          >
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-zinc-400 text-sm">Заказов</p>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
          >
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-zinc-400 text-sm">Прибыль</p>
                <p className="text-2xl font-bold">{stats.totalProfit.toLocaleString()} ₽</p>
              </div>
            </div>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-zinc-400 text-sm">Средний чек</p>
                <p className="text-2xl font-bold">{Math.round(stats.avgOrderValue).toLocaleString()} ₽</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* График продаж (упрощенный) */}
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6">
          <h2 className="text-lg font-semibold mb-4">Продажи за период</h2>
          <div className="h-48 flex items-end justify-between gap-1">
            {dailyMetrics.slice(-14).map((m, i) => {
              const max = Math.max(...dailyMetrics.map(d => Number(d.revenue || 0)));
              const height = max > 0 ? (Number(m.revenue || 0) / max) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div 
                    className="w-full bg-blue-500 rounded-t"
                    style={{ height: `${height}%` }}
                  />
                  <span className="text-xs text-zinc-500">
                    {new Date(m.date).getDate()}.{new Date(m.date).getMonth() + 1}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Таблица товаров */}
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6">
          <h2 className="text-lg font-semibold mb-4">Топ товаров</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-2 text-zinc-400">Товар</th>
                  <th className="text-left py-2 text-zinc-400">Продажи</th>
                  <th className="text-left py-2 text-zinc-400">Выручка</th>
                  <th className="text-left py-2 text-zinc-400">Прибыль</th>
                  <th className="text-left py-2 text-zinc-400">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {productPerformance.slice(0, 10).map((p, i) => (
                  <tr key={i} className="border-b border-zinc-800">
                    <td className="py-3 text-white">{p.product_title}</td>
                    <td className="py-3">{p.units_sold}</td>
                    <td className="py-3">{Number(p.revenue || 0).toLocaleString()} ₽</td>
                    <td className="py-3">{Number(p.profit || 0).toLocaleString()} ₽</td>
                    <td className="py-3">{p.profit_margin}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Сравнение площадок */}
        <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800">
          <h2 className="text-lg font-semibold mb-4">Сравнение площадок</h2>
          <div className="space-y-4">
            {marketplaceComparison.map((m, i) => (
              <div key={i} className="flex items-center justify-between p-4 bg-zinc-800 rounded-xl">
                <div>
                  <h3 className="font-semibold">{getMarketplaceName(m.marketplace)}</h3>
                  <p className="text-zinc-400 text-sm">
                    {m.total_orders} заказов • Средний чек: {Math.round(Number(m.avg_order_value) || 0).toLocaleString()} ₽
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold">{Number(m.total_revenue || 0).toLocaleString()} ₽</p>
                  <p className="text-green-400 text-sm">{m.profit_margin}% маржа</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}