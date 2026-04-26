import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Store, 
  ShoppingBag, 
  Truck, 
  MapPin, 
  Package, 
  Tag, 
  CreditCard,
  Plus,
  Search,
  Filter,
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock
} from 'lucide-react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { toast } from 'sonner';

export default function MarketplaceDashboard() {
  const navigate = useNavigate();
  const {
    connections,
    connectionsLoading,
    loadConnections,
    createConnection,
    marketplaceProducts,
    productsLoading,
    loadMarketplaceProducts,
    marketplaceOrders,
    ordersLoading,
    loadMarketplaceOrders,
    changeOrderStatus,
    stocks,
    loadStocks,
    deliveryTariffs,
    loadDeliveryTariffs,
    promotions,
    loadPromotions,
  } = useMarketplace();

  const [activeTab, setActiveTab] = useState<'connections' | 'products' | 'orders' | 'stocks' | 'pvz' | 'tariffs' | 'promotions'>('connections');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (activeTab === 'products') loadMarketplaceProducts();
    if (activeTab === 'orders') loadMarketplaceOrders();
    if (activeTab === 'stocks') loadStocks();
    if (activeTab === 'tariffs') loadDeliveryTariffs();
    if (activeTab === 'promotions') loadPromotions();
  }, [activeTab, loadMarketplaceProducts, loadMarketplaceOrders, loadStocks, loadDeliveryTariffs, loadPromotions]);

  const filteredOrders = marketplaceOrders.filter(order => {
    const matchesSearch = !searchTerm || 
      order.marketplace_order_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.customer.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
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

  const getMarketplaceIcon = (marketplace: string) => {
    switch (marketplace) {
      case 'ozon': return '🟢';
      case 'wildberries': return '🔵';
      case 'amazon': return '🟠';
      default: return '🛒';
    }
  };

  const handleSyncAll = async () => {
    toast.info('Запущена синхронизация...');
    try {
      await Promise.all([
        loadMarketplaceProducts(),
        loadMarketplaceOrders(),
        loadStocks(),
      ]);
      toast.success('Синхронизация завершена');
    } catch (e) {
      toast.error('Ошибка синхронизации');
    }
  };

  const renderConnectionsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Подключения к маркетплейсам</h2>
        <button
          onClick={() => navigate('/admin/marketplace/connect')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors"
        >
          <Plus className="w-4 h-4" />
          Новое подключение
        </button>
      </div>

      {connectionsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-2xl p-6 animate-pulse">
              <div className="w-12 h-12 bg-zinc-700 rounded-xl mb-4" />
              <div className="h-4 bg-zinc-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-zinc-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {connections.map((conn) => (
            <motion.div
              key={conn.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl">
                  {conn.marketplace_type === 'ozon' && '🟢'}
                  {conn.marketplace_type === 'wildberries' && '🔵'}
                  {conn.marketplace_type === 'amazon' && '🟠'}
                </div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  conn.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {conn.is_active ? 'Активно' : 'Неактивно'}
                </div>
              </div>
              <h3 className="text-white font-semibold mb-1">{conn.seller_name}</h3>
              <p className="text-zinc-400 text-sm mb-3">{conn.marketplace_type}</p>
              <div className="space-y-2 text-xs text-zinc-500">
                <p>Продавец: {conn.seller_id}</p>
                <p>Статус синхр.: {conn.sync_status}</p>
                {conn.last_sync_at && (
                  <p>Последняя синхр.: {new Date(conn.last_sync_at).toLocaleString()}</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {connections.length === 0 && (
        <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
          <Store className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 mb-4">Нет подключений к маркетплейсам</p>
          <button
            onClick={() => navigate('/admin/marketplace/connect')}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Подключить маркетплейс
          </button>
        </div>
      )}
    </div>
  );

  const renderProductsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Товары на маркетплейсах</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncAll}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Синхронизировать
          </button>
          <button
            onClick={() => navigate('/admin/marketplace/products/new')}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Добавить товар
          </button>
        </div>
      </div>

      {productsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-2xl p-4 animate-pulse">
              <div className="w-full h-32 bg-zinc-700 rounded-xl mb-3" />
              <div className="h-4 bg-zinc-700 rounded w-3/4 mb-2" />
              <div className="h-3 bg-zinc-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {marketplaceProducts.map((product) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors"
            >
              <div className="h-32 bg-zinc-800 flex items-center justify-center">
                {product.images[0] ? (
                  <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
                ) : (
                  <ShoppingBag className="w-8 h-8 text-zinc-600" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-400 text-sm">{product.marketplace_sku}</span>
                  <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(product.status)}`}>
                    {product.status}
                  </span>
                </div>
                <h3 className="text-white font-semibold mb-2 line-clamp-2">{product.title}</h3>
                <div className="flex items-center justify-between">
                  <span className="text-white font-bold">{product.price.toLocaleString()} ₽</span>
                  {product.old_price && (
                    <span className="text-zinc-500 line-through text-sm">{product.old_price.toLocaleString()} ₽</span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {marketplaceProducts.length === 0 && !productsLoading && (
        <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
          <ShoppingBag className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 mb-4">Нет товаров на маркетплейсах</p>
          <button
            onClick={() => navigate('/admin/marketplace/products/new')}
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            Добавить первый товар
          </button>
        </div>
      )}
    </div>
  );

  const renderOrdersTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Заказы с маркетплейсов</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Поиск заказов..."
              className="bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-800 text-white rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Все статусы</option>
            <option value="pending">Ожидают</option>
            <option value="confirmed">Подтверждены</option>
            <option value="packed">Упакованы</option>
            <option value="shipped">Отправлены</option>
            <option value="delivered">Доставлены</option>
            <option value="cancelled">Отменены</option>
            <option value="returned">Возвраты</option>
          </select>
        </div>
      </div>

      {ordersLoading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-zinc-900 rounded-2xl p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-zinc-700 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-zinc-700 rounded w-1/4" />
                  <div className="h-3 bg-zinc-700 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <span className="text-2xl">{getMarketplaceIcon(order.marketplace)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-mono text-sm">{order.marketplace_order_id}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                    <p className="text-zinc-400 text-sm mb-1">{order.customer.name}</p>
                    <p className="text-zinc-500 text-xs">{order.delivery_address.city}, {order.delivery_address.street}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                      <span>{new Date(order.ordered_at).toLocaleDateString()}</span>
                      {order.tracking_number && (
                        <span>Трек: {order.tracking_number}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white font-bold text-lg">{order.total_amount.toLocaleString()} ₽</p>
                  <p className="text-zinc-400 text-sm">{order.currency}</p>
                </div>
              </div>
              
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {order.order_items.slice(0, 3).map((item, i) => (
                    <span key={i} className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400">
                      {item.quantity} × {item.name}
                    </span>
                  ))}
                  {order.order_items.length > 3 && (
                    <span className="text-xs text-zinc-500">и еще {order.order_items.length - 3}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {order.status === 'pending' && (
                    <button
                      onClick={() => changeOrderStatus(order.id, 'confirmed')}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition-colors"
                    >
                      Подтвердить
                    </button>
                  )}
                  {order.status === 'confirmed' && (
                    <button
                      onClick={() => changeOrderStatus(order.id, 'packed')}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-lg transition-colors"
                    >
                      Упаковать
                    </button>
                  )}
                  {order.status === 'packed' && (
                    <button
                      onClick={() => changeOrderStatus(order.id, 'shipped')}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded-lg transition-colors"
                    >
                      Отправить
                    </button>
                  )}
                  {order.status === 'shipped' && (
                    <button
                      onClick={() => changeOrderStatus(order.id, 'delivered')}
                      className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg transition-colors"
                    >
                      Доставлен
                    </button>
                  )}
                  {(order.status === 'pending' || order.status === 'confirmed') && (
                    <button
                      onClick={() => changeOrderStatus(order.id, 'cancelled')}
                      className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded-lg transition-colors"
                    >
                      Отменить
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {marketplaceOrders.length === 0 && !ordersLoading && (
        <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
          <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400 mb-4">Нет заказов с маркетплейсов</p>
        </div>
      )}
    </div>
  );

  const renderStocksTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Остатки на складах</h2>
        <button
          onClick={handleSyncAll}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Синхронизировать
        </button>
      </div>

      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
        <table className="w-full">
          <thead className="bg-zinc-800/50">
            <tr>
              <th className="text-left px-4 py-3 text-sm text-zinc-400 font-medium">SKU / Артикул</th>
              <th className="text-left px-4 py-3 text-sm text-zinc-400 font-medium">Наименование</th>
              <th className="text-left px-4 py-3 text-sm text-zinc-400 font-medium">Склад</th>
              <th className="text-right px-4 py-3 text-sm text-zinc-400 font-medium">Всего</th>
              <th className="text-right px-4 py-3 text-sm text-zinc-400 font-medium">Зарезервировано</th>
              <th className="text-right px-4 py-3 text-sm text-zinc-400 font-medium">Доступно</th>
              <th className="text-right px-4 py-3 text-sm text-zinc-400 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {stocksLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="border-t border-zinc-800/50 animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 bg-zinc-700 rounded w-20" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-zinc-700 rounded w-32" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-zinc-700 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-zinc-700 rounded w-12 ml-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-zinc-700 rounded w-12 ml-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-zinc-700 rounded w-12 ml-auto" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-zinc-700 rounded w-16 ml-auto" /></td>
                </tr>
              ))
            ) : stocks.length > 0 ? (
              stocks.map((stock) => (
                <tr key={stock.id} className="border-t border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 text-sm text-white font-mono">{stock.sku}</td>
                  <td className="px-4 py-3 text-sm text-zinc-300">{stock.marketplace_product_id || '-'}</td>
                  <td className="px-4 py-3 text-sm text-zinc-400">{stock.warehouse_name || stock.warehouse_id || '-'}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{stock.quantity}</td>
                  <td className="px-4 py-3 text-sm text-right text-zinc-500">{stock.reserved}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-green-400">{stock.available}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      stock.sync_status === 'success' ? 'bg-green-500/20 text-green-400' :
                      stock.sync_status === 'error' ? 'bg-red-500/20 text-red-400' :
                      'bg-zinc-500/20 text-zinc-400'
                    }`}>
                      {stock.sync_status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-zinc-500">
                  Нет данных об остатках
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderTariffsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Тарифы доставки</h2>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />
          Добавить тариф
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {deliveryTariffs.map((tariff) => (
          <motion.div
            key={tariff.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-semibold">{tariff.name}</h3>
              <span className={`px-2 py-1 rounded-full text-xs ${
                tariff.is_active ? 'bg-green-500/20 text-green-400' : 'bg-zinc-500/20 text-zinc-400'
              }`}>
                {tariff.is_active ? 'Активен' : 'Неактивен'}
              </span>
            </div>
            <div className="space-y-2 text-sm text-zinc-400">
              <p className="flex items-center gap-2">
                <Truck className="w-4 h-4" />
                {tariff.type === 'courier' ? 'Курьер' : tariff.type === 'pickup' ? 'ПВЗ' : 'Почта'}
              </p>
              <p>Вес: {tariff.min_weight_kg} - {tariff.max_weight_kg} кг</p>
              <p className="flex items-center gap-1">
                <span className="text-zinc-500">База:</span>
                <span className="text-white font-semibold">{tariff.base_cost.toLocaleString()} ₽</span>
              </p>
              {(tariff.cost_per_kg > 0 || tariff.cost_per_km > 0) && (
                <p className="text-xs text-zinc-500">
                  +{tariff.cost_per_kg.toLocaleString()} ₽/кг, +{tariff.cost_per_km.toLocaleString()} ₽/км
                </p>
              )}
              {tariff.free_delivery_threshold > 0 && (
                <p className="text-green-400 text-sm">
                  Бесплатно от {tariff.free_delivery_threshold.toLocaleString()} ₽
                </p>
              )}
              {tariff.cities.length > 0 && (
                <p className="text-xs text-zinc-500">Города: {tariff.cities.join(', ')}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const renderPromotionsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Акции и скидки</h2>
        <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors">
          <Plus className="w-4 h-4" />
          Новая акция
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {promotions.map((promo) => (
          <motion.div
            key={promo.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <Tag className="w-5 h-5 text-blue-400" />
              <span className={`px-2 py-1 rounded-full text-xs ${
                promo.is_active ? 'bg-green-500/20 text-green-400' : 'bg-zinc-500/20 text-zinc-400'
              }`}>
                {promo.is_active ? 'Активна' : 'Неактивна'}
              </span>
            </div>
            <h3 className="text-white font-bold text-lg mb-1">{promo.code}</h3>
            <p className="text-white mb-2">{promo.name}</p>
            <div className="space-y-2 text-sm text-zinc-400">
              <p className="flex items-center gap-2">
                <span className="text-yellow-400 font-bold">
                  {promo.discount_value.toLocaleString()} {promo.type === 'percentage' ? '%' : '₽'}
                </span>
                {promo.type === 'percentage' ? 'скидка' : 'фиксированная скидка'}
              </p>
              {promo.min_order_amount > 0 && (
                <p>От {promo.min_order_amount.toLocaleString()} ₽</p>
              )}
              {promo.max_discount && (
                <p>Макс. скидка: {promo.max_discount.toLocaleString()} ₽</p>
              )}
              <p>Использовано: {promo.used_count} / {promo.max_uses || '∞'}</p>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Clock className="w-3 h-3" />
                <span>С {new Date(promo.valid_from).toLocaleDateString()}</span>
                {promo.valid_until && (
                  <> - {new Date(promo.valid_until).toLocaleDateString()}</>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );

  const tabs = [
    { id: 'connections', label: 'Подключения', icon: Store, count: connections.length },
    { id: 'products', label: 'Товары', icon: ShoppingBag, count: marketplaceProducts.length },
    { id: 'orders', label: 'Заказы', icon: Package, count: marketplaceOrders.length },
    { id: 'stocks', label: 'Остатки', icon: Warehouse, count: stocks.length },
    { id: 'pvz', label: 'ПВЗ', icon: MapPin, count: 0 },
    { id: 'tariffs', label: 'Тарифы', icon: Truck, count: deliveryTariffs.length },
    { id: 'promotions', label: 'Акции', icon: Tag, count: promotions.length },
  ];

  const selectedTab = tabs.find(t => t.id === activeTab);
  const Icon = selectedTab?.icon || Store;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Store className="w-6 h-6 text-blue-400" />
              <h1 className="text-xl font-bold text-white">Маркетплейс Панель</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSyncAll}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl text-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Синхронизировать всё
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2 scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full text-xs">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {activeTab === 'connections' && renderConnectionsTab()}
        {activeTab === 'products' && renderProductsTab()}
        {activeTab === 'orders' && renderOrdersTab()}
        {activeTab === 'stocks' && renderStocksTab()}
        {activeTab === 'pvz' && (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
            <MapPin className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-4">Модуль ПВЗ в разработке</p>
          </div>
        )}
        {activeTab === 'tariffs' && renderTariffsTab()}
        {activeTab === 'promotions' && renderPromotionsTab()}
      </div>
    </div>
  );
}
