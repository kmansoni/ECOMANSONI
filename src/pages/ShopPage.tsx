import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Store, Plus, ShoppingBag, Loader2, Heart, Search } from 'lucide-react';
import { useShop } from '@/hooks/useShop';
import { ProductCard } from '@/components/shop/ProductCard';
import { CreateShopSheet } from '@/components/shop/CreateShopSheet';
import { useWishlist } from '@/hooks/useWishlist';
import { toast } from 'sonner';

export default function ShopPage() {
  const { shopId } = useParams<{ shopId?: string }>();
  const navigate = useNavigate();
  const { shop, products, loading, getMyShop } = useShop(shopId);
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, unknown>[]>([]);

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))] as string[];
    return cats;
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!activeCategory) return products;
    return products.filter(p => p.category === activeCategory);
  }, [products, activeCategory]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-20 h-20 rounded-2xl bg-zinc-900 flex items-center justify-center">
          <Store className="w-10 h-10 text-zinc-600" />
        </div>
        <h2 className="text-xl font-bold text-white">У вас нет магазина</h2>
        <p className="text-zinc-500 text-sm text-center">Создайте магазин, чтобы продавать свои товары прямо в соцсети</p>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-white text-black font-semibold px-6 py-3 rounded-2xl active:scale-95 transition-transform"
        >
          <Plus className="w-4 h-4" />
          Создать магазин
        </button>

        <CreateShopSheet
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => { getMyShop(); }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20">
      {/* Shop header */}
      <div className="relative bg-zinc-950">
        {/* Cover gradient */}
        <div className="h-32 bg-gradient-to-br from-zinc-800 to-zinc-900" />

        {/* Logo & info */}
        <div className="px-4 pb-4">
          <div className="-mt-10 mb-3">
            <div className="w-20 h-20 rounded-2xl bg-zinc-800 border-4 border-black overflow-hidden">
              {shop.logo_url ? (
                <img loading="lazy" src={shop.logo_url} alt={shop.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Store className="w-8 h-8 text-zinc-600" />
                </div>
              )}
            </div>
          </div>

          <h1 className="text-xl font-bold text-white">{shop.name}</h1>
          {shop.description && (
            <p className="text-sm text-zinc-400 mt-1">{shop.description}</p>
          )}

          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1 text-zinc-500 text-xs">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{products.length} товаров</span>
            </div>
          </div>
        </div>
      </div>

      {/* Category filters */}
      {categories.length > 0 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveCategory(null)}
            className={`flex-shrink-0 text-sm px-4 py-1.5 rounded-full font-medium transition-colors ${
              activeCategory === null
                ? 'bg-white text-black'
                : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
            }`}
          >
            Все
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-shrink-0 text-sm px-4 py-1.5 rounded-full font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-white text-black'
                  : 'bg-zinc-900 text-zinc-400 border border-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Products grid */}
      <div className="px-4 pt-2">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16">
            <ShoppingBag className="w-12 h-12 text-zinc-700" />
            <p className="text-zinc-500 text-sm">Нет товаров</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 gap-3"
          >
            {filteredProducts.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="relative"
              >
                <ProductCard
                  product={product}
                  onBuy={(p) => {
                    const item = { productId: p.id, price: p.price, quantity: 1, name: p.name };
                    const newCart = [...cart, item];
                    setCart(newCart);
                    toast.success(`${p.name} добавлен в корзину`, {
                      action: { label: 'Оформить', onClick: () => navigate('/checkout', { state: { items: newCart, shopId: shop?.id } }) },
                    });
                  }}
                  onDetails={(p) => toast.info(`Подробнее: ${p.name}`)}
                />
                <button
                  onClick={() => toggleWishlist(product.id)}
                  className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center"
                >
                  <Heart className={`w-4 h-4 ${isInWishlist(product.id) ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
