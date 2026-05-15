/**
 * Mini App — Payments Bridge
 *
 * Обёртка над Stars v2 — независимая от Telegram платёжная система.
 * Ранее делегировал в telegram/payments, теперь использует собственный протокол.
 *
 * Не более 150 строк.
 */

import { StarsV2 } from '@/lib/stars/v2/payments';

export interface Invoice {
  id: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded' | 'processing' | 'failed';
  createdAt: string;
  paidAt?: string;
}

export interface CreateInvoiceParams {
  title: string;
  description: string;
  amount: number;
  currency?: string;
  provider?: 'stripe' | 'yookassa' | 'internal';
  metadata?: Record<string, string>;
}

/**
 * Создать инвойс через Supabase Edge Function.
 */
export async function createInvoice(params: CreateInvoiceParams) {
  return StarsV2.createInvoice({
    botId: '',
    chatId: '',
    title: params.title,
    description: params.description,
    amount: params.amount,
    currency: params.currency as any,
  });
}

/**
 * Оплатить инвойс.
 */
export async function payInvoice(invoiceId: string) {
  return StarsV2.payInvoice(invoiceId);
}

/**
 * Получить список инвойсов.
 */
export async function listInvoices(botId?: string, limit = 20, offset = 0) {
  return StarsV2.listInvoices({ botId, limit, offset });
}

/**
 * Получить баланс Stars (XTR).
 */
export async function getStarsBalance() {
  return StarsV2.getBalance();
}

export { StarsV2 as Stars };