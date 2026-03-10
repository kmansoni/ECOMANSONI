/**
 * Unified analytics facade.
 *
 * Инициализирует Yandex.Metrika и GA4 одновременно (параллельно).
 * Предоставляет trackPageView() и trackEvent() — отправляют в оба счётчика.
 * Все методы — no-op если соответствующие ENV-переменные не заданы.
 */

export {
  initYandexMetrika,
  ymHit,
  ymReachGoal,
  ymParams,
  ymUserParams,
  ymSetUserID,
} from "./yandexMetrika";

export {
  initGoogleAnalytics,
  gaPageView,
  gaEvent,
  gaSetUserId,
  gaSetUserProperties,
} from "./googleAnalytics";

export type { AnalyticsEventType, AnalyticsObjectType, AnalyticsPlatform, AnalyticsEventV1, AnalyticsBatchV1 } from "./types";
export { trackAnalyticsEvent } from "./firehose";

import { initYandexMetrika } from "./yandexMetrika";
import { initGoogleAnalytics, gaPageView, gaEvent } from "./googleAnalytics";
import { ymHit, ymReachGoal } from "./yandexMetrika";

// ---------------------------------------------------------------------------
// Composite init
// ---------------------------------------------------------------------------

/**
 * Инициализирует все внешние счётчики аналитики параллельно.
 * Вызывай один раз при старте приложения.
 */
export async function initAnalytics(): Promise<void> {
  await Promise.allSettled([
    initYandexMetrika(),
    initGoogleAnalytics(),
  ]);
}

// ---------------------------------------------------------------------------
// Composite page view
// ---------------------------------------------------------------------------

export type PageViewParams = {
  /** Текущий URL (pathname + search). Если не передан — берётся из location.href */
  url?: string;
  title?: string;
  referrer?: string;
};

/**
 * Отправляет виртуальный page view в Yandex.Metrika и GA4.
 * Вызывать при каждой смене роута в SPA.
 */
export function trackPageView(params: PageViewParams = {}): void {
  const url =
    params.url ??
    (typeof location !== "undefined" ? location.href : "");

  ymHit(url, {
    title: params.title,
    referer: params.referrer,
  });

  gaPageView({
    page_location: url,
    page_title: params.title,
  });
}

// ---------------------------------------------------------------------------
// Composite event
// ---------------------------------------------------------------------------

export type TrackEventParams = {
  /** Название цели в YM и название события в GA4 */
  name: string;
  /** Произвольные параметры */
  params?: Record<string, string | number | boolean | null | undefined>;
};

/**
 * Отправляет событие в Yandex.Metrika (reachGoal) и GA4 (event).
 */
export function trackEvent(input: TrackEventParams): void {
  ymReachGoal(input.name, { params: input.params });
  gaEvent(input.name, input.params);
}
