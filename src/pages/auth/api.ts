import type { ApiPayload } from "./types";
import { sleep } from "@/lib/utils/sleep";

export const OTP_RESEND_COOLDOWN_SEC = 60;
export const AUTH_TIMEOUT_MS = 10_000;
const AUTH_RETRY_ATTEMPTS = 1;
const AUTH_RETRY_DELAY_MS = 700;

export function asApiPayload(value: unknown): ApiPayload | null {
  return value && typeof value === "object" ? (value as ApiPayload) : null;
}

export function payloadString(payload: ApiPayload | null, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" ? value : undefined;
}

export function payloadBoolean(payload: ApiPayload | null, key: string): boolean {
  return Boolean(payload?.[key]);
}

async function fetchJsonWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<{ response: Response; data: ApiPayload | null }> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: ApiPayload | null = null;
    try {
      data = asApiPayload(text ? JSON.parse(text) : null);
    } catch {
      data = null;
    }
    return { response, data };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`timeout:${label}`);
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isRetryableAuthTransportError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return (
    normalized.startsWith("timeout:") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset") ||
    normalized.includes("load failed")
  );
}

export async function fetchJsonWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<{ response: Response; data: ApiPayload | null }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= AUTH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await fetchJsonWithTimeout(input, init, timeoutMs, `${label}:attempt-${attempt}`);
    } catch (err) {
      lastError = err;
      if (!isRetryableAuthTransportError(err) || attempt >= AUTH_RETRY_ATTEMPTS) {
        throw err;
      }
      await sleep(AUTH_RETRY_DELAY_MS * attempt);
    }
  }
  throw (lastError || new Error(`Failed to fetch ${label}`));
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: number | null = null;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer != null) window.clearTimeout(timer);
  });
}

export function getReadableAuthErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const normalized = raw.toLowerCase();
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset")
  ) {
    return "Сетевой сбой при обращении к серверу подтверждения. Проверьте интернет/VPN и повторите.";
  }
  if (normalized.startsWith("timeout:")) {
    return "Сервер отвечает слишком долго. Повторите попытку.";
  }
  return raw;
}

export function isTransientSupabaseAvailabilityError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.toLowerCase();
  return (
    error instanceof TypeError ||
    normalized.includes("failed to fetch") ||
    normalized.includes("networkerror") ||
    normalized.includes("err_connection_reset") ||
    normalized.includes("connection reset") ||
    normalized.includes("503") ||
    normalized.includes("502") ||
    normalized.includes("504") ||
    normalized.startsWith("timeout:")
  );
}

export function toVerifyOtpUrl(sendOtpUrl: string): string {
  return sendOtpUrl.replace(/\/send-email-otp$/i, "/verify-email-otp");
}

export function pushUniqueUrl(list: string[], url: string) {
  if (!url) return;
  if (!list.includes(url)) list.push(url);
}
