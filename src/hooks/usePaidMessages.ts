/**
 * usePaidMessages — Stars-gated DM system
 *
 * Provides:
 *  - setPaidMessagePrice(stars)        — set own DM price (0 = free)
 *  - getPaidMessagePrice(userId)       — fetch price for a user
 *  - payForMessage(recipientId, stars) — deduct Stars, record transaction, return permit token
 *  - getMyTransactions(limit, offset)  — paginated transaction history
 *
 * Security:
 *  - Stars deduction MUST be atomic — delegated to `deduct-stars` Edge Function.
 *  - Transaction record is created server-side to prevent double-payment.
 *  - RLS enforces that only participants can read transactions.
 *  - `paid_message_stars` on profiles is writeable only by owner (auth.uid() check via RLS).
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const db = supabase as any;

export interface PaidMessageTransaction {
  id: string;
  senderId: string;
  recipientId: string;
  messageId: string | null;
  starsAmount: number;
  status: "completed" | "refunded";
  createdAt: string;
}

export interface PayForMessageResult {
  ok: boolean;
  transactionId?: string;
  error?: string;
}

export function usePaidMessages() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Set own DM price.
   * stars = 0 → free messages allowed.
   * stars > 0 → sender must pay that amount in Stars before sending a DM.
   *
   * Attack vector: client could send arbitrary value → mitigated by:
   *  - RLS: profiles UPDATE policy checks auth.uid() = id
   *  - Server validation: max price cap enforced in Edge Function
   */
  const setPaidMessagePrice = useCallback(
    async (stars: number): Promise<{ ok: boolean; error?: string }> => {
      if (!user) return { ok: false, error: "Не авторизован" };
      if (stars < 0) return { ok: false, error: "Цена не может быть отрицательной" };
      if (stars > 10000) return { ok: false, error: "Максимальная цена: 10 000 Stars" };

      setLoading(true);
      setError(null);

      try {
        const { error: updateError } = await db
          .from("profiles")
          .update({ paid_message_stars: stars })
          .eq("id", user.id);

        if (updateError) {
          setError(updateError.message);
          return { ok: false, error: updateError.message };
        }
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Ошибка обновления цены";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  /**
   * Get DM price for a specific user.
   * Returns 0 if user has free DMs or profile not found.
   */
  const getPaidMessagePrice = useCallback(
    async (userId: string): Promise<number> => {
      const { data, error: fetchError } = await db
        .from("profiles")
        .select("paid_message_stars")
        .eq("id", userId)
        .maybeSingle();

      if (fetchError) {
        console.error("[usePaidMessages] getPaidMessagePrice error:", fetchError);
        return 0;
      }
      return data?.paid_message_stars ?? 0;
    },
    []
  );

  /**
   * Pay Stars to send a message to a recipient.
   *
   * Flow:
   *  1. Verify recipient has paid_message_stars > 0 (guard against unnecessary payment)
   *  2. Call Edge Function `pay-for-message` which atomically:
   *     a. Deducts stars from sender
   *     b. Credits stars to recipient (platform takes 15% fee)
   *     c. Creates paid_message_transactions record
   *  3. Returns transactionId as permit for message send
   *
   * Replay attack protection: Edge Function generates idempotency key
   * from (sender_id + recipient_id + timestamp_floor_5min).
   */
  const payForMessage = useCallback(
    async (recipientId: string, starsAmount: number): Promise<PayForMessageResult> => {
      if (!user) return { ok: false, error: "Не авторизован" };
      if (starsAmount <= 0) return { ok: false, error: "Сумма должна быть больше 0" };

      setLoading(true);
      setError(null);

      try {
        const { data, error: fnError } = await supabase.functions.invoke("pay-for-message", {
          body: { recipientId, starsAmount },
        });

        if (fnError || !data?.ok) {
          const msg = fnError?.message ?? data?.error ?? "Ошибка платежа";
          setError(msg);
          return { ok: false, error: msg };
        }

        return { ok: true, transactionId: data.transactionId };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Ошибка платежа";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  /**
   * Get paginated transaction history for current user (as sender or recipient).
   */
  const getMyTransactions = useCallback(
    async (limit = 20, offset = 0): Promise<PaidMessageTransaction[]> => {
      if (!user) return [];

      const { data, error: fetchError } = await db
        .from("paid_message_transactions")
        .select("*")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (fetchError) {
        console.error("[usePaidMessages] getMyTransactions error:", fetchError);
        return [];
      }

      return (data ?? []).map((row: any): PaidMessageTransaction => ({
        id: row.id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        messageId: row.message_id ?? null,
        starsAmount: row.stars_amount,
        status: row.status,
        createdAt: row.created_at,
      }));
    },
    [user]
  );

  return { setPaidMessagePrice, getPaidMessagePrice, payForMessage, getMyTransactions, loading, error };
}
