import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Package, Plus, Edit, Trash2, Search, Filter, 
  DollarSign, Tag, BarChart3, RefreshCw, AlertCircle, CheckCircle
} from 'lucide-react';
import { useMarketplace } from '@/hooks/useMarketplace';
import type { CreateMarketplaceProductInput } from '@/lib/marketplace/marketplaceApi';
import { toast } from 'sonner';
import { ProductFormDialog } from '@/components/shop/ProductFormDialog';

export default function MarketplaceProductsPage() {
  const navigate = useNavigate();
  const { 
    marketplaceProducts, 
    connections, 
    stocks,
    loadMarketplaceProducts,
    addProductToMarketplace,
    updateMarketplaceProduct,
  } = useMarketplace();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedConnection, setSelectedConnection] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<{ id: string } & Partial<CreateMarketplaceProductInput> | null>(null);

  const activeConnections = connections.filter(c => c.is_active);
  
  const filteredProducts = marketplaceProducts.filter(product => {
    const matchesSearch = !searchTerm || 
      product.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.marketplace_sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesMarketplace = selectedConnection === 'all' || 
      product.connection_id === selectedConnection;
    return matchesSearch && matchesMarketplace;
  });

  const getStockForProduct = (sku: string) => {
    return stocks.find(s => s.sku === sku)?.available || 0;
  };

  const getMarketplaceName = (type: string) => {
    const names: Record<string, string> = {
      ozon: 'Ozon',
      wildberries: 'Wildberries',
      amazon: 'Amazon',
      yandex: 'Яндекс Маркет',
    };
    return names[type] || type;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500/20 text-green-400',
      draft: 'bg-yellow-500/20 text-yellow-400',
      inactive: 'bg-zinc-500/20 text-zinc-400',
      blocked: 'bg-red-500/20 text-red-400',
      deleted: 'bg-red-500/20 text-red-400',
    };
    return colors[status] || 'bg-zinc-500/20 text-zinc-400';
  };

  const handleSync = async () => {
    await loadMarketplaceProducts(selectedConnection === 'all' ? undefined : selectedConnection);
    toast.success('Синхронизация завершена');
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
            <h1 className="text-2xl font-bold">Товары на маркетплейсах</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Синхронизировать
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Добавить товар
            </button>
          </div>
        </div>

        {/* Фильтры */}
        <div className="flex items-center gap-3 mb-6">
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

        {/* Статистика */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-blue-400" />
              <div>
                <p className="text-zinc-400 text-sm">Всего товаров</p>
                <p className="text-2xl font-bold">{marketplaceProducts.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-green-400" />
              <div>
                <p className="text-zinc-400 text-sm">Активных</p>
                <p className="text-2xl font-bold">
                  {marketplaceProducts.filter(p => p.status === 'active').length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-yellow-400" />
              <div>
                <p className="text-zinc-400 text-sm">Общий оборот</p>
                <p className="text-2xl font-bold">
                  {marketplaceProducts.reduce((sum, p) => sum + p.price, 0).toLocaleString()} ₽
                </p>
              </div>
            </div>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-purple-400" />
              <div>
                <p className="text-zinc-400 text-sm">В наличии</p>
                <p className="text-2xl font-bold">{stocks.reduce((sum, s) => sum + s.available, 0)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Список товаров */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 rounded-2xl">
            <Package className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 mb-4">Товары не найдены</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl transition-colors"
            >
              Добавить первый товар
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredProducts.map((product, i) => {
              const stock = getStockForProduct(product.marketplace_sku);
              const conn = connections.find(c => c.id === product.connection_id);
              
              return (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 hover:border-zinc-600 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-20 h-20 bg-zinc-800 rounded-xl flex-shrink-0 overflow-hidden">
                      {product.images[0] ? (
                        <img src={product.images[0]} alt={product.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-8 h-8 text-zinc-600" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="text-white font-medium">{product.title}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs ${getStatusColor(product.status)}`}>
                          {product.status === 'active' && 'Активен'}
                          {product.status === 'draft' && 'Черновик'}
                          {product.status === 'inactive' && 'Неактивен'}
                          {product.status === 'blocked' && 'Заблокирован'}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-zinc-400 mb-2">
                        <span>SKU: {product.marketplace_sku}</span>
                        {conn && <span>{getMarketplaceName(conn.marketplace_type)}</span>}
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-zinc-400">Цена:</span>
                          <span className="text-white font-semibold ml-2">
                            {product.price.toLocaleString()} ₽
                          </span>
                          {product.old_price && (
                            <span className="text-zinc-500 line-through ml-2 text-xs">
                              {product.old_price.toLocaleString()} ₽
                            </span>
                          )}
                        </div>
                        <div>
                          <span className="text-zinc-400">В наличии:</span>
                          <span className={`ml-2 font-semibold ${
                            stock < 10 ? 'text-red-400' : stock < 50 ? 'text-yellow-400' : 'text-green-400'
                          }`}>
                            {stock} шт.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingProduct(product)}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Удалить товар? Он будет помечен как удалённый.')) {
                            updateMarketplaceProduct(product.id, { status: 'deleted' })
                              .then(() => toast.success('Товар удалён'))
                              .catch(() => toast.error('Ошибка удаления товара'));
                          }
                        }}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Диалог создания/редактирования товара */}
      <ProductFormDialog
        open={showAddModal || !!editingProduct}
        onOpenChange={(open) => {
          if (!open) { setShowAddModal(false); setEditingProduct(null); }
        }}
        editingProduct={editingProduct}
        onSaved={() => {
          loadMarketplaceProducts(selectedConnection === 'all' ? undefined : selectedConnection);
          setShowAddModal(false);
          setEditingProduct(null);
        }}
      />
    </div>
  );
}