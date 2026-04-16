import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { dbLoose } from "@/lib/supabase";

// ── Types ──────────────────────────────────────────────────────────────────

export type InvoiceCurrency = "XTR" | "USD" | "EUR" | "RUB";
export type InvoiceStatus = "pending" | "paid" | "cancelled" | "refunded";

export interface PaymentInvoice {
  id: string;
  bot_id: string;
  chat_id: string;
  user_id: string;
  title: string;
  description: string;
  currency: InvoiceCurrency;
  amount: number;
  payload: string | null;
  photo_url: string | null;
  status: InvoiceStatus;
  paid_at: string | null;
  refunded_at: string | null;
  provider_payment_charge_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayResult {
  ok: boolean;
  paid_at?: string;
  /** Stripe client_secret для внешней оплаты */
  client_secret?: string;
  /** YooKassa confirmation token */
  confirmation_token?: string;
  provider?: "stripe" | "yookassa";
  error?: string;
}

// ── Hook ───────────────────────────────────────────────────────────────────

interface UseBotPaymentsReturn {
  /** Активный инвойс для отображения в PaymentSheet */
  pendingInvoice: PaymentInvoice | null;
  /** Показать PaymentSheet для конкретного инвойса */
  showPaymentSheet: (invoice: PaymentInvoice) => void;
  /** Закрыть PaymentSheet */
  hidePaymentSheet: () => void;
  /** Оплатить инвойс (для покупателя) */
  pay: (invoiceId: string) => Promise<PayResult>;
  /** Инвойсы текущего пользователя как покупателя */
  myInvoices: PaymentInvoice[];
  /** Инвойсы бота (для владельца бота) */
  botInvoices: PaymentInvoice[];
  // Load bot invoices (as bot owner)
  loadBotInvoices: (botId: string) => Promise<void>;
  // Refund payment
  refund: (invoiceId: string, reason?: string, amount?: number) => Promise<{ ok: boolean; error?: string }>;
  isLoading: boolean;
  error: string | null;
}

export function useBotPayments(): UseBotPaymentsReturn {
  const { user } = useAuth();
  const [pendingInvoice, setPendingInvoice] = useState<PaymentInvoice | null>(null);
  const [myInvoices, setMyInvoices] = useState<PaymentInvoice[]>([]);
  const [botInvoices, setBotInvoices] = useState<PaymentInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Загрузить инвойсы покупателя при инициализации
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
       
      const { data, error: qErr } = await dbLoose
        .from("payment_invoices")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (cancelled) return;
      if (qErr) {
        setError(qErr.message);
        return;
      }
      setMyInvoices((data ?? []) as PaymentInvoice[]);
    };
    load();
    return () => { cancelled = true; };
  }, [user]);

  const showPaymentSheet = useCallback((invoice: PaymentInvoice) => {
    setPendingInvoice(invoice);
  }, []);

  const hidePaymentSheet = useCallback(() => {
    setPendingInvoice(null);
  }, []);

  const pay = useCallback(async (invoiceId: string): Promise<PayResult> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { ok: false, error: "not_authenticated" };

      const resp = await supabase.functions.invoke("bot-payments/pay", {
        body: { invoice_id: invoiceId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (resp.error) {
        const msg = resp.error.message ?? "payment_failed";
        setError(msg);
        return { ok: false, error: msg };
      }

      const result = resp.data as PayResult;
      if (result.ok) {
        // Обновить локальный список инвойсов
        setMyInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId
              ? { ...inv, status: "paid", paid_at: result.paid_at ?? new Date().toISOString() }
              : inv
          )
        );
        setBotInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId
              ? { ...inv, status: "paid", paid_at: result.paid_at ?? new Date().toISOString() }
              : inv
          )
        );
        setPendingInvoice((prev) =>
          prev?.id === invoiceId
            ? { ...prev, status: "paid", paid_at: result.paid_at ?? new Date().toISOString() }
            : prev
        );
      } else {
        setError(result.error ?? "payment_failed");
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown_error";
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadBotInvoices = useCallback(async (botId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const resp = await supabase.functions.invoke(`bot-payments/invoices?bot_id=${botId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (resp.error) {
        setError(resp.error.message);
        return;
      }
      setBotInvoices((resp.data?.invoices ?? []) as PaymentInvoice[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown_error");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refund = useCallback(
    async (invoiceId: string, reason?: string, amount?: number): Promise<{ ok: boolean; error?: string }> => {
      setIsLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return { ok: false, error: "not_authenticated" };

        const resp = await supabase.functions.invoke("bot-payments/refund", {
          body: { invoice_id: invoiceId, reason, amount },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (resp.error) {
          const msg = resp.error.message ?? "refund_failed";
          setError(msg);
          return { ok: false, error: msg };
        }
        if (resp.data?.ok) {
          // Обновить статус локально
          const updateStatus = (list: PaymentInvoice[]) =>
            list.map((inv) =>
              inv.id === invoiceId
                ? { ...inv, status: "refunded" as InvoiceStatus, refunded_at: new Date().toISOString() }
                : inv
            );
          setMyInvoices(updateStatus);
          setBotInvoices(updateStatus);
        }
        return resp.data as { ok: boolean; error?: string };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "unknown_error";
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    pendingInvoice,
    showPaymentSheet,
    hidePaymentSheet,
    pay,
    myInvoices,
    botInvoices,
    loadBotInvoices,
    refund,
    isLoading,
    error,
  };
}
