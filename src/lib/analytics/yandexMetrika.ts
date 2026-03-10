/**
 * Yandex.Metrika — типизированная обёртка.
 *
 * Скрипт загружается программно (асинхронно) только если задан VITE_YM_COUNTER_ID.
 * Все методы — no-op при отсутствии ID или ошибке загрузки.
 * Нет зависимостей; нет `any` в публичном API.
 */

// ---------------------------------------------------------------------------
// Window-level типы (Yandex.Metrika injected globals)
// ---------------------------------------------------------------------------

type YMParams = Record<string, string | number | boolean | null | undefined>;

type YMOptions = {
  clickmap?: boolean;
  trackLinks?: boolean;
  accurateTrackBounce?: boolean;
  webvisor?: boolean;
  trackHash?: boolean;
  defer?: boolean;
  params?: YMParams;
  userParams?: YMParams;
};

type YMReachGoalOptions = {
  params?: YMParams;
  callback?: () => void;
  ctx?: object;
};

// Сигнатура функции-фасада window.ym, которую внедряет скрипт Метрики
type YMFunction = {
  (counterId: number, method: "init", options: YMOptions): void;
  (counterId: number, method: "hit", url: string, options?: { title?: string; referer?: string; params?: YMParams }): void;
  (counterId: number, method: "reachGoal", target: string, options?: YMReachGoalOptions): void;
  (counterId: number, method: "params", params: YMParams): void;
  (counterId: number, method: "userParams", params: YMParams): void;
  (counterId: number, method: "setUserID", userId: string): void;
  // Вызовы до загрузки скрипта буферизуются через массив
  (...args: [number, string, ...unknown[]]): void;
};

declare global {
  interface Window {
    ym?: YMFunction;
    // Буфер вызовов до загрузки скрипта (паттерн «cmd queue»)
    ymQueue?: Array<[number, string, ...unknown[]]>;
  }
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const counterId: number | null = (() => {
  const raw = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env
    ?.VITE_YM_COUNTER_ID;
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
})();

let scriptLoaded = false;
let scriptFailed = false;

// ---------------------------------------------------------------------------
// Script loader
// ---------------------------------------------------------------------------

function loadScript(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("YM: document not available (SSR?)"));
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-ym="true"]'
    );
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://mc.yandex.ru/metrika/tag.js";
    script.async = true;
    script.defer = true;
    script.dataset["ym"] = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("YM: failed to load tag.js"));

    const head = document.head ?? document.documentElement;
    head.appendChild(script);
  });
}

// ---------------------------------------------------------------------------
// Инициализация очереди (паттерн cmd queue — вызовы ДО загрузки тега)
// ---------------------------------------------------------------------------

function installQueue(): void {
  if (typeof window === "undefined") return;
  if (!window.ym) {
    window.ym = function (...args: [number, string, ...unknown[]]) {
      (window.ymQueue ??= []).push(args);
    } as YMFunction;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Инициализирует Yandex.Metrika: загружает скрипт и вызывает `ym(id, 'init', …)`.
 * Идемпотентен — повторные вызовы игнорируются.
 * No-op если `VITE_YM_COUNTER_ID` не задан.
 */
export async function initYandexMetrika(options: YMOptions = {}): Promise<void> {
  if (counterId === null) return;
  if (scriptLoaded || scriptFailed) return;

  installQueue();

  try {
    await loadScript();
    scriptLoaded = true;

    // После загрузки tag.js window.ym заменяется настоящим фасадом —
    // очередь ymQueue сбрасывается автоматически самим тегом.
    window.ym?.(counterId, "init", {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
      trackHash: true,
      ...options,
    });
  } catch (err) {
    scriptFailed = true;
    // Graceful degradation: не бросаем наружу, только логируем в dev
    if (import.meta.env?.DEV) {
      console.warn("[YM] init failed:", err);
    }
  }
}

/**
 * Отправляет виртуальный хит (page view) — используется для SPA-роутинга.
 */
export function ymHit(
  url: string,
  options?: { title?: string; referer?: string; params?: YMParams }
): void {
  if (counterId === null || scriptFailed) return;
  try {
    window.ym?.(counterId, "hit", url, options);
  } catch {
    // no-op
  }
}

/**
 * Отправляет достижение цели.
 */
export function ymReachGoal(target: string, options?: YMReachGoalOptions): void {
  if (counterId === null || scriptFailed) return;
  try {
    window.ym?.(counterId, "reachGoal", target, options);
  } catch {
    // no-op
  }
}

/**
 * Отправляет произвольные параметры визита.
 */
export function ymParams(params: YMParams): void {
  if (counterId === null || scriptFailed) return;
  try {
    window.ym?.(counterId, "params", params);
  } catch {
    // no-op
  }
}

/**
 * Отправляет параметры пользователя (user profile).
 */
export function ymUserParams(params: YMParams): void {
  if (counterId === null || scriptFailed) return;
  try {
    window.ym?.(counterId, "userParams", params);
  } catch {
    // no-op
  }
}

/**
 * Устанавливает идентификатор пользователя.
 *
 * @deprecated Метод отключён: передача userId третьей стороне (Yandex) является
 * утечкой PII. Функция оставлена как экспорт для обратной совместимости,
 * но вызов window.ym("setUserID") не выполняется.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ymSetUserID(_userId: string): void {
  // Intentional no-op: sending userId to a third-party analytics provider
  // constitutes PII leakage. Use internal analytics (firehose) for user-level tracking.
}
