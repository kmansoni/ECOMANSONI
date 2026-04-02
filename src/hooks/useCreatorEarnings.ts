/**
 * useCreatorEarnings — доходы от контента и запросы на выплату.
 *
 * Возвращает:
 *  - summary — общая статистика (total, pending, paid, thisMonth)
 *  - history — последние записи доходов
 *  - requestPayout(amountCents, method, details) — запрос на выплату
 *  - payoutRequests — список запросов на выплату
 *  - loading
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface Earnings {
  total: number;
  pending: number;
  paid: number;
  thisMonth: number;
}

export interface EarningEntry {
  id: string;
  source: string;
  amount_cents: number;
  description: string | null;
  status: string;
  created_at: string;
}

export interface PayoutRequest {
  id: string;
  amount_cents: number;
  method: string;
  status: string;
  payout_details: Record<string, unknown>;
  created_at: string;
}

type PayoutMethod = "bank_transfer" | "paypal" | "crypto";

const MIN_PAYOUT_CENTS = 1000;

export function useCreatorEarnings() {
  const { user } = useAuth();
  const [history, setHistory] = useState<EarningEntry[]>([]);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      setPayoutRequests([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      dbLoose
        .from("creator_earnings")
        .select("id, source, amount_cents, description, status, created_at")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      dbLoose
        .from("payout_requests")
        .select("id, amount_cents, method, status, payout_details, created_at")
        .eq("creator_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]).then(([earningsRes, payoutsRes]) => {
      if (cancelled) return;

      if (earningsRes.error) {
        logger.error("[useCreatorEarnings] Ошибка загрузки доходов", { error: earningsRes.error });
      } else {
        setHistory((earningsRes.data ?? []) as EarningEntry[]);
      }

      if (payoutsRes.error) {
        logger.error("[useCreatorEarnings] Ошибка загрузки выплат", { error: payoutsRes.error });
      } else {
        setPayoutRequests((payoutsRes.data ?? []) as PayoutRequest[]);
      }

      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user]);

  const summary = useMemo<Earnings>(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    let total = 0;
    let pending = 0;
    let paid = 0;
    let thisMonth = 0;

    for (const entry of history) {
      const cents = entry.amount_cents;
      if (entry.status === "approved" || entry.status === "paid") total += cents;
      if (entry.status === "pending") pending += cents;
      if (entry.status === "paid") paid += cents;
      if (entry.created_at >= monthStart && entry.status !== "rejected") thisMonth += cents;
    }

    return { total, pending, paid, thisMonth };
  }, [history]);

  const requestPayout = useCallback(
    async (amountCents: number, method: PayoutMethod, details: Record<string, string>): Promise<void> => {
      if (!user) { toast.error("Требуется авторизация"); return; }

      if (amountCents < MIN_PAYOUT_CENTS) {
        toast.error(`Минимальная сумма вывода — ${MIN_PAYOUT_CENTS / 100} ₽`);
        return;
      }

      const available = summary.total - summary.paid;
      if (amountCents > available) {
        toast.error("Недостаточно средств для вывода");
        return;
      }

      try {
        const { data, error } = await dbLoose
          .from("payout_requests")
          .insert({
            creator_id: user.id,
            amount_cents: amountCents,
            method,
            status: "pending",
            payout_details: details,
          })
          .select("id, amount_cents, method, status, payout_details, created_at")
          .single();

        if (error) {
          logger.error("[useCreatorEarnings] requestPayout error", { error });
          toast.error("Не удалось создать запрос на выплату");
          return;
        }

        setPayoutRequests((prev) => [data as PayoutRequest, ...prev]);
        toast.success("Запрос на выплату создан");
      } catch (e) {
        logger.error("[useCreatorEarnings] requestPayout unexpected", { error: e });
        toast.error("Ошибка при создании запроса на выплату");
      }
    },
    [user, summary],
  );

  return { summary, history, requestPayout, payoutRequests, loading } as const;
}
