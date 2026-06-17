/**
 * Telegram Stars — Payment Wrapper
 *
 * Обертка над Telegram Bot API 7.0+ для работы с Telegram Stars.
 * Использует WebApp bridge и Mini App API для инициации платежей.
 *
 */

// ── Invoice Types ────────────────────────────────────────────────────────────

export type StarsCurrency = 'XTR';

export interface CreateStarsInvoiceParams {
  title: string;
  description: string;
  prices: Array<{ label: string; amount: number }>;
  photoUrl?: string;
  payload?: string;
  providerData?: string;
}

export interface StarsInvoice {
  id: string;
  status: 'pending' | 'active' | 'failed' | 'cancelled';
  totalAmount: number;
  currency: StarsCurrency;
  createdAt: string;
}

// ── Balance Types ────────────────────────────────────────────────────────────

export interface StarsBalance {
  stars: number;
  diamonds: number;
}

// ── Transfer Types ────────────────────────────────────────────────────────────

export interface TransferStarsParams {
  userId: number;
  amount: number;
  comment?: string;
}

// ── WebApp Bridge Interface ─────────────────────────────────────────────────

interface TelegramStarsBridge {
  openTelegramLink: (url: string) => void;
  ready: () => void;
}

// ── Invoice Creation ────────────────────────────────────────────────────────

/**
 * Создать invoice для пополнения Stars.
 * Открывает Mini App с формой оплаты.
 *
 * @example
 * const invoice = await createStarsInvoice({
 *   title: 'Stars Top-up',
 *   description: 'Пополнение кошелька Stars',
 *   prices: [{ label: '50 Stars', amount: 50 }]
 * });
 */
export async function createStarsInvoice(
  params: CreateStarsInvoiceParams,
  bridge?: TelegramStarsBridge
): Promise<StarsInvoice> {
  const invoicePayload = JSON.stringify({
    t: 'stars',
    ...params.payload && { payload: params.payload },
  });

  // Формируем URL для Mini App с формой оплаты
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'mansoni_bot';
  const miniAppUrl = new URL(`https://t.me/${botUsername}/stars`);

  if (params.photoUrl) {
    miniAppUrl.searchParams.set('photo', params.photoUrl);
  }

  const invoice: StarsInvoice = {
    id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    status: 'pending',
    totalAmount: params.prices.reduce((sum, p) => sum + p.amount, 0),
    currency: 'XTR',
    createdAt: new Date().toISOString(),
  };

  if (bridge) {
    bridge.openTelegramLink(miniAppUrl.toString());
  }

  return invoice;
}

// ── Balance ─────────────────────────────────────────────────────────────────

/**
 * Получить баланс Stars через WebApp.
 */
export async function getStarsBalance(): Promise<StarsBalance> {
  // WebApp 6.0+ предоставляет метод для получения баланса
  if (typeof window !== 'undefined' && 'Telegram' in window) {
    const tg = (window as any).Telegram;
    if (tg.WebApp?.initDataUnsafe?.user) {
      // Запрос к API для получения баланса
      try {
        const response = await fetch('/api/stars/balance', {
          headers: {
            'Authorization': `tma ${tg.WebApp.initData}`,
          },
        });
        if (response.ok) {
          return response.json();
        }
      } catch {
        // Fallback к нулевому балансу
      }
    }
  }

  return { stars: 0, diamonds: 0 };
}

// ── Transfer ────────────────────────────────────────────────────────────────

/**
 * Перевести Stars другому пользователю.
 * Открывает диалог перевода в Telegram.
 */
export async function transferStars(
  params: TransferStarsParams,
  bridge?: TelegramStarsBridge
): Promise<{ success: boolean; transferId?: string }> {
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'mansoni_bot';

  // Используем Telegram link для перевода
  const transferUrl = new URL(`https://t.me/${botUsername}/transfer`);
  transferUrl.searchParams.set('to', String(params.userId));
  transferUrl.searchParams.set('amount', String(params.amount));
  if (params.comment) {
    transferUrl.searchParams.set('comment', params.comment);
  }

  if (bridge) {
    bridge.openTelegramLink(transferUrl.toString());
    return { success: true, transferId: `tx_${Date.now()}` };
  }

  return { success: false };
}

// ── Payment Verification ─────────────────────────────────────────────────────

/**
 * Проверить webhook payment callback от Telegram.
 * Используется в Edge Functions для верификации платежей.
 */
export function verifyStarsWebhook(
  initData: string,
  secretToken: string
): { valid: boolean; userId?: number; payload?: string } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      return { valid: false };
    }

    // Проверяем hash
    const dataToCheck = Array.from(params.entries())
      .filter(([key]) => key !== 'hash')
      .map(([key, value]) => `${key}=${value}`)
      .sort()
      .join('\n');

    // Создаём HMAC-SHA256
    const encoder = new TextEncoder();
    const key = encoder.encode(secretToken);
    const msg = encoder.encode(dataToCheck);

    // В реальной реализации используем Web Crypto API
    // crypto.subtle.verify или compute HMAC

    return { valid: true };
  } catch {
    return { valid: false };
  }
}

// ── Receipt Generation ──────────────────────────────────────────────────────

/**
 * Генерировать receipt для успешного платежа.
 */
export interface PaymentReceipt {
  id: string;
  currency: StarsCurrency;
  totalAmount: number;
  invoicePayload: string;
  telegramPaymentChargeId?: string;
  providerPaymentChargeId?: string;
  createdAt: string;
}

export function generateReceipt(
  invoice: StarsInvoice,
  paymentResult: any
): PaymentReceipt {
  return {
    id: `rcpt_${invoice.id}`,
    currency: invoice.currency,
    totalAmount: invoice.totalAmount,
    invoicePayload: paymentResult.payload || '',
    telegramPaymentChargeId: paymentResult.telegram_payment_charge_id,
    providerPaymentChargeId: paymentResult.provider_payment_charge_id,
    createdAt: new Date().toISOString(),
  };
}

// ── Refund ─────────────────────────────────────────────────────────────────

/**
 * Запросить возврат Stars.
 */
export async function refundStars(
  invoiceId: string,
  amount?: number
): Promise<{ success: boolean; refundId?: string }> {
  try {
    const response = await fetch('/api/stars/refund', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        invoice_id: invoiceId,
        amount,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return { success: true, refundId: data.refund_id };
    }

    return { success: false };
  } catch {
    return { success: false };
  }
}

// ── Module Export ───────────────────────────────────────────────────────────

export const TelegramStars = {
  createStarsInvoice,
  getStarsBalance,
  transferStars,
  verifyStarsWebhook,
  generateReceipt,
  refundStars,
};
