/**
 * Mannoni Stars v2 — Платёжная система ботов
 *
 * Полностью независимая от Telegram Stars реализация.
 * Использует собственный протокол через Supabase Edge Functions.
 *
 * Интеграция:
 *   import { StarsV2 } from '@/lib/stars/v2/payments';
 *   const invoice = await StarsV2.createInvoice({ botId, chatId, title, amount });
 *   const result = await StarsV2.payInvoice(invoice.id);
 */

import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

export type StarsCurrency = 'XTR' | 'USD' | 'EUR' | 'RUB';

export interface StarsInvoice {
  id: string;
  bot_id: string;
  chat_id: string;
  user_id: string;
  title: string;
  description: string;
  amount: number;
  currency: StarsCurrency;
  status: 'pending' | 'processing' | 'paid' | 'cancelled' | 'refunded' | 'failed';
  paid_at?: string;
  refunded_at?: string;
  provider_payment_charge_id?: string;
  idempotency_key?: string;
  created_at: string;
  updated_at: string;
}

export interface StarsBalance {
  user_id: string;
  balance: number;
}

export interface CreateInvoiceParams {
  botId: string;
  chatId: string;
  title: string;
  description: string;
  amount: number;
  currency?: StarsCurrency;
  payload?: string;
  photoUrl?: string;
  idempotencyKey?: string;
}

export interface PayInvoiceParams {
  invoiceId: string;
}

export interface RefundParams {
  invoiceId: string;
  amount?: number;
  reason?: string;
}

// ── API Client ─────────────────────────────────────────────────────────────

const BOT_PAYMENTS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-payments`
  : '/api/bot-payments';

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`,
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

// ── Invoice Operations ─────────────────────────────────────────────────────

/**
 * Создать платёжный инвойс для бота.
 * Использует x-bot-token header для аутентификации бота.
 */
export async function createInvoice(params: CreateInvoiceParams): Promise<StarsInvoice> {
  const headers = await getAuthHeaders();
  if (params.idempotencyKey) {
    headers['x-idempotency-key'] = params.idempotencyKey;
  }

  const response = await fetch(`${BOT_PAYMENTS_URL}/create-invoice`, {
    method: 'POST',
    headers: {
      ...headers,
      'x-bot-token': params.botId,
    },
    body: JSON.stringify({
      bot_id: params.botId,
      chat_id: params.chatId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      title: params.title,
      description: params.description,
      amount: params.amount,
      currency: params.currency || 'XTR',
      payload: params.payload,
      photo_url: params.photoUrl,
      idempotency_key: params.idempotencyKey,
    }),
  });

  return handleResponse<{ invoice: StarsInvoice }>(response).then(r => r.invoice);
}

/**
 * Оплатить инвойс.
 * Для XTR — атомарная оплата через PostgreSQL RPC.
 * Для внешних провайдеров — Stripe / YooKassa.
 */
export async function payInvoice(params: PayInvoiceParams): Promise<{
  ok: boolean;
  paid_at?: string;
  client_secret?: string;
  provider?: string;
  error?: string;
}> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${BOT_PAYMENTS_URL}/pay`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ invoice_id: params.invoiceId }),
  });

  return handleResponse(response);
}

/**
 * Возврат средств.
 * Только для XTR-инвойсов.
 */
export async function refundInvoice(params: RefundParams): Promise<{ ok: boolean }> {
  const headers = await getAuthHeaders();
  const response = await fetch(`${BOT_PAYMENTS_URL}/refund`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      invoice_id: params.invoiceId,
      amount: params.amount,
      reason: params.reason,
    }),
  });

  return handleResponse<{ ok: boolean }>(response);
}

/**
 * Получить список инвойсов.
 */
export async function listInvoices(
  params?: {
    botId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ invoices: StarsInvoice[]; total: number; limit: number; offset: number }> {
  const headers = await getAuthHeaders();
  const urlParams = new URLSearchParams();
  if (params?.botId) urlParams.set('bot_id', params.botId);
  if (params?.limit) urlParams.set('limit', String(params.limit));
  if (params?.offset) urlParams.set('offset', String(params.offset));

  const response = await fetch(`${BOT_PAYMENTS_URL}/invoices?${urlParams.toString()}`, {
    headers,
  });

  return handleResponse(response);
}

/**
 * Получить баланс Stars пользователя.
 * Считает сумму всех PAID XTR-инвойсов минус REFUNDED.
 * Для продакшена рекомендуется кешировать на клиенте с периодическим обновлением.
 */
export async function getBalance(): Promise<number> {
  try {
    const { invoices, total } = await listInvoices({ limit: 200, offset: 0 });
    let balance = 0;

    for (const inv of invoices) {
      if (inv.currency === 'XTR') {
        if (inv.status === 'paid') balance += inv.amount;
        if (inv.status === 'refunded') balance -= inv.amount;
      }
    }

    // Если есть ещё страницы — предупреждаем (для полной точности нужна пагинация)
    if (total > 200) {
      console.warn('[StarsV2] Balance may be incomplete — more than 200 invoices exist');
    }

    return Math.max(0, balance);
  } catch (error) {
    console.error('[StarsV2] Failed to get balance:', error);
    return 0;
  }
}

// ── Convenience Module ─────────────────────────────────────────────────────

export const StarsV2 = {
  createInvoice,
  payInvoice,
  refundInvoice,
  listInvoices,
  getBalance,
};

export type { StarsInvoice, CreateInvoiceParams, PayInvoiceParams, RefundParams, StarsCurrency };