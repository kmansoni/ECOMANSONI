import { useState, useCallback } from "react";
import type { ComparisonItem } from "@/types/insurance";
import { MAX_COMPARISON_ITEMS } from "@/lib/insurance/constants";

/**
 * Хук для управления режимом сравнения страховых продуктов
 */
export function useInsuranceCompare() {
  const [compareItems, setCompareItems] = useState<ComparisonItem[]>([]);
  const [isComparing, setIsComparing] = useState(false);

  const addToCompare = useCallback((item: ComparisonItem) => {
    setCompareItems((prev) => {
      if (prev.length >= MAX_COMPARISON_ITEMS) return prev;
      const alreadyAdded = prev.some(
        (i) => i.product.id === item.product.id,
      );
      if (alreadyAdded) return prev;
      const updated = [...prev, item];
      if (updated.length > 0) setIsComparing(true);
      return updated;
    });
  }, []);

  const removeFromCompare = useCallback((productId: string) => {
    setCompareItems((prev) => {
      const updated = prev.filter((i) => i.product.id !== productId);
      if (updated.length === 0) setIsComparing(false);
      return updated;
    });
  }, []);

  const clearCompare = useCallback(() => {
    setCompareItems([]);
    setIsComparing(false);
  }, []);

  const isInCompare = useCallback(
    (productId: string) => compareItems.some((i) => i.product.id === productId),
    [compareItems],
  );

  const canAddMore = compareItems.length < MAX_COMPARISON_ITEMS;

  return {
    compareItems,
    isComparing,
    canAddMore,
    addToCompare,
    removeFromCompare,
    clearCompare,
    isInCompare,
    count: compareItems.length,
  };
}
