/**
 * useProductCompare — хук для сравнения товаров (max 4).
 *
 * Zustand store для глобального состояния списка сравнения.
 */

import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { toast } from 'sonner';
import { type ShopProduct } from '@/hooks/useShop';

const MAX_COMPARE = 4;

interface CompareStore {
  items: ShopProduct[];
  addItem: (product: ShopProduct) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

const useCompareStore = create<CompareStore>((set, get) => ({
  items: [],
  addItem: (product) => {
    const current = get().items;
    if (current.length >= MAX_COMPARE) {
      toast.error(`Максимум ${MAX_COMPARE} товара для сравнения`);
      return;
    }
    if (current.some(p => p.id === product.id)) {
      toast.info('Товар уже в сравнении');
      return;
    }
    set({ items: [...current, product] });
    toast.success('Добавлено в сравнение');
  },
  removeItem: (productId) => {
    set(state => ({ items: state.items.filter(p => p.id !== productId) }));
  },
  clear: () => {
    set({ items: [] });
  },
}));

export function useProductCompare() {
  const items = useCompareStore(s => s.items);
  const addItemStore = useCompareStore(s => s.addItem);
  const removeItemStore = useCompareStore(s => s.removeItem);
  const clearStore = useCompareStore(s => s.clear);

  const addToCompare = useCallback(
    (product: ShopProduct) => addItemStore(product),
    [addItemStore],
  );

  const removeFromCompare = useCallback(
    (productId: string) => removeItemStore(productId),
    [removeItemStore],
  );

  const clearCompare = useCallback(
    () => clearStore(),
    [clearStore],
  );

  const isInCompare = useCallback(
    (productId: string) => items.some(p => p.id === productId),
    [items],
  );

  const compareCount = useMemo(() => items.length, [items]);

  return {
    compareList: items,
    addToCompare,
    removeFromCompare,
    clearCompare,
    isInCompare,
    compareCount,
  };
}
