/**
 * Initialize call context integration with logger.
 *
 * This module sets up the globalThis bridges used by logger.ts to
 * attach call metadata to all Sentry events.
 *
 * Import this once in main.tsx or App.tsx before any call-related code runs.
 */

import { getSentryExtra, getSentryTags } from "./callContext";

/**
 * Initialize call context for Sentry.
 *
 * Sets up globalThis.__CALL_CONTEXT__ bridge that logger.ts uses
 * to attach call metadata to Sentry captures.
 *
 * Also configures Sentry tags if Sentry is available.
 */
export function initCallContext(): void {
  // Register call context on globalThis for logger.ts to access
  (globalThis as unknown as { __CALL_CONTEXT__?: unknown }).__CALL_CONTEXT__ = {
    getSentryExtra,
  };

  // If Sentry is already initialized, set call tags
  const Sentry = (globalThis as unknown as { __SENTRY__?: { setTag(key: string, value: string): void } }).__SENTRY__;
  if (Sentry) {
    const tags = getSentryTags();
    for (const [key, value] of Object.entries(tags)) {
      try {
        Sentry.setTag(key, value);
      } catch {
        // Best-effort
      }
    }
  }
}

/**
 * Update Sentry tags when call context changes.
 * Call this whenever setCallContext() is called.
 */
export function updateCallContextTags(): void {
  const Sentry = (globalThis as unknown as { __SENTRY__?: { setTag(key: string, value: string): void } }).__SENTRY__;
  if (!Sentry) return;

  const tags = getSentryTags();
  for (const [key, value] of Object.entries(tags)) {
    try {
      Sentry.setTag(key, value);
    } catch {
      // Best-effort
    }
  }
}
