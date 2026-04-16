/**
 * useSellerRating — хук для рейтинга продавца.
 *
 * Загружает средний рейтинг, распределение по звёздам и список отзывов.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

export interface RatingDistribution {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}

export interface SellerRatingData {
  average: number;
  count: number;
  distribution: RatingDistribution;
}

export interface SellerReviewItem {
  id: string;
  user_id: string;
  text: string | null;
  rating: number;
  created_at: string;
  username?: string;
  avatar_url?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSellerRating(sellerId: string) {
  const [rating, setRating] = useState<SellerRatingData>({
    average: 0,
    count: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [reviews, setReviews] = useState<SellerReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sellerId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);

      try {
        // 1. Получить товары продавца (через магазин)
        const { data: shop } = await dbLoose.from('shops')
          .select('id')
          .eq('owner_id', sellerId)
          .maybeSingle();

        if (!shop || cancelled) {
          setLoading(false);
          return;
        }

        // 2. ID товаров
        const { data: products } = await dbLoose.from('shop_products')
          .select('id')
          .eq('shop_id', shop.id)
          .limit(200);

        const productIds = (products ?? []).map(p => p.id);
        if (productIds.length === 0 || cancelled) {
          setLoading(false);
          return;
        }

        // 3. Отзывы
        const { data: reviewsData } = await dbLoose.from('product_reviews')
          .select('id, user_id, text, rating, created_at, profiles(username, avatar_url)')
          .in('product_id', productIds)
          .order('created_at', { ascending: false })
          .limit(100);

        if (cancelled) return;

        const allReviews = (reviewsData ?? []).map(r => {
          const profile = r.profiles as unknown as { username: string | null; avatar_url: string | null } | null;
          return {
            id: r.id,
            user_id: r.user_id,
            text: r.text,
            rating: r.rating,
            created_at: r.created_at,
            username: profile?.username ?? undefined,
            avatar_url: profile?.avatar_url ?? undefined,
          };
        });

        setReviews(allReviews);

        // 4. Рассчитать рейтинг
        const count = allReviews.length;
        const average = count > 0
          ? Math.round((allReviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10
          : 0;

        const distribution: RatingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        for (const r of allReviews) {
          const star = Math.min(5, Math.max(1, Math.round(r.rating))) as 1 | 2 | 3 | 4 | 5;
          distribution[star]++;
        }

        setRating({ average, count, distribution });
      } catch (e) {
        logger.error('[useSellerRating] Ошибка загрузки рейтинга', { error: e });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [sellerId]);

  return { rating, reviews, loading };
}
