/**
 * usePremium — управление Premium подпиской.
 *
 * Возвращает:
 *  - subscription: PremiumSubscription | null
 *  - isPremium: boolean
 *  - hasFeature(slug) → boolean
 *  - subscribe(plan) → создать подписку
 *  - cancelSubscription()
 *  - features → все фичи с доступностью
 *  - loading
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export type PlanType = "basic" | "pro" | "business";

export interface PremiumSubscription {
  id: string;
  user_id: string;
  plan: PlanType;
  started_at: string;
  expires_at: string;
  auto_renew: boolean;
  payment_method: string | null;
}

export interface PremiumFeature {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  min_plan: PlanType;
}

const PLAN_ORDER: Record<PlanType, number> = { basic: 1, pro: 2, business: 3 };

function planIncludes(userPlan: PlanType, requiredPlan: PlanType): boolean {
  return PLAN_ORDER[userPlan] >= PLAN_ORDER[requiredPlan];
}

export function usePremium() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<PremiumSubscription | null>(null);
  const [features, setFeatures] = useState<PremiumFeature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setSubscription(null);
      setFeatures([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [subRes, featRes] = await Promise.all([
          dbLoose
            .from("premium_subscriptions")
            .select("id, user_id, plan, started_at, expires_at, auto_renew, payment_method")
            .eq("user_id", user.id)
            .limit(1)
            .single(),
          dbLoose
            .from("premium_features")
            .select("id, slug, name, description, min_plan")
            .order("min_plan", { ascending: true })
            .limit(50),
        ]);

        if (cancelled) return;

        if (subRes.error && (subRes.error as unknown as Record<string, unknown>).code !== "PGRST116") {
          logger.error("[usePremium] Ошибка загрузки подписки", { error: subRes.error });
        }

        const sub = subRes.data as unknown as PremiumSubscription | null;
        // Проверяем что подписка не истекла
        if (sub && new Date(sub.expires_at) > new Date()) {
          setSubscription(sub);
        } else {
          setSubscription(null);
        }

        if (featRes.error) {
          logger.error("[usePremium] Ошибка загрузки фич", { error: featRes.error });
        } else {
          setFeatures((featRes.data ?? []) as unknown as PremiumFeature[]);
        }
      } catch (err) {
        logger.error("[usePremium] Непредвиденная ошибка", { error: err });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const isPremium = subscription !== null;

  const hasFeature = useCallback(
    (slug: string): boolean => {
      if (!subscription) return false;
      const feature = features.find((f) => f.slug === slug);
      if (!feature) return false;
      return planIncludes(subscription.plan, feature.min_plan);
    },
    [subscription, features],
  );

  const subscribe = useCallback(
    async (plan: PlanType) => {
      if (!user) { toast.error("Требуется авторизация"); return; }

      try {
        const now = new Date();
        const expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + 1);

        const payload = {
          user_id: user.id,
          plan,
          started_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          auto_renew: true,
        };

        // Upsert: если подписка уже есть — обновляем
        const { data, error } = await dbLoose
          .from("premium_subscriptions")
          .upsert(payload, { onConflict: "user_id" })
          .select("id, user_id, plan, started_at, expires_at, auto_renew, payment_method")
          .single();

        if (error) throw error;
        setSubscription(data as unknown as PremiumSubscription);
        toast.success(`Подписка ${plan.toUpperCase()} активирована`);
      } catch (err) {
        logger.error("[usePremium] Ошибка подписки", { error: err });
        toast.error("Не удалось оформить подписку");
      }
    },
    [user],
  );

  const cancelSubscription = useCallback(async () => {
    if (!user || !subscription) return;
    try {
      const { error } = await dbLoose
        .from("premium_subscriptions")
        .update({ auto_renew: false })
        .eq("user_id", user.id);

      if (error) throw error;
      setSubscription((prev) => prev ? { ...prev, auto_renew: false } : null);
      toast.success("Автопродление отключено");
    } catch (err) {
      logger.error("[usePremium] Ошибка отмены подписки", { error: err });
      toast.error("Не удалось отменить подписку");
    }
  }, [user, subscription]);

  const featuresWithAccess = useMemo(() => {
    return features.map((f) => ({
      ...f,
      available: subscription ? planIncludes(subscription.plan, f.min_plan) : false,
    }));
  }, [features, subscription]);

  return {
    subscription,
    isPremium,
    hasFeature,
    subscribe,
    cancelSubscription,
    features: featuresWithAccess,
    loading,
  } as const;
}
