import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, X } from 'lucide-react';
import { ProductTag } from '@/hooks/useShop';
import { useNavigate } from 'react-router-dom';

interface ProductTagOverlayProps {
  tags: ProductTag[];
}

export function ProductTagOverlay({ tags }: ProductTagOverlayProps) {
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const navigate = useNavigate();

  const activeTag = tags.find(t => t.id === activeTagId);

  if (!tags.length) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {tags.map(tag => (
        <div
          key={tag.id}
          className="absolute pointer-events-auto"
          style={{ left: `${tag.x_position}%`, top: `${tag.y_position}%` }}
        >
          {/* Dot marker */}
          <button
            onClick={() => setActiveTagId(activeTagId === tag.id ? null : tag.id)}
            className="w-6 h-6 rounded-full bg-white/90 border-2 border-white shadow-lg flex items-center justify-center -translate-x-1/2 -translate-y-1/2 active:scale-90 transition-transform"
          >
            <ShoppingBag className="w-3 h-3 text-black" />
          </button>

          {/* Popup card */}
          <AnimatePresence>
            {activeTagId === tag.id && tag.product && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="absolute z-50 bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden w-48"
                style={{ transformOrigin: 'bottom center' }}
              >
                {/* Close */}
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveTagId(null); }}
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-zinc-800 flex items-center justify-center z-10"
                >
                  <X className="w-3 h-3 text-zinc-400" />
                </button>

                {/* Product image */}
                <div className="aspect-square bg-zinc-800 overflow-hidden">
                  {tag.product.image_url ? (
                    <img
                      src={tag.product.image_url}
                      alt={tag.product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="w-8 h-8 text-zinc-600" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-2.5">
                  <p className="text-xs text-white font-medium line-clamp-2 leading-tight">{tag.product.name}</p>
                  <p className="text-sm font-bold text-white mt-0.5">
                    {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(tag.product.price)}
                  </p>
                  <button
                    onClick={() => navigate(`/shop/${tag.product?.shop_id}`)}
                    className="mt-2 w-full text-xs text-center text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Перейти в магазин →
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
