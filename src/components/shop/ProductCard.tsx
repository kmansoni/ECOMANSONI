import { motion } from 'framer-motion';
import { ShoppingCart, ExternalLink } from 'lucide-react';
import { ShopProduct } from '@/hooks/useShop';

interface ProductCardProps {
  product: ShopProduct;
  onBuy?: (product: ShopProduct) => void;
  onDetails?: (product: ShopProduct) => void;
}

export function ProductCard({ product, onBuy, onDetails }: ProductCardProps) {
  const imageUrl = Array.isArray(product.images) ? String(product.images[0] ?? '') : null;
  const formattedPrice = new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: product.currency || 'RUB',
    maximumFractionDigits: 0,
  }).format(product.price);

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800"
    >
      {/* Image */}
      <div className="aspect-square bg-zinc-800 overflow-hidden relative">
        {imageUrl ? (
          <img loading="lazy"
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <ShoppingCart className="w-10 h-10" />
          </div>
        )}
        {/* Badge */}
        <div className={`absolute top-2 right-2 text-xs font-medium px-2 py-0.5 rounded-full ${
          product.in_stock
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-red-500/20 text-red-400 border border-red-500/30'
        }`}>
          {product.in_stock ? 'В наличии' : 'Нет в наличии'}
        </div>
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="text-sm text-white font-medium leading-tight line-clamp-2">{product.name}</p>
        <p className="text-base font-bold text-white">{formattedPrice}</p>

        <div className="flex gap-2">
          {product.in_stock ? (
            <button
              onClick={() => onBuy?.(product)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-white text-black text-xs font-semibold py-2 rounded-xl active:scale-95 transition-transform"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              В корзину
            </button>
          ) : (
            <button
              onClick={() => onDetails?.(product)}
              className="flex-1 flex items-center justify-center gap-1.5 bg-zinc-800 text-white text-xs font-semibold py-2 rounded-xl active:scale-95 transition-transform"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Подробнее
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
