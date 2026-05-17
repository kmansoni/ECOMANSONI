/**
 * MarketplaceProductDetailPage — детальная страница товара для покупателя.
 *
 * Показывает полную информацию о товаре с маркетплейса:
 *  - изображения, цена, старая цена
 *  - описание и характеристики
 *  - блок "В корзину"
 *  - отзывы покупателей
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ShoppingCart, Package, MapPin, ExternalLink,
  ChevronLeft, ChevronRight, CheckCircle2, Truck, RotateCcw
} from 'lucide-react';
import { getMarketplaceProductById } from '@/lib/marketplace/marketplaceApi';
import type { MarketplaceProduct } from '@/lib/marketplace/marketplaceApi';
import { useMarketplace } from '@/hooks/useMarketplace';
import { useCart } from '@/hooks/useCart';
import { ProductReviews } from '@/components/shop/ProductReviews';
import { toast } from 'sonner';

export default function MarketplaceProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { connections, loadConnections } = useMarketplace();
  const { addToCart, items: cartItems } = useCart();

  const [product, setProduct] = useState<MarketplaceProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const connection = connections.find(c => c.id === product?.connection_id);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setActiveImage(0);
    void (async () => {
      const data = await getMarketplaceProductById(id);
      setProduct(data);
      setLoading(false);
      if (data) await loadConnections();
    })();
  }, [id, loadConnections]);

  const isInCart = product?.shop_product_id
    ? cartItems.some(i => i.product.id === product.shop_product_id)
    : false;

  const handleAddToCart = useCallback(() => {
    if (!product?.shop_product_id) {
      toast.error('Товар ещё не привязан к внутреннему каталогу');
      return;
    }
    addToCart(product.shop_product_id, quantity);
    toast.success(`Добавлено в корзину ×${quantity}`);
  }, [product, quantity, addToCart]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-zinc-500 text-sm">Загрузка товара…</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 px-6 text-center">
        <Package className="w-14 h-14 text-zinc-600" />
        <p className="text-white font-semibold">Товар не найден</p>
        <p className="text-zinc-500 text-sm">Он был удалён или не существует.</p>
        <button onClick={() => navigate('/marketplace')} className="mt-2 px-6 py-2 rounded-xl bg-zinc-800 text-white text-sm">
          Назад в маркетплейс
        </button>
      </div>
    );
  }

  const images = product.images?.length ? product.images : [];
  const nextImage = () => setActiveImage(i => (i + 1) % images.length);
  const prevImage = () => setActiveImage(i => (i - 1 + images.length) % images.length);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Хедер */}
      <div className="sticky top-0 z-10 bg-black/90 backdrop-blur border-b border-zinc-800 flex items-center gap-3 px-4 py-3">
        <button onClick={() => navigate(-1)} className="text-zinc-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-zinc-400 text-sm truncate flex-1">{product.title}</span>
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto space-y-6">
        {/* Галерея изображений */}
        {images.length > 0 && (
          <div className="space-y-3">
            <div className="relative aspect-square bg-zinc-800 rounded-2xl overflow-hidden">
              <img
                src={images[activeImage]}
                alt={`${product.title} — фото ${activeImage + 1}`}
                className="w-full h-full object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, i) => (
                      <span
                        key={i}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          i === activeImage ? 'bg-white' : 'bg-white/40'
                        }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Миниатюры */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-colors ${
                      i === activeImage ? 'border-white' : 'border-transparent'
                    }`}
                  >
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Название и цена */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold leading-tight">{product.title}</h1>
            {product.status === 'active' && (
              <span className="shrink-0 flex items-center gap-1 text-green-400 text-xs">
                <CheckCircle2 className="w-4 h-4" /> Активен
              </span>
            )}
          </div>

          {connection && (
            <p className="text-zinc-400 text-sm">
              {connection.marketplace_type === 'ozon' && '🟢 Ozon'}
              {connection.marketplace_type === 'wildberries' && '🔵 Wildberries'}
              {connection.marketplace_type === 'amazon' && '🟠 Amazon'}
              {' · '}SKU: {product.marketplace_sku}
            </p>
          )}

          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold">{product.price.toLocaleString()} ₽</span>
            {product.old_price && product.old_price > product.price && (
              <span className="text-zinc-500 line-through text-lg">
                {product.old_price.toLocaleString()} ₽
              </span>
            )}
          </div>

          {product.old_price && product.old_price > product.price && (
            <p className="text-green-400 text-sm">
              Скидка {Math.round((1 - product.price / product.old_price) * 100)}%
            </p>
          )}
        </div>

        {/* Описание и характеристики */}
        {(product.description || product.attributes) && (
          <div className="space-y-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
            {product.description && (
              <div>
                <h2 className="font-semibold text-white mb-2">Описание</h2>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {product.description}
                </p>
              </div>
            )}
            {product.attributes && Object.keys(product.attributes).length > 0 && (
              <div>
                <h2 className="font-semibold text-white mb-2">Характеристики</h2>
                <div className="space-y-1.5">
                  {Object.entries(product.attributes).map(([key, value]) => (
                    <div key={key} className="flex items-start gap-2 text-sm">
                      <span className="text-zinc-500 shrink-0 min-w-[130px]">{key}:</span>
                      <span className="text-zinc-300">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Доставка / ПВЗ */}
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 space-y-3">
          <h2 className="font-semibold text-white text-sm">Доставка</h2>
          <div className="space-y-2">
            <div className="flex items-start gap-2 text-sm">
              <Truck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <span className="text-zinc-400">Курьером до двери — от 350 ₽</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <span className="text-zinc-400">Самовывоз из ПВЗ — бесплатно</span>
            </div>
            <div className="flex items-start gap-2 text-sm">
              <RotateCcw className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <span className="text-zinc-400">Возврат в течение 14 дней</span>
            </div>
          </div>
        </div>

        {/* Отзывы */}
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4">
          <ProductReviews productId={product.id} />
        </div>
      </div>

      {/* Футер: добавление в корзину */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/90 backdrop-blur border-t border-zinc-800">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* Селектор количества */}
          <div className="flex items-center gap-2 bg-zinc-800 rounded-xl">
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              className="w-10 h-10 flex items-center justify-center text-white rounded-l-xl hover:bg-zinc-700 active:scale-95 transition-all"
            >
              −
            </button>
            <span className="text-white font-semibold w-8 text-center tabular-nums">{quantity}</span>
            <button
              onClick={() => setQuantity(q => Math.min(99, q + 1))}
              className="w-10 h-10 flex items-center justify-center text-white rounded-r-xl hover:bg-zinc-700 active:scale-95 transition-all"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAddToCart}
            disabled={!product.shop_product_id}
            className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-bold py-4 rounded-2xl text-base active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShoppingCart className="w-5 h-5" />
            {isInCart ? 'Уже в корзине' : 'В корзину'} · {product.price.toLocaleString()} ₽
          </button>

          {connection && (
            <button
              onClick={() => window.open(`https://www.ozon.ru/search/?text=${encodeURIComponent(product.title)}`, '_blank')}
              className="shrink-0 px-4 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-2xl transition-colors"
              title={`Купить на ${connection.marketplace_type}`}
            >
              <ExternalLink className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Отступ под футер */}
      <div className="h-28" />
    </div>
  );
}
