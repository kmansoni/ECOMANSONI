/**
 * Telegram Mini App — аналитика и мониторинг
 *
 * Обёртка над существующей системой analytics + Telegram-специфичные метрики.
 * Не более 150 строк.
 */

import { trackEvent, trackPageView, initAnalytics } from '@/lib/analytics';

interface MiniAppMetric {
  event: string;
  props?: Record<string, string | number | boolean>;
}

// ── Инициализация ──────────────────────────────────────

/**
 * Инициализация аналитики (вызывать один раз при старте Mini App).
 * Делегирует существующему initAnalytics + отправляет стартовое событие.
 */
export async function initMiniAppAnalytics(): Promise<void> {
  await initAnalytics();

  trackEvent({
    name: 'mini_app_session_start',
    params: {
      platform: getPlatform(),
      version: getVersion(),
    },
  });
}

// ── Метрики Mini App ───────────────────────────────────

function getPlatform(): string {
  if (typeof window === 'undefined') return 'unknown';
  return (window as any).Telegram?.WebApp?.platform || 'web';
}

function getVersion(): string | undefined {
  return (window as any).Telegram?.WebApp?.version;
}

/**
 * Отслеживание просмотра экрана в Mini App.
 * Автоматически добавляет platform и is_expanded.
 */
export function trackMiniAppPageView(screen: string, params: Record<string, unknown> = {}): void {
  trackPageView({
    url: `/mini-app/${screen}`,
    title: screen,
  });

  trackEvent({
    name: 'screen_view',
    params: {
      screen_name: screen,
      platform: getPlatform(),
      telegram_version: getVersion(),
      ...params,
    },
  });
}

/**
 * Отслеживание действия пользователя в Mini App.
 */
export function trackMiniAppEvent(
  event: string,
  props?: Record<string, string | number | boolean>
): void {
  trackEvent({
    name: event,
    params: {
      platform: getPlatform(),
      ...props,
    },
  });
}

// ── Стандартные события Mini App ───────────────────────

/** Открытие Mini App */
export function trackAppOpen(payload?: string): void {
  trackMiniAppEvent('mini_app_open', { has_payload: !!payload });
}

/** Закрытие Mini App */
export function trackAppClose(): void {
  trackMiniAppEvent('mini_app_close');
}

/** Нажатие на Main Button */
export function trackMainButtonClick(): void {
  trackMiniAppEvent('main_button_click');
}

/** Нажатие на Settings Button */
export function trackSettingsClick(): void {
  trackMiniAppEvent('settings_click');
}

/** Нажатие на Back Button */
export function trackBackClick(): void {
  trackMiniAppEvent('back_button_click');
}

/** Открытие расширенного режима */
export function trackExpand(): void {
  trackMiniAppEvent('app_expand', { expanded: true });
}

/** QR код отсканирован */
export function trackQRScan(): void {
  trackMiniAppEvent('qr_scan');
}

/** Контакт запрошен */
export function trackContactRequest(): void {
  trackMiniAppEvent('contact_request');
}

/** Статус отправлен */
export function trackEmojiStatus(): void {
  trackMiniAppEvent('emoji_status_set');
}

/** Оплата Stars начата */
export function trackStarsPaymentInitiated(amount: number, currency: string): void {
  trackMiniAppEvent('stars_payment_initiated', { amount, currency });
}

/** Оплата Stars завершена */
export function trackStarsPaymentCompleted(amount: number, currency: string): void {
  trackMiniAppEvent('stars_payment_completed', { amount, currency });
}

// ── Сессия ─────────────────────────────────────────────

let sessionStartTs = 0;

export function startSessionTracking(): void {
  sessionStartTs = Date.now();
}

export function endSessionTracking(): void {
  const duration = Date.now() - sessionStartTs;
  trackMiniAppEvent('session_end', { duration_ms: duration });
}