import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Store, ShoppingBag, Truck, MapPin, Tag, CreditCard, Search, Filter, ArrowLeft } from 'lucide-react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { toast } from 'sonner';

export default function MarketplacePage() {
  const navigate = useNavigate();
  const {
    connections,
    products: marketplaceProducts,
    orders: marketplaceOrders,
    stocks,
    pvzPoints,
    deliveryTariffs,
    promotions,
    loadConnections,
    loadMarketplaceProducts,
    loadPVZPoints,
    loadDeliveryTariffs,
    loadPromotions,
    findNearestPVZ,
    calculateDelivery,
  } = useMarketplace();

  const [activeSection, setActiveSection] = useState<'shop' | 'marketplaces' | 'cart' | 'orders' | 'pvz'>('shop');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('all');

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (activeSection === 'marketplaces') {
      loadMarketplaceProducts();
      loadDeliveryTariffs();
      loadPromotions();
    }
    if (activeSection === 'pvz') {
      loadPVZPoints();
    }
  }, [activeSection, loadMarketplaceProducts, loadDeliveryTariffs, loadPromotions, loadPVZPoints]);

  const activeConnections = connections.filter(c => c.is_active);
  const hasActiveConnections = activeConnections.length > 0;

  const filteredProducts = marketplaceProducts.filter(product => {
    const matchesSearch = !searchTerm || product.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMarketplace = selectedMarketplace === 'all' || 
      product.connection_id === selectedMarketplace;
    return matchesSearch && matchesMarketplace && product.status === 'active';
  });

  const renderShopSection = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/shop')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад в свой магазин
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800"
        >
          <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
            <Store className="w-6 h-6 text-blue-400" />
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">Мой магазин</h3>
          <p className="text-zinc-400 text-sm">Продажа в соцсетях</p>
          <button
            onClick={() => navigate('/shop')}
            className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-xl transition-colors text-sm"
          >
            Перейти в магазин
          </button>
        </motion.div>

        {hasActiveConnections ? (
          activeConnections.map((conn, index) => (
            <motion.div
              key={conn.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
              className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800"
            >
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mb-4">
                <span className="text-2xl">
                  {conn.marketplace_type === 'ozon' && '🟢'}
                  {conn.marketplace_type === 'wildberries' && '🔵'}
                  {conn.marketplace_type === 'amazon' && '🟠'}
                </span>
              </div>
              <h3 className="text-white font-semibold text-lg mb-2">
                {conn.marketplace_type === 'ozon' && 'Ozon'}
                {conn.marketplace_type === 'wildberries' && 'Wildberries'}
                {conn.marketplace_type === 'amazon' && 'Amazon'}
              </h3>
              <p className="text-zinc-400 text-sm mb-4">Продажа на маркетплейсе</p>
              <button
                onClick={() => {
                  setActiveSection('marketplaces');
                  setSelectedMarketplace(conn.id);
                }}
                className="mt-4 w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded-xl transition-colors text-sm"
              >
                Перейти в магазин
              </button>
            </motion.div>
          ))
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 text-center"
          >
            <Store className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <h3 className="text-white font-semibold text-lg mb-2">Подключите маркетплейс</h3>
            <p className="text-zinc-400 text-sm mb-4">
              Расширяйте свои продажи через Ozon, Wildberries и Amazon
            </p>
            <button
              onClick={() => navigate('/admin/marketplace/connect')}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl transition-colors text-sm"
            >
              Подключить маркетплейс
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );

  const renderMarketplacesSection = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveSection('shop')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </button>
          <h2 className="text-xl font-bold text-white">Маркетплейсы</h2>
        </div>
        <select
          value={selectedMarketplace}
          onChange={(e) => setSelectedMarketplace(e.target.value)}
          className="bg-zinc-800 text-white rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Все маркетплейсы</option>
          {connections.map(conn => (
            <option key={conn.id} value={conn.id}>
              {conn.marketplace_type === 'ozon' && 'Ozon'}
              {conn.marketplace_type === 'wildberries' && 'Wildberries'}
              {conn.marketplace_type === 'amazon' && 'Amazon'}
            </option>
          ))}
        </select>
      </div>

      {/* Поиск и фильтры */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Поиск товаров..."
            className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-3 rounded-xl transition-colors">
          <Filter className="w-4 h-4" />
          Фильтры
        </button>
      </div>

      {/* Акции */}
      {promotions.length > 0 && (
        <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl p-4">
          <h3 className="text-white font-semibold mb-2">Акции</h3>
          <div className="flex flex-wrap gap-2">
            {promotions.map(promo => (
              <span key={promo.id} className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
                {promo.code}: -{promo.discount_value}{promo.type === 'percentage' ? '%' : '₽'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Товары */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredProducts.map((product, i) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800 hover:border-zinc-600 transition-colors"
          >
            <div className="h-32 bg-zinc-800 flex items-center justify-center">
              {product.images[0] ? (
                <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
              ) : (
                <ShoppingBag className="w-8 h-8 text-zinc-600" />
              )}
            </div>
            <div className="p-3">
              <p className="text-zinc-400 text-xs mb-1">{product.marketplace_sku}</p>
              <h3 className="text-white text-sm font-medium mb-2 line-clamp-2">{product.title}</h3>
              <div className="flex items-center justify-between">
                <span className="text-white font-bold">{product.price.toLocaleString()} ₽</span>
                {product.old_price && (
                  <span className="text-zinc-500 line-through text-xs">{product.old_price.toLocaleString()}</span>
                )}
              </div>
              <button className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-xl text-sm transition-colors">
                В корзину
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
          <ShoppingBag className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400">Товары не найдены</p>
        </div>
      )}
    </div>
  );

  const renderOrdersSection = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setActiveSection('shop')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </button>
        <h2 className="text-xl font-bold text-white">Мои заказы</h2>
      </div>

      <div className="space-y-4">
        {marketplaceOrders.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
            <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">Нет заказов</p>
          </div>
        ) : (
          marketplaceOrders.map(order => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-white font-mono text-sm">{order.marketplace_order_id}</p>
                  <p className="text-zinc-400 text-sm">{order.customer.name}</p>
                  <p className="text-zinc-500 text-xs">
                    {order.items_total.toLocaleString()} ₽ · {new Date(order.ordered_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs whitespace-nowrap ${
                  order.status === 'delivered' ? 'bg-green-500/20 text-green-400' :
                  order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                  order.status === 'shipped' ? 'bg-blue-500/20 text-blue-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {order.status}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );

  const renderPVZSection = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setActiveSection('shop')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад
        </button>
        <h2 className="text-xl font-bold text-white">ПВЗ — пункты выдачи</h2>
      </div>

      {pvzPoints.length === 0 ? (
        <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
          <MapPin className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <p className="text-zinc-400">ПВЗ не найдены</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pvzPoints.slice(0, 10).map(pvz => (
            <motion.div
              key={pvz.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800"
            >
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-white font-medium">{pvz.name}</h3>
                  <p className="text-zinc-400 text-sm">{pvz.address}</p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                    <span>{pvz.city}</span>
                    <span>•</span>
                    {pvz.working_hours && <span>{pvz.working_hours}</span>}
                  </div>
                  {pvz.cost_delivery > 0 && (
                    <p className="text-green-400 text-sm mt-2">Доставка: {pvz.cost_delivery} ₽</p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-4 py-6 max-w-7xl mx-auto">
        {activeSection === 'shop' && renderShopSection()}
        {activeSection === 'marketplaces' && renderMarketplacesSection()}
        {activeSection === 'orders' && renderOrdersSection()}
        {activeSection === 'pvz' && renderPVZSection()}
      </div>
    </div>
  );
}
