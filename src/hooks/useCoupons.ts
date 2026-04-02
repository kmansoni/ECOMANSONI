/**
 * useCoupons — хук для работы с промокодами маркетплейса.
 *
 * - applyCoupon: валидация и применение промокода к заказу
 * - createCoupon: создание нового купона (для продавцов)
 * - myCoupons: список созданных купонов
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ApplyCouponResult {
  valid: boolean;
  discount: number;
  coupon: Coupon | null;
  error: string | null;
}

export interface CreateCouponInput {
  code: string;
  description?: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount?: number;
  max_uses?: number;
  valid_until?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useCoupons() {
  const { user } = useAuth();
  const [myCoupons, setMyCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);

  // Загрузка купонов продавца
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function load() {
      const { data, error } = await db.from('coupons')
        .select('id, code, description, discount_type, discount_value, min_order_amount, max_uses, used_count, valid_from, valid_until, is_active, created_by, created_at')
        .eq('created_by', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (!cancelled && data) {
        setMyCoupons(data);
      }
      if (error) {
        logger.error('[useCoupons] Ошибка загрузки купонов', { error });
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [user]);

  // Применить промокод
  const applyCoupon = useCallback(async (code: string, orderAmount: number): Promise<ApplyCouponResult> => {
    if (!code.trim()) {
      return { valid: false, discount: 0, coupon: null, error: 'Введите промокод' };
    }

    try {
      const { data: coupon, error } = await db.from('coupons')
        .select('id, code, description, discount_type, discount_value, min_order_amount, max_uses, used_count, valid_from, valid_until, is_active, created_by, created_at')
        .eq('code', code.trim().toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        logger.error('[useCoupons] Ошибка проверки промокода', { error });
        return { valid: false, discount: 0, coupon: null, error: 'Ошибка проверки промокода' };
      }

      if (!coupon) {
        return { valid: false, discount: 0, coupon: null, error: 'Промокод не найден или неактивен' };
      }

      // Проверка срока действия
      if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
        return { valid: false, discount: 0, coupon: null, error: 'Срок действия промокода истёк' };
      }

      // Проверка лимита использований
      if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
        return { valid: false, discount: 0, coupon: null, error: 'Промокод больше недействителен' };
      }

      // Проверка минимальной суммы заказа
      if (orderAmount < coupon.min_order_amount) {
        return {
          valid: false,
          discount: 0,
          coupon: null,
          error: `Минимальная сумма заказа: ${coupon.min_order_amount} ₽`,
        };
      }

      // Проверка, не использовал ли пользователь уже этот купон
      if (user) {
        const { data: usage } = await db.from('coupon_usages')
          .select('id')
          .eq('coupon_id', coupon.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (usage) {
          return { valid: false, discount: 0, coupon: null, error: 'Вы уже использовали этот промокод' };
        }
      }

      // Рассчитать скидку
      let discount = 0;
      if (coupon.discount_type === 'percentage') {
        discount = Math.round(orderAmount * coupon.discount_value / 100);
      } else {
        discount = Math.min(coupon.discount_value, orderAmount);
      }

      return { valid: true, discount, coupon, error: null };
    } catch (e) {
      logger.error('[useCoupons] applyCoupon failed', { error: e });
      return { valid: false, discount: 0, coupon: null, error: 'Ошибка проверки промокода' };
    }
  }, [user]);

  // Создание купона (для продавцов)
  const createCoupon = useCallback(async (input: CreateCouponInput): Promise<Coupon | null> => {
    if (!user) {
      toast.error('Необходимо авторизоваться');
      return null;
    }

    if (!input.code.trim()) {
      toast.error('Укажите код промокода');
      return null;
    }

    if (input.discount_value <= 0) {
      toast.error('Скидка должна быть больше 0');
      return null;
    }

    if (input.discount_type === 'percentage' && input.discount_value > 100) {
      toast.error('Скидка не может превышать 100%');
      return null;
    }

    setLoading(true);
    try {
      const { data, error } = await db.from('coupons')
        .insert({
          code: input.code.trim().toUpperCase(),
          description: input.description || null,
          discount_type: input.discount_type,
          discount_value: input.discount_value,
          min_order_amount: input.min_order_amount ?? 0,
          max_uses: input.max_uses ?? null,
          valid_until: input.valid_until ?? null,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
          toast.error('Промокод с таким кодом уже существует');
        } else {
          toast.error('Ошибка создания промокода');
          logger.error('[useCoupons] createCoupon failed', { error });
        }
        return null;
      }

      if (data) {
        setMyCoupons(prev => [data, ...prev]);
        toast.success('Промокод создан');
      }
      return data;
    } catch (e) {
      logger.error('[useCoupons] createCoupon exception', { error: e });
      toast.error('Ошибка создания промокода');
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Деактивация купона
  const deactivateCoupon = useCallback(async (couponId: string) => {
    const { error } = await db.from('coupons')
      .update({ is_active: false })
      .eq('id', couponId);

    if (error) {
      toast.error('Ошибка деактивации купона');
      logger.error('[useCoupons] deactivateCoupon failed', { error });
      return;
    }

    setMyCoupons(prev => prev.map(c => c.id === couponId ? { ...c, is_active: false } : c));
    toast.success('Промокод деактивирован');
  }, []);

  return { applyCoupon, createCoupon, deactivateCoupon, myCoupons, loading };
}
