import { logger } from "@/lib/logger";

export const LAST_RUNTIME_ERROR_KEY = "app:last-runtime-error";
export const CHUNK_RELOAD_ONCE_KEY = "app.chunk_reload_once";

export type RuntimeErrorSnapshot = {
  title: string;
  details: string | null;
};

export function serializeRuntimeError(error: unknown, fallbackTitle = "RuntimeError"): RuntimeErrorSnapshot {
  if (error instanceof Error) {
    return {
      title: error.name || fallbackTitle,
      details: error.stack || error.message || null,
    };
  }

  if (typeof error === "string") {
    return { title: fallbackTitle, details: error };
  }

  try {
    return {
      title: fallbackTitle,
      details: JSON.stringify(error),
    };
  } catch (serializationError) {
    logger.warn("[runtimeErrorDiagnostics] failed to JSON-serialize runtime error", { serializationError, fallbackTitle });
    return {
      title: fallbackTitle,
      details: String(error ?? "Unknown runtime error"),
    };
  }
}

export function persistLastRuntimeError(source: string, reason: unknown): void {
  const snapshot = serializeRuntimeError(reason, source);

  try {
    sessionStorage.setItem(LAST_RUNTIME_ERROR_KEY, JSON.stringify(snapshot));
  } catch (error) {
    logger.warn("[runtimeErrorDiagnostics] failed to persist runtime error snapshot", { source, error });
  }
}

export function clearLastRuntimeError(): void {
  try {
    sessionStorage.removeItem(LAST_RUNTIME_ERROR_KEY);
  } catch (error) {
    logger.warn("[runtimeErrorDiagnostics] failed to clear runtime error snapshot", { error });
  }
}

export function shouldRecoverLoadError(reason: unknown): boolean {
  const text =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : String((reason as { message?: unknown; name?: unknown } | null | undefined)?.message ?? reason ?? "");

  return /load failed|loading chunk|chunkloaderror|failed to fetch dynamically imported module|vite:preloaderror|importing a module script failed/i.test(text);
}

export function reloadOnChunkFailureOnce(reason: unknown): boolean {
  if (!shouldRecoverLoadError(reason)) return false;

  try {
    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_ONCE_KEY) === "1";
    if (alreadyReloaded) return false;
    sessionStorage.setItem(CHUNK_RELOAD_ONCE_KEY, "1");
  } catch (error) {
    logger.warn("[runtimeErrorDiagnostics] failed to persist chunk reload marker", { error });
  }

  try {
    window.location.reload();
  } catch (error) {
    logger.error("[runtimeErrorDiagnostics] window reload failed after recoverable chunk error", { error, reason });
    return false;
  }

  return true;
}