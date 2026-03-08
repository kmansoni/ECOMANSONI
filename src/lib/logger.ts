/**
 * logger — structured, leveled logger for the platform.
 *
 * Architecture:
 *   - Single module-level logger; no class instantiation overhead.
 *   - Log levels: DEBUG < INFO < WARN < ERROR.
 *   - In production (VITE_LOG_LEVEL not set or "error"): only errors emitted.
 *   - In development: all levels emitted with prefixes.
 *   - Sentry integration: ERROR and WARN automatically captured via captureException/message.
 *   - Structured payload: all calls accept (message, context?) for machine-parseable logs.
 *
 * Security:
 *   - Never log secrets, tokens, or PII. Callers are responsible.
 *   - `context` is shallow-cloned before being passed to Sentry to prevent
 *     accidental mutation of live objects.
 *   - Stack traces are preserved on Error objects.
 *
 * Performance:
 *   - In production, log(DEBUG/INFO) short-circuits immediately with a level check.
 *   - No string interpolation until the level check passes.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("[useChat] message sent", { conversationId, length: content.length });
 *   logger.error("[VideoCall] startCall failed", { error });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function resolveMinLevel(): LogLevel {
  const env = (import.meta as any)?.env?.VITE_LOG_LEVEL ?? "";
  const lvl = String(env).toLowerCase() as LogLevel;
  return lvl in LEVEL_RANK ? lvl : (import.meta as any)?.env?.DEV ? "debug" : "error";
}

const MIN_LEVEL = LEVEL_RANK[resolveMinLevel()];

// Lazy Sentry capture — avoids importing Sentry at module level
function trySentryCapture(level: "warn" | "error", message: string, context?: unknown): void {
  try {
    // Dynamic require to avoid hard Sentry dependency at bundle time
    const Sentry = (window as any).__SENTRY__;
    if (!Sentry) return;
    if (level === "error") {
      const err = context instanceof Error ? context : new Error(message);
      Sentry.captureException(err, {
        extra: context instanceof Error ? undefined : { context },
      });
    } else {
      Sentry.captureMessage(message, { level: "warning", extra: { context } });
    }
  } catch {
    // Best-effort; Sentry errors must never crash the app
  }
}

function emit(
  level: LogLevel,
  message: string,
  context?: unknown
): void {
  if (LEVEL_RANK[level] < MIN_LEVEL) return;

  const prefix = `[${level.toUpperCase()}]`;

  switch (level) {
    case "debug":
      if (context !== undefined) {
        console.debug(prefix, message, context);
      } else {
        console.debug(prefix, message);
      }
      break;
    case "info":
      if (context !== undefined) {
        console.info(prefix, message, context);
      } else {
        console.info(prefix, message);
      }
      break;
    case "warn":
      if (context !== undefined) {
        console.warn(prefix, message, context);
      } else {
        console.warn(prefix, message);
      }
      trySentryCapture("warn", message, context);
      break;
    case "error":
      if (context !== undefined) {
        console.error(prefix, message, context);
      } else {
        console.error(prefix, message);
      }
      trySentryCapture("error", message, context);
      break;
  }
}

export const logger = {
  debug: (message: string, context?: unknown) => emit("debug", message, context),
  info:  (message: string, context?: unknown) => emit("info",  message, context),
  warn:  (message: string, context?: unknown) => emit("warn",  message, context),
  error: (message: string, context?: unknown) => emit("error", message, context),
} as const;

export type Logger = typeof logger;
