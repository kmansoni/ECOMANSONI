import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface StarTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  related_gift_id?: string | null;
  related_user_id?: string | null;
  description?: string | null;
  created_at: string;
}

const DAILY_BONUS_KEY = "stars.daily_bonus.last_claimed";
const DAILY_BONUS_AMOUNT = 10;

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 1000): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)));
    }
  }
  throw new Error("withRetry exhausted");
}

export function useStars() {
  const { user } = useAuth();
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<StarTransaction[]>([]);
  const [canClaimDaily, setCanClaimDaily] = useState(false);
  const [dailyNextAt, setDailyNextAt] = useState<Date | null>(null);
  const [starsUnavailable, setStarsUnavailable] = useState(false);

  const isOptionalStarsError = (error: any): boolean => {
    const code = String(error?.code ?? "");
    const status = Number(error?.status ?? 0);
    const message = String(error?.message ?? "").toLowerCase();
    const details = String(error?.details ?? "").toLowerCase();
    return (
      code === "42P01" ||
      code === "PGRST204" ||
      code === "PGRST205" ||
      code === "42501" ||
      status === 403 ||
      status === 404 ||
      message.includes("user_stars") ||
      details.includes("user_stars")
    );
  };

  const fetchBalance = useCallback(async () => {
    if (!user || starsUnavailable) return;
    try {
      const data = await withRetry(async () => {
        const { data, error } = await (supabase as any)
          .from("user_stars")
          .select("balance")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) {
          if (isOptionalStarsError(error)) {
            setStarsUnavailable(true);
            setBalance(0);
            return null;
          }
          throw error;
        }
        return data;
      });
      if (data !== null) {
        setBalance(data?.balance ?? 0);
      }
    } catch {
      setBalance(0);
    }
  }, [user, starsUnavailable]);

  const fetchTransactions = useCallback(async () => {
    if (!user || starsUnavailable) return;
    try {
      const { data } = await (supabase as any)
        .from("star_transactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setTransactions(data ?? []);
    } catch {
      setTransactions([]);
    }
  }, [user, starsUnavailable]);

  const checkDailyBonus = useCallback(() => {
    const lastClaimed = localStorage.getItem(DAILY_BONUS_KEY);
    if (!lastClaimed) {
      setCanClaimDaily(true);
      setDailyNextAt(null);
      return;
    }
    const last = new Date(lastClaimed);
    const next = new Date(last.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    if (now >= next) {
      setCanClaimDaily(true);
      setDailyNextAt(null);
    } else {
      setCanClaimDaily(false);
      setDailyNextAt(next);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchBalance(), fetchTransactions()])
      .finally(() => setLoading(false));
    checkDailyBonus();
  }, [user, fetchBalance, fetchTransactions, checkDailyBonus]);

  const addStars = useCallback(async (amount: number, description = "Пополнение баланса") => {
    if (!user || starsUnavailable) return;
    try {
      // Upsert user_stars
      await (supabase as any)
        .from("user_stars")
        .upsert(
          { user_id: user.id, balance: amount, total_earned: amount },
          {
            onConflict: "user_id",
            ignoreDuplicates: false,
          }
        );
      // We use a raw update instead to properly increment
      await (supabase as any).rpc("add_stars_to_user", {
        p_user_id: user.id,
        p_amount: amount,
        p_description: description,
      }).then(async () => {
        // fallback: direct update
      }).catch(async () => {
        // Fallback if RPC not available: direct insert/update
        const { data: existing } = await (supabase as any)
          .from("user_stars")
          .select("balance, total_earned")
          .eq("user_id", user.id)
          .maybeSingle();

        if (existing) {
          await (supabase as any)
            .from("user_stars")
            .update({
              balance: existing.balance + amount,
              total_earned: existing.total_earned + amount,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id);
        } else {
          await (supabase as any)
            .from("user_stars")
            .insert({ user_id: user.id, balance: amount, total_earned: amount });
        }

        await (supabase as any)
          .from("star_transactions")
          .insert({
            user_id: user.id,
            amount,
            type: "purchase",
            description,
          });
      });

      await fetchBalance();
      await fetchTransactions();
      toast.success(`+${amount} ⭐ начислено`);
    } catch (e) {
      logger.error("[useStars] addStars error", { error: e });
      toast.error("Не удалось пополнить баланс");
    }
  }, [user, fetchBalance, fetchTransactions, starsUnavailable]);

  const claimDailyBonus = useCallback(async () => {
    if (!user || !canClaimDaily || starsUnavailable) return;
    try {
      const { data: existing } = await (supabase as any)
        .from("user_stars")
        .select("balance, total_earned")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await (supabase as any)
          .from("user_stars")
          .update({
            balance: existing.balance + DAILY_BONUS_AMOUNT,
            total_earned: existing.total_earned + DAILY_BONUS_AMOUNT,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id);
      } else {
        await (supabase as any)
          .from("user_stars")
          .insert({ user_id: user.id, balance: DAILY_BONUS_AMOUNT, total_earned: DAILY_BONUS_AMOUNT });
      }

      await (supabase as any)
        .from("star_transactions")
        .insert({
          user_id: user.id,
          amount: DAILY_BONUS_AMOUNT,
          type: "daily_bonus",
          description: "Ежедневный бонус",
        });

      localStorage.setItem(DAILY_BONUS_KEY, new Date().toISOString());
      setCanClaimDaily(false);
      const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setDailyNextAt(next);
      await fetchBalance();
      await fetchTransactions();
      toast.success(`+${DAILY_BONUS_AMOUNT} ⭐ ежедневный бонус!`);
    } catch (e) {
      logger.error("[useStars] claimDailyBonus error", { error: e });
      toast.error("Не удалось получить бонус");
    }
  }, [user, canClaimDaily, fetchBalance, fetchTransactions, starsUnavailable]);

  return {
    balance,
    loading,
    transactions,
    canClaimDaily,
    dailyNextAt,
    addStars,
    claimDailyBonus,
    refetch: () => {
      if (starsUnavailable) return;
      fetchBalance();
      fetchTransactions();
    },
  };
}
