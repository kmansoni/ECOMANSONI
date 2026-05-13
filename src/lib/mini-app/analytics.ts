/**
 * Mini App — Analytics Bridge
 *
 * Обёртка над существующей аналитикой (Yandex, GA4, Firehose)
 * + Telegram-специфичные метрики Mini App.
 *
 * Не более 150 строк.
 */

import {
  trackEvent as trackCoreEvent,
  trackPageView as trackCorePageView,
} from '@/lib/analytics';
import {
  trackMiniAppEvent,
  trackMiniAppPageView,
  trackAppOpen,
  trackAppClose,
  trackExpand,
  trackQRScan,
  trackContactRequest,
  trackEmojiStatus,
  trackStarsPaymentInitiated,
  trackStarsPaymentCompleted,
  startSessionTracking as tgStartSession,
  endSessionTracking as tgEndSession,
} from '@/lib/telegram/analytics';

export {
  // Core analytics
  trackCoreEvent as trackEvent,
  trackCorePageView as trackPageView,

  // Mini App analytics
  trackMiniAppEvent,
  trackMiniAppPageView,
  trackAppOpen,
  trackAppClose,
  trackExpand,
  trackQRScan,
  trackContactRequest,
  trackEmojiStatus,
  trackStarsPaymentInitiated,
  trackStarsPaymentCompleted,
  tgStartSession as startSessionTracking,
  tgEndSession as endSessionTracking,
};