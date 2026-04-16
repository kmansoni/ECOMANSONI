/**
 * ProductCompareSheet — таблица сравнения товаров (до 4 товаров в колонках).
 *
 * Горизонтальная таблица: товары в колонках, атрибуты в строках.
 * Лучшие значения подсвечиваются.
 */

import { X, Scale, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProductCompare } from '@/hooks/useProductCompare';
import { type ShopProduct } from '@/hooks/useShop';

interface ProductCompareSheetProps {
  open: boolean;
  onClose: () => void;
}

export function ProductCompareSheet({ open, onClose }: ProductCompareSheetProps) {
  const { compareList, removeFromCompare, clearCompare } = useProductCompare();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 flex items-end"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full bg-zinc-900 rounded-t-2xl max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-title"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-400" />
                <h2 id="compare-title" className="text-white font-bold text-lg">
                  Сравнение ({compareList.length})
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {compareList.length > 0 && (
                  <button
                    onClick={clearCompare}
                    className="text-zinc-400 hover:text-red-400 text-xs transition-colors px-2 py-1 min-h-[44px] flex items-center"
                    aria-label="Очистить сравнение"
                  >
                    Очистить
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-zinc-800 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {compareList.length === 0 ? (
                <div className="text-center py-12">
                  <Scale className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-400 text-sm">Добавьте товары для сравнения</p>
                  <p className="text-zinc-600 text-xs mt-1">Максимум 4 товара</p>
                </div>
              ) : (
                <CompareTable products={compareList} onRemove={removeFromCompare} />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// CompareTable
// ---------------------------------------------------------------------------

function CompareTable({ products, onRemove }: { products: ShopProduct[]; onRemove: (id: string) => void }) {
  const prices = products.map(p => p.price);
  const minPrice = Math.min(...prices);

  const rows: { label: string; getValue: (p: ShopProduct) => string; highlight: 'min' | 'max' | 'none' }[] = [
    {
      label: 'Цена',
      getValue: p => formatPrice(p.price, p.currency ?? undefined),
      highlight: 'min',
    },
    {
      label: 'Наличие',
      getValue: p => p.in_stock ? '✓ В наличии' : '✗ Нет',
      highlight: 'none',
    },
    {
      label: 'Категория',
      getValue: p => p.category ?? '—',
      highlight: 'none',
    },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px]">
        <thead>
          <tr>
            <th className="text-left text-zinc-500 text-xs font-normal pb-3 pr-3 w-24" />
            {products.map(product => (
              <th key={product.id} className="text-center pb-3 px-2 min-w-[120px]">
                <div className="relative">
                  <button
                    onClick={() => onRemove(product.id)}
                    className="absolute -top-1 -right-1 p-1 rounded-full bg-zinc-800 hover:bg-red-900/50 transition-colors z-10"
                    aria-label={`Убрать ${product.name} из сравнения`}
                  >
                    <Trash2 className="w-3 h-3 text-zinc-400 hover:text-red-400" />
                  </button>
                  <div className="w-16 h-16 mx-auto rounded-lg bg-zinc-800 overflow-hidden mb-2">
                    {Array.isArray(product.images) && product.images[0] ? (
                      <img loading="lazy" src={String(product.images[0])} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs">
                        Фото
                      </div>
                    )}
                  </div>
                  <p className="text-white text-xs font-medium line-clamp-2 leading-tight">{product.name}</p>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="border-t border-zinc-800/50">
              <td className="text-zinc-500 text-xs py-3 pr-3 align-middle">{row.label}</td>
              {products.map(product => {
                const value = row.getValue(product);
                const isBest = shouldHighlight(product, products, row);
                return (
                  <td
                    key={product.id}
                    className={`text-center text-sm py-3 px-2 align-middle ${
                      isBest ? 'text-green-400 font-medium' : 'text-white'
                    }`}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: number, currency?: string): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: currency || 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
}

function shouldHighlight(
  product: ShopProduct,
  all: ShopProduct[],
  row: { highlight: 'min' | 'max' | 'none'; getValue: (p: ShopProduct) => string },
): boolean {
  if (row.highlight === 'none' || all.length < 2) return false;

  if (row.highlight === 'min') {
    const values = all.map(p => p.price);
    return product.price === Math.min(...values) && new Set(values).size > 1;
  }

  if (row.highlight === 'max') {
    const values = all.map(p => p.price);
    return product.price === Math.max(...values) && new Set(values).size > 1;
  }

  return false;
}
