import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Package, Truck, MapPin, Clock, DollarSign, 
  CheckCircle, XCircle, AlertCircle, RefreshCw, Filter
} from 'lucide-react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { toast } from 'sonner';

export default function MarketplaceOrdersPage() {
  const navigate = useNavigate();
  const { 
    marketplaceOrders, 
    connections,
    loadMarketplaceOrders,
    changeOrderStatus,
  } = useMarketplace();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedConnection, setSelectedConnection] = useState<string>('all');

  const activeConnections = connections.filter(c => c.is_active);
  
  const filteredOrders = marketplaceOrders.filter(order => {
    const matchesSearch = !searchTerm || 
      order.marketplace_order_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = selectedStatus === 'all' || order.status === selectedStatus;
    const matchesMarketplace = selectedConnection === 'all' || 
      order.connection_id === selectedConnection;
    return matchesSearch && matchesStatus && matchesMarketplace;
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      confirmed: 'bg-blue-500/20 text-blue-400',
      packed: 'bg-purple-500/20 text-purple-400',
      shipped: 'bg-indigo-500/20 text-indigo-400',
      delivered: 'bg-green-500/20 text-green-400',
      cancelled: 'bg-red-500/20 text-red-400',
      returned: 'bg-orange-500/20 text-orange-400',
    };
    return colors[status] || 'bg-zinc-500/20 text-zinc-400';
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: 'Ожидает',
      confirmed: 'Подтверждён',
      packed: 'Упакован',
      shipped: 'Отправлен',
      delivered: 'Доставлен',
      cancelled: 'Отменён',
      returned: 'Возвращён',
    };
    return labels[status] || status;
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    const success = await changeOrderStatus(orderId, newStatus as any);
    if (success) {
      toast.success('Статус заказа обновлён');
    }
  };

  const handleSync = async () => {
    await loadMarketplaceOrders(selectedConnection === 'all' ? undefined : selectedConnection);
    toast.success('Синхронизация завершена');
  };

  const getMarketplaceName = (type: string) => {
    const names: Record<string, string> = {
      ozon: 'Ozon',
      wildberries: 'Wildberries',
      amazon: 'Amazon',
    };
    return names[type] || type;
  };

  const stats = {
    total: filteredOrders.length,
    pending: filteredOrders.filter(o => o.status === 'pending').length,
    shipped: filteredOrders.filter(o => o.status === 'shipped').length,
    delivered: filteredOrders.filter(o => o.status === 'delivered').length,
    totalAmount: filteredOrders.reduce((sum, o) => sum + o.total_amount, 0),
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
            <h1 className="text-2xl font-bold">Заказы с маркетплейсов</h1>
          </div>
          <button
            onClick={handleSync}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Синхронизировать
          </button>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <p className="text-zinc-400 text-sm mb-1">Всего заказов</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <p className="text-zinc-400 text-sm mb-1">Ожидают</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <p className="text-zinc-400 text-sm mb-1">Отправлены</p>
            <p className="text-2xl font-bold text-blue-400">{stats.shipped}</p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <p className="text-zinc-400 text-sm mb-1">Доставлены</p>
            <p className="text-2xl font-bold text-green-400">{stats.delivered}</p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <p className="text-zinc-400 text-sm mb-1">Общий оборот</p>
            <p className="text-2xl font-bold">{stats.totalAmount.toLocaleString()} ₽</p>
          </div>
        </div>

        {/* Фильтры */}
        <div className="flex items-center gap-3 mb-6">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Все статусы</option>
            <option value="pending">Ожидают</option>
            <option value="confirmed">Подтверждён</option>
            <option value="packed">Упакован</option>
            <option value="shipped">Отправлен</option>
            <option value="delivered">Доставлен</option>
            <option value="cancelled">Отменён</option>
          </select>
          <select
            value={selectedConnection}
            onChange={(e) => setSelectedConnection(e.target.value)}
            className="bg-zinc-800 text-white rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Все маркетплейсы</option>
            {activeConnections.map(conn => (
              <option key={conn.id} value={conn.id}>
                {getMarketplaceName(conn.marketplace_type)}
              </option>
            ))}
          </select>
        </div>

        {/* Список заказов */}
        {filteredOrders.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
            <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">Заказы не найдены</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map((order, i) => {
              const conn = connections.find(c => c.id === order.connection_id);
              
              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-white font-mono text-sm">
                          {order.marketplace_order_id}
                        </h3>
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(order.status)}`}>
                          {getStatusLabel(order.status)}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-zinc-400">Покупатель:</span>
                          <span className="text-white ml-2">{order.customer.name}</span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Сумма:</span>
                          <span className="text-white ml-2 font-semibold">
                            {order.total_amount.toLocaleString()} ₽
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-400">Дата:</span>
                          <span className="text-white ml-2">
                            {new Date(order.ordered_at).toLocaleDateString()}
                          </span>
                        </div>
                        {conn && (
                          <div>
                            <span className="text-zinc-400">Площадка:</span>
                            <span className="text-white ml-2">
                              {getMarketplaceName(conn.marketplace_type)}
                            </span>
                          </div>
                        )}
                      </div>

                      {order.tracking_number && (
                        <div className="mt-2 flex items-center gap-2 text-sm">
                          <Truck className="w-4 h-4 text-blue-400" />
                          <span className="text-zinc-400">Трек:</span>
                          <span className="text-white font-mono">{order.tracking_number}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      {order.status !== 'delivered' && order.status !== 'cancelled' && (
                        <>
                          {order.status === 'pending' && (
                            <button
                              onClick={() => handleStatusChange(order.id, 'confirmed')}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs transition-colors"
                            >
                              Подтвердить
                            </button>
                          )}
                          {order.status === 'confirmed' && (
                            <button
                              onClick={() => handleStatusChange(order.id, 'packed')}
                              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs transition-colors"
                            >
                              Упаковать
                            </button>
                          )}
                          {order.status === 'packed' && (
                            <button
                              onClick={() => handleStatusChange(order.id, 'shipped')}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs transition-colors"
                            >
                              Отправить
                            </button>
                          )}
                          {order.status === 'shipped' && (
                            <button
                              onClick={() => handleStatusChange(order.id, 'delivered')}
                              className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs transition-colors"
                            >
                              Доставлен
                            </button>
                          )}
                          <button
                            onClick={() => handleStatusChange(order.id, 'cancelled')}
                            className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs transition-colors"
                          >
                            Отменить
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}