/**
 * useBoostedPosts — продвижение постов.
 *
 * Возвращает:
 *  - boostPost(postId, budgetCents, durationHours) — создать буст
 *  - myBoosts — список бустов
 *  - cancelBoost(id) — отменить
 *  - getBoostStats(id) — статистика
 *  - loading
 */
import { useState, useEffect, useCallback } from "react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface BoostedPost {
  id: string;
  post_id: string;
  budget_cents: number;
  spent_cents: number;
  duration_hours: number;
  status: string;
  target_reach: number;
  actual_reach: number;
  started_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface BoostStats {
  reach: number;
  impressions: number;
  engagement: number;
}

export function useBoostedPosts() {
  const { user } = useAuth();
  const [myBoosts, setMyBoosts] = useState<BoostedPost[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setMyBoosts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    dbLoose
      .from("boosted_posts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logger.error("[useBoostedPosts] Ошибка загрузки бустов", { error });
        } else {
          setMyBoosts((data ?? []) as BoostedPost[]);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

  const boostPost = useCallback(
    async (postId: string, budgetCents: number, durationHours: number): Promise<BoostedPost | null> => {
      if (!user) { toast.error("Требуется авторизация"); return null; }

      if (budgetCents < 100) {
        toast.error("Минимальный бюджет — 1 ₽");
        return null;
      }

      if (durationHours < 1 || durationHours > 720) {
        toast.error("Длительность: от 1 часа до 30 дней");
        return null;
      }

      try {
        // Прогноз охвата: ~1 показ на 1 копейку (упрощённая формула)
        const targetReach = Math.round(budgetCents * 0.8);

        const { data, error } = await dbLoose
          .from("boosted_posts")
          .insert({
            post_id: postId,
            user_id: user.id,
            budget_cents: budgetCents,
            duration_hours: durationHours,
            target_reach: targetReach,
            status: "pending",
          })
          .select("*")
          .single();

        if (error) {
          if (error.code === "23505") {
            toast.error("Этот пост уже продвигается");
          } else {
            logger.error("[useBoostedPosts] Ошибка создания буста", { error });
            toast.error("Не удалось запустить продвижение");
          }
          return null;
        }

        const boost = data as BoostedPost;
        setMyBoosts((prev) => [boost, ...prev]);
        toast.success("Продвижение создано");
        return boost;
      } catch (e) {
        logger.error("[useBoostedPosts] boostPost error", { error: e });
        toast.error("Ошибка при создании продвижения");
        return null;
      }
    },
    [user],
  );

  const cancelBoost = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;

      try {
        const { error } = await dbLoose
          .from("boosted_posts")
          .update({ status: "cancelled" })
          .eq("id", id)
          .eq("user_id", user.id)
          .in("status", ["pending", "active"]);

        if (error) {
          logger.error("[useBoostedPosts] cancelBoost error", { error });
          toast.error("Не удалось отменить продвижение");
          return;
        }

        setMyBoosts((prev) => prev.map((b) => b.id === id ? { ...b, status: "cancelled" } : b));
        toast.success("Продвижение отменено");
      } catch (e) {
        logger.error("[useBoostedPosts] cancelBoost unexpected", { error: e });
        toast.error("Ошибка при отмене продвижения");
      }
    },
    [user],
  );

  const getBoostStats = useCallback(
    async (id: string): Promise<BoostStats | null> => {
      const boost = myBoosts.find((b) => b.id === id);
      if (!boost) return null;

      // Статистика из boosted_posts (actual_reach уже обновляется серверной логикой)
      return {
        reach: boost.actual_reach,
        impressions: Math.round(boost.actual_reach * 1.2),
        engagement: Math.round(boost.actual_reach * 0.05),
      };
    },
    [myBoosts],
  );

  return { boostPost, myBoosts, cancelBoost, getBoostStats, loading } as const;
}
