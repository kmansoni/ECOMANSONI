/**
 * Centralized Error Tracking — production-ready Sentry integration.
 *
 * Graceful degradation: when VITE_SENTRY_DSN is empty every exported
 * function is a no-op so the application never crashes due to missing config.
 *
 * Public API (backward-compatible):
 *   initErrorTracking()
 *   captureException(error, context?)
 *   captureMessage(message, level?, context?)
 *   setUser(user | null)
 *   addBreadcrumb(category, message, data?)
 */

import * as Sentry from '@sentry/react';
import type { SeverityLevel } from '@sentry/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface ErrorContext {
  user?: { id: string; email?: string };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const dsn: string = import.meta.env.VITE_SENTRY_DSN ?? '';
const isDev: boolean = import.meta.env.DEV === true;
let _initialized = false;

/** True only when DSN is provided and Sentry.init() succeeded. */
function isSentryActive(): boolean {
  return _initialized && dsn.length > 0;
}

// ---------------------------------------------------------------------------
// Noise-filter: suppress well-known false-positive errors
// ---------------------------------------------------------------------------

const NOISE_PATTERNS: ReadonlyArray<RegExp> = [
  // ResizeObserver notification spam (browser bug, not actionable)
  /ResizeObserver loop/i,
  // Browser extensions injecting errors
  /Non-Error promise rejection captured with keys: currentTarget/i,
  // Chrome extension errors
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
  // Cancelled network requests
  /Failed to fetch/i,
  /NetworkError when attempting to fetch resource/i,
  /Load failed/i,
  // Benign page unload errors
  /AbortError/i,
];

function isNoise(event: Sentry.ErrorEvent): boolean {
  const msg =
    event.exception?.values?.[0]?.value ??
    event.message ??
    '';
  return NOISE_PATTERNS.some((re) => re.test(msg));
}

// ---------------------------------------------------------------------------
// Exported: initErrorTracking
// ---------------------------------------------------------------------------

/**
 * Call once at application startup (App.tsx already invokes this).
 * No-op when VITE_SENTRY_DSN is not set.
 */
export function initErrorTracking(): void {
  if (!dsn) {
    if (isDev) {
      console.info('[Sentry] DSN not configured — running in no-op mode');
    }
    return;
  }

  if (_initialized) return;

  const environment: string =
    (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) ??
    (isDev ? 'development' : 'production');

  const release: string | undefined =
    (import.meta.env.VITE_SENTRY_RELEASE as string | undefined) || undefined;

  Sentry.init({
    dsn,
    environment,
    release,

    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // Mask all text and block all media by default — privacy-first
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Performance: sparse sampling in production, full in development
    tracesSampleRate: isDev ? 1.0 : 0.1,

    // Session Replay: low volume in production
    replaysSessionSampleRate: isDev ? 1.0 : 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Drop known-noisy events before they hit the network
    beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
      if (isNoise(event)) return null;
      return event;
    },

    // Suppress Sentry's own console output in production
    debug: isDev,
  });

  _initialized = true;

  // Register global unhandled-error listeners so window errors route through
  // Sentry rather than the manual handlers below.
  // (Sentry.init already does this internally, so we remove the manual ones.)
}

// ---------------------------------------------------------------------------
// Exported: captureException
// ---------------------------------------------------------------------------

/**
 * Report an exception.  Falls back to console.error in dev / no-op mode.
 */
export function captureException(
  error: Error | unknown,
  context: ErrorContext = {},
): void {
  if (isSentryActive()) {
    Sentry.withScope((scope) => {
      if (context.tags) {
        Object.entries(context.tags!).forEach(([k, v]) => scope.setTag(k, v));
      }
      if (context.extra) {
        scope.setExtras(context.extra as Record<string, unknown>);
      }
      if (context.user) {
        scope.setUser(context.user);
      }
      Sentry.captureException(error);
    });
    return;
  }

  if (isDev) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[captureException]', err, context);
  }
}

// ---------------------------------------------------------------------------
// Exported: captureMessage
// ---------------------------------------------------------------------------

/**
 * Send an arbitrary message at the given severity level.
 */
export function captureMessage(
  message: string,
  level: LogLevel = 'info',
  context: ErrorContext = {},
): void {
  if (isSentryActive()) {
    Sentry.withScope((scope) => {
      if (context.tags) {
        Object.entries(context.tags!).forEach(([k, v]) => scope.setTag(k, v));
      }
      if (context.extra) {
        scope.setExtras(context.extra as Record<string, unknown>);
      }
      Sentry.captureMessage(message, level as SeverityLevel);
    });
    return;
  }

  if (isDev) {
    console.info(`[captureMessage][${level}]`, message, context);
  }
}

// ---------------------------------------------------------------------------
// Exported: setUser
// ---------------------------------------------------------------------------

/**
 * Attach user identity to all subsequent Sentry events.
 * Pass null to clear the user context (e.g. on logout).
 */
export function setUser(user: { id: string; email?: string } | null): void {
  if (isSentryActive()) {
    Sentry.setUser(user);
    return;
  }

  if (isDev) {
    console.debug('[setUser]', user?.id ?? '(cleared)');
  }
}

// ---------------------------------------------------------------------------
// Exported: addBreadcrumb
// ---------------------------------------------------------------------------

/**
 * Record a navigation/action breadcrumb (backwards-compatible signature).
 *
 * @param category  Dot-separated category string, e.g. "ui.click"
 * @param message   Human-readable description
 * @param data      Optional key/value payload
 */
export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  if (isSentryActive()) {
    Sentry.addBreadcrumb({ category, message, data, level: 'info' });
    return;
  }

  if (isDev) {
    console.debug(`[addBreadcrumb][${category}]`, message, data);
  }
}

// ---------------------------------------------------------------------------
// Global unhandled-error safety net
// (Only active when Sentry is NOT initialised; otherwise Sentry owns these.)
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event: ErrorEvent) => {
    if (!isSentryActive()) {
      captureException(event.error ?? new Error(event.message), {
        tags: { type: 'uncaught' },
        extra: { filename: event.filename, lineno: event.lineno },
      });
    }
  });

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (!isSentryActive()) {
      captureException(event.reason, {
        tags: { type: 'unhandled_promise' },
      });
    }
  });
}
