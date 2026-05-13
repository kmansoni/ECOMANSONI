/**
 * Telegram Stars — клиент оплаты в Mini App
 *
 * Интеграция с Telegram Stars (XTR) через miniApp.ts + Supabase Edge Function.
 * Все операции — не более 250 строк.
 */

import type { Result } from './miniApp';
import { getSupabaseClient } from '@/integrations/supabase/client';

interface StarsInvoice {
  id: string;
  bot_id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'processing' | 'failed';
  created_at: string;
  paid_at?: string;
}

interface CreateInvoiceParams {
  botId: string;
  chatId: string;
  title: string;
  description: string;
  amount: number;
  currency?: 'XTR' | 'USD' | 'EUR' | 'RUB';
  payload?: string;
  photoUrl?: string;
}

// ── Supabase Payments API ──────────────────────────────

/**
 * Создать платёжный инвойс через Supabase Edge Function.
 * Отправляет POST /bot-payments/create-invoice
 */
async function createInvoice(params: CreateInvoiceParams): Promise<Result<StarsInvoice>> {
  try {
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'No session' };

    const resp = await fetch('/bot-payments/create-invoice', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'x-bot-token': params.botId, // bot идентифицируется отдельно
      },
      body: JSON.stringify({
        bot_id: params.botId,
        chat_id: params.chatId,
        user_id: session.user.id,
        title: params.title,
        description: params.description,
        amount: params.amount,
        currency: params.currency || 'XTR',
        payload: params.payload,
        photo_url: params.photoUrl,
      }),
    });

    const json = await resp.json();
    if (!resp.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${resp.status}` };
    }
    return { ok: true, result: json.invoice };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * Оплатить инвойс (XTR — через Telegram, внешние — через провайдера).
 * Отправляет POST /bot-payments/pay
 */
async function payInvoice(invoiceId: string): Promise<Result<{ client_secret?: string }>> {
  try {
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'No session' };

    const resp = await fetch('/bot-payments/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ invoice_id: invoiceId }),
    });

    const json = await resp.json();
    if (!resp.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${resp.status}` };
    }

    const result: { client_secret?: string } = {};
    if (json.client_secret) result.client_secret = json.client_secret;
    return { ok: true, result };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * Получить список инвойсов пользователя
 */
async function listInvoices(botId?: string, limit = 20, offset = 0): Promise<Result<{ invoices: StarsInvoice[]; total: number }>> {
  try {
    const supabase = getSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'No session' };

    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (botId) params.set('bot_id', botId);

    const resp = await fetch(`/bot-payments/invoices?${params}`, {
      headers: { 'Authorization': `Bearer ${session.access_token}` },
    });

    const json = await resp.json();
    if (!resp.ok || !json.ok) {
      return { ok: false, error: json.error || `HTTP ${resp.status}` };
    }
    return { ok: true, result: { invoices: json.invoices, total: json.total } };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

// ── Stars Balance (клиентская оценка) ──────────────────

/**
 * Получить баланс Stars пользователя.
 * Считает сумму всех PAID XTR-инвойсов минус REFUNDED.
 * Для продакшена — лучше через dedicated Edge Function / Supabase RPC.
 */
async function getStarsBalance(): Promise<Result<number>> {
  const result = await listInvoices(undefined, 200, 0);
  if (!result.ok) return result;

  const { invoices } = result.result;
  let balance = 0;
  for (const inv of invoices) {
    if (inv.currency === 'XTR') {
      if (inv.status === 'paid') balance += inv.amount;
      if (inv.status === 'refunded') balance -= inv.amount;
    }
  }
  return { ok: true, result: Math.max(0, balance) };
}

// ── UI Helpers ─────────────────────────────────────────

export const Stars = {
  createInvoice,
  payInvoice,
  listInvoices,
  getStarsBalance,
};

export type { StarsInvoice, CreateInvoiceParams };