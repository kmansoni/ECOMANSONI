/**
 * Mini App — Payments Bridge
 *
 * Обёртка над Telegram Stars (XTR) и Stripe-подобными платёжками.
 * Делегирует в @/lib/telegram/payments.ts (Supabase Edge Functions).
 *
 * Не более 150 строк.
 */

import { Stars as TgStars } from '@/lib/telegram/payments';
import type { CreateInvoiceParams as TgCreateInvoiceParams } from '@/lib/telegram/payments';

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
  // Map our params to Telegram's expected shape
  const tgParams: TgCreateInvoiceParams = {
    botId: '',
    chatId: '',
    title: params.title,
    description: params.description,
    amount: params.amount,
    currency: params.currency as any,
    // payload and photoUrl omitted (optional)
  };
  return TgStars.createInvoice(tgParams);
}

/**
 * Оплатить инвойс.
 */
export async function payInvoice(invoiceId: string) {
  return TgStars.payInvoice(invoiceId);
}

/**
 * Получить список инвойсов.
 */
export async function listInvoices(botId?: string, limit = 20, offset = 0) {
  return TgStars.listInvoices(botId, limit, offset);
}

/**
 * Получить баланс Stars (XTR).
 */
export async function getStarsBalance() {
  return TgStars.getStarsBalance();
}

export { TgStars as Stars };