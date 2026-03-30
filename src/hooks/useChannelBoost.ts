/**
 * useChannelBoost — Channel Boost via Stars
 *
 * Provides:
 *  - boostChannel(channelId, starsAmount)  — deduct Stars, upsert boost record
 *  - getBoostLevel(channelId)              — level, perks, boostersCount
 *  - getMyBoost(channelId)                 — current user boost or null
 *  - topBoosters(channelId, limit)         — top boosters list
 *
 * Security notes:
 *  - Stars deduction must be validated server-side (service_role function).
 *    Client-side optimistic update is safe because RLS enforces user_id = auth.uid().
 *  - expires_at is set to NOW() + 30 days on client; server MUST validate this.
 *  - channel_boost_levels is mutated only by service_role (DB trigger / Edge Function).
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { logger } from "@/lib/logger";

// Using `any` cast until Supabase types are regenerated with new tables
const db = supabase as any;

export interface ChannelBoostLevel {
  currentLevel: number;
  totalBoosts: number;
  perks: Record<string, unknown>;
  boostersCount: number;
}

export interface ChannelBoostRecord {
  id: string;
  channelId: string;
  userId: string;
  starsSpent: number;
  boostLevel: number;
  expiresAt: string;
  createdAt: string;
}

export interface TopBooster {
  userId: string;
  starsSpent: number;
  boostLevel: number;
  expiresAt: string;
}

/** 30 days boost duration */
const BOOST_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/** Stars → boost level mapping (mirrors server logic) */
const STARS_TO_LEVEL: { minStars: number; level: number }[] = [
  { minStars: 1000, level: 5 },
  { minStars: 500, level: 4 },
  { minStars: 200, level: 3 },
  { minStars: 100, level: 2 },
  { minStars: 1, level: 1 },
];

function starsToBoostLevel(stars: number): number {
  for (const entry of STARS_TO_LEVEL) {
    if (stars >= entry.minStars) return entry.level;
  }
  return 1;
}

export function useChannelBoost() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Boost a channel with specified Stars amount.
   * - Validates stars > 0
   * - Upserts boost record (UNIQUE constraint: channel_id + user_id → ON CONFLICT update)
   * - Stars deduction: delegated to Supabase Edge Function `deduct-stars`
   *   to prevent client-side bypass attacks
   */
  const boostChannel = useCallback(
    async (channelId: string, starsAmount: number): Promise<{ ok: boolean; error?: string }> => {
      if (!user) return { ok: false, error: "Не авторизован" };
      if (starsAmount <= 0) return { ok: false, error: "Количество Stars должно быть больше 0" };

      setLoading(true);
      setError(null);

      try {
        // Step 1: Deduct Stars via Edge Function (atomic, server-enforced)
        const { data: deductData, error: deductError } = await supabase.functions.invoke(
          "deduct-stars",
          { body: { amount: starsAmount, reason: "channel_boost", channelId } }
        );
        if (deductError || !deductData?.ok) {
          const msg = deductError?.message ?? deductData?.error ?? "Недостаточно Stars";
          setError(msg);
          return { ok: false, error: msg };
        }

        // Step 2: Upsert boost record
        const expiresAt = new Date(Date.now() + BOOST_DURATION_MS).toISOString();
        const boostLevel = starsToBoostLevel(starsAmount);

        const { error: upsertError } = await db
          .from("channel_boosts")
          .upsert(
            {
              channel_id: channelId,
              user_id: user.id,
              stars_spent: starsAmount,
              boost_level: boostLevel,
              expires_at: expiresAt,
            },
            { onConflict: "channel_id,user_id" }
          );

        if (upsertError) {
          setError(upsertError.message);
          return { ok: false, error: upsertError.message };
        }

        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  /**
   * Get aggregated boost level for a channel.
   */
  const getBoostLevel = useCallback(
    async (channelId: string): Promise<ChannelBoostLevel | null> => {
      const { data, error: fetchError } = await db
        .from("channel_boost_levels")
        .select("*")
        .eq("channel_id", channelId)
        .maybeSingle();

      if (fetchError) {
        logger.error("[useChannelBoost] getBoostLevel error", { error: fetchError });
        return null;
      }
      if (!data) {
        return { currentLevel: 0, totalBoosts: 0, perks: {}, boostersCount: 0 };
      }

      // Count distinct active boosters
      const now = new Date().toISOString();
      const { count } = await db
        .from("channel_boosts")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channelId)
        .gt("expires_at", now);

      return {
        currentLevel: data.current_level ?? 0,
        totalBoosts: data.total_boosts ?? 0,
        perks: data.perks ?? {},
        boostersCount: count ?? 0,
      };
    },
    []
  );

  /**
   * Get current user's boost for a channel (or null if not boosted / expired).
   */
  const getMyBoost = useCallback(
    async (channelId: string): Promise<ChannelBoostRecord | null> => {
      if (!user) return null;

      const now = new Date().toISOString();
      const { data, error: fetchError } = await db
        .from("channel_boosts")
        .select("*")
        .eq("channel_id", channelId)
        .eq("user_id", user.id)
        .gt("expires_at", now)
        .maybeSingle();

      if (fetchError) {
        logger.error("[useChannelBoost] getMyBoost error", { error: fetchError });
        return null;
      }
      if (!data) return null;

      return {
        id: data.id,
        channelId: data.channel_id,
        userId: data.user_id,
        starsSpent: data.stars_spent,
        boostLevel: data.boost_level,
        expiresAt: data.expires_at,
        createdAt: data.created_at,
      };
    },
    [user]
  );

  /**
   * Get top boosters for a channel, sorted by stars_spent descending.
   * Only returns active (non-expired) boosts.
   */
  const topBoosters = useCallback(
    async (channelId: string, limit = 10): Promise<TopBooster[]> => {
      const now = new Date().toISOString();
      const { data, error: fetchError } = await db
        .from("channel_boosts")
        .select("user_id, stars_spent, boost_level, expires_at")
        .eq("channel_id", channelId)
        .gt("expires_at", now)
        .order("stars_spent", { ascending: false })
        .limit(limit);

      if (fetchError) {
        logger.error("[useChannelBoost] topBoosters error", { error: fetchError });
        return [];
      }

      return (data ?? []).map((row: any) => ({
        userId: row.user_id,
        starsSpent: row.stars_spent,
        boostLevel: row.boost_level,
        expiresAt: row.expires_at,
      }));
    },
    []
  );

  return { boostChannel, getBoostLevel, getMyBoost, topBoosters, loading, error };
}
