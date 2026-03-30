/**
 * Google Analytics 4 — типизированная обёртка.
 *
 * Скрипт загружается программно (асинхронно) только если задан VITE_GA_MEASUREMENT_ID.
 * Все методы — no-op при отсутствии ID или ошибке загрузки.
 * Нет зависимостей; нет `any` в публичном API.
 */

import { logger } from "../logger";

// ---------------------------------------------------------------------------
// Window-level типы (gtag injected globals)
// ---------------------------------------------------------------------------

type GtagConsentArg = "consent";
type GtagConfigArg = "config";
type GtagEventArg = "event";
type GtagSetArg = "set";
type GtagGetArg = "get";
type GtagJsArg = "js";

type GtagEventParams = {
  // Страница
  page_title?: string;
  page_location?: string;
  page_path?: string;
  // Пользователь
  user_id?: string;
  // Конверсия
  value?: number;
  currency?: string;
  // Произвольные параметры
  [key: string]: string | number | boolean | null | undefined;
};

type GtagConfigParams = {
  send_page_view?: boolean;
  debug_mode?: boolean;
  user_id?: string;
  [key: string]: string | number | boolean | null | undefined;
};

type GtagUserProperties = Record<string, string | number | boolean | null | undefined>;

// Минимальная типизация gtag-функции
type GtagFunction = {
  (cmd: GtagJsArg, date: Date): void;
  (cmd: GtagConfigArg, targetId: string, params?: GtagConfigParams): void;
  (cmd: GtagEventArg, eventName: string, params?: GtagEventParams): void;
  (cmd: GtagSetArg, params: GtagUserProperties): void;
  (cmd: GtagGetArg, targetId: string, field: string, callback: (value: string) => void): void;
  (cmd: GtagConsentArg, mode: "update" | "default", params: Record<string, string>): void;
};

declare global {
  interface Window {
    gtag?: GtagFunction;
    dataLayer?: unknown[];
  }
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const measurementId: string | null = (() => {
  const raw = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
    ?.VITE_GA_MEASUREMENT_ID;
  if (!raw || !raw.trim()) return null;
  // G-XXXXXXXXXX
  return /^G-[A-Z0-9]+$/i.test(raw.trim()) ? raw.trim() : null;
})();

let scriptLoaded = false;
let scriptFailed = false;

// ---------------------------------------------------------------------------
// Script loader
// ---------------------------------------------------------------------------

function loadScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("GA4: document not available (SSR?)"));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-ga="true"]'
    );
    if (existing) {
      resolve();
      return;
    }

    // dataLayer необходимо инициализировать ДО загрузки скрипта
    window.dataLayer ??= [];

    // Стандартная реализация gtag через dataLayer.push
    window.gtag = function (...args: Parameters<GtagFunction>) {
      (window.dataLayer as unknown[]).push(args);
    } as GtagFunction;

    window.gtag("js", new Date());

    const script = document.createElement("script");
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId!}`;
    script.async = true;
    script.dataset["ga"] = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("GA4: failed to load gtag/js"));

    const head = document.head ?? document.documentElement;
    head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Инициализирует GA4: загружает скрипт и вызывает `gtag('config', id)`.
 * Идемпотентен — повторные вызовы игнорируются.
 * No-op если `VITE_GA_MEASUREMENT_ID` не задан или невалиден.
 */
export async function initGoogleAnalytics(
  configParams: GtagConfigParams = {}
): Promise<void> {
  if (measurementId === null) return;
  if (scriptLoaded || scriptFailed) return;

  try {
    await loadScript();
    scriptLoaded = true;

    window.gtag?.("config", measurementId, {
      send_page_view: false, // SPA: page_view отправляем вручную через gaPageView()
      ...configParams,
    });
  } catch (err) {
    scriptFailed = true;
    if (import.meta.env?.DEV) {
      logger.warn("[GA4] init failed", { error: err });
    }
  }
}

/**
 * Отправляет виртуальный page_view — используется для SPA-роутинга.
 */
export function gaPageView(params: {
  page_title?: string;
  page_location?: string;
  page_path?: string;
}): void {
  if (measurementId === null || scriptFailed) return;
  try {
    window.gtag?.("event", "page_view", {
      ...params,
      page_location: params.page_location ?? (typeof location !== "undefined" ? location.href : undefined),
    });
  } catch {
    // no-op
  }
}

/**
 * Отправляет произвольное событие GA4.
 */
export function gaEvent(eventName: string, params?: GtagEventParams): void {
  if (measurementId === null || scriptFailed) return;
  try {
    window.gtag?.("event", eventName, params);
  } catch {
    // no-op
  }
}

/**
 * Устанавливает идентификатор пользователя в GA4.
 */
export function gaSetUserId(userId: string): void {
  if (measurementId === null || scriptFailed) return;
  try {
    window.gtag?.("config", measurementId, { user_id: userId });
  } catch {
    // no-op
  }
}

/**
 * Устанавливает пользовательские свойства (user properties) в GA4.
 */
export function gaSetUserProperties(properties: GtagUserProperties): void {
  if (measurementId === null || scriptFailed) return;
  try {
    window.gtag?.("set", properties);
  } catch {
    // no-op
  }
}
