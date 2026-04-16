/**
 * useSellerDashboard — хук для панели продавца.
 *
 * Собирает статистику: выручка, заказы, рейтинг, pending отправки, топ товары.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

export interface SellerStats {
  totalRevenue: number;
  totalOrders: number;
  averageRating: number;
  pendingShipments: number;
  returnRate: number;
  topProducts: { name: string; sales: number }[];
}

interface SellerOrder {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  items: unknown;
}

interface SellerReview {
  id: string;
  rating: number;
  text: string | null;
  product_id: string;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSellerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<SellerStats>({
    totalRevenue: 0,
    totalOrders: 0,
    averageRating: 0,
    pendingShipments: 0,
    returnRate: 0,
    topProducts: [],
  });
  const [recentOrders, setRecentOrders] = useState<SellerOrder[]>([]);
  const [pendingReviews, setPendingReviews] = useState<SellerReview[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Получить магазин пользователя
      const { data: shop, error: shopErr } = await dbLoose.from('shops')
        .select('id')
        .eq('owner_id', user.id)
        .maybeSingle();

      if (shopErr || !shop) {
        logger.warn('[useSellerDashboard] Магазин не найден', { error: shopErr });
        setLoading(false);
        return;
      }

      // 2. Заказы магазина
      const { data: orders } = await dbLoose.from('shop_orders')
        .select('id, total_amount, status, created_at, items')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(200);

      const allOrders = orders ?? [];
      setRecentOrders(allOrders.slice(0, 20));

      // 3. Рассчитать статистику
      const totalRevenue = allOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
      const totalOrders = allOrders.length;
      const pendingShipments = allOrders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;
      const returned = allOrders.filter(o => o.status === 'returned').length;
      const returnRate = totalOrders > 0 ? Math.round((returned / totalOrders) * 100) : 0;

      // 4. Товары магазина
      const { data: products } = await dbLoose.from('shop_products')
        .select('id, name')
        .eq('shop_id', shop.id)
        .limit(100);

      // 5. Отзывы на товары
      const productIds = (products ?? []).map(p => p.id);
      let reviewData: SellerReview[] = [];
      if (productIds.length > 0) {
        const { data: reviews } = await dbLoose.from('product_reviews')
          .select('id, rating, text, product_id, created_at')
          .in('product_id', productIds)
          .order('created_at', { ascending: false })
          .limit(50);

        reviewData = reviews ?? [];
      }

      setPendingReviews(reviewData.slice(0, 10));

      const averageRating = reviewData.length > 0
        ? Math.round((reviewData.reduce((s, r) => s + r.rating, 0) / reviewData.length) * 10) / 10
        : 0;

      // Topпродукты по продажам (на основе заказов)
      const salesMap = new Map<string, number>();
      for (const order of allOrders) {
        if (Array.isArray(order.items)) {
          for (const item of order.items as { productId?: string; quantity?: number }[]) {
            if (item.productId) {
              salesMap.set(item.productId, (salesMap.get(item.productId) ?? 0) + (item.quantity ?? 1));
            }
          }
        }
      }

      const topProducts = (products ?? [])
        .map(p => ({ name: p.name, sales: salesMap.get(p.id) ?? 0 }))
        .sort((a, b) => b.sales - a.sales)
        .slice(0, 5);

      setStats({
        totalRevenue,
        totalOrders,
        averageRating,
        pendingShipments,
        returnRate,
        topProducts,
      });
    } catch (e) {
      logger.error('[useSellerDashboard] Ошибка загрузки', { error: e });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  return { stats, recentOrders, pendingReviews, loading, refresh: fetchDashboard };
}
