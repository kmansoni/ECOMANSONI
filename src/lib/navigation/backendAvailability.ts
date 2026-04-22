import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { recordBackendStatus } from '@/lib/navigation/navigationKpi';

export type BackendService = 'routing' | 'traffic';

interface BackendState {
  consecutiveFailures: number;
  openUntil: number;
  lastError: string | null;
}

interface BackendAttemptOptions<T> {
  service: BackendService;
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
  retryDelayMs: number;
  failureThreshold: number;
  cooldownMs: number;
  request: (signal: AbortSignal, attempt: number) => Promise<T>;
}

interface BackendAttemptResult<T> {
  ok: boolean;
  attempted: boolean;
  data?: T;
  error?: unknown;
  reason?: string;
}

const states: Record<BackendService, BackendState> = {
  routing: { consecutiveFailures: 0, openUntil: 0, lastError: null },
  traffic: { consecutiveFailures: 0, openUntil: 0, lastError: null },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function getBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export function getNumberEnv(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getNavigationServerBaseUrl(rawUrl: string | undefined): string {
  return normalizeBaseUrl(rawUrl ?? 'http://localhost:8090');
}

export function shouldAttemptBackend(service: BackendService, enabled: boolean, baseUrl: string): { allowed: boolean; reason?: string } {
  const normalizedUrl = normalizeBaseUrl(baseUrl);
  if (!enabled) {
    recordBackendStatus(service, 'disabled');
    return { allowed: false, reason: 'disabled' };
  }

  if (!normalizedUrl) {
    recordBackendStatus(service, 'disabled');
    return { allowed: false, reason: 'missing_url' };
  }

  const state = states[service];
  const now = Date.now();
  if (state.openUntil > now) {
    recordBackendStatus(service, 'open', { error: state.lastError, openUntil: state.openUntil });
    return { allowed: false, reason: 'circuit_open' };
  }

  return { allowed: true };
}

function markSuccess(service: BackendService): void {
  states[service].consecutiveFailures = 0;
  states[service].openUntil = 0;
  states[service].lastError = null;
  recordBackendStatus(service, 'ok', { error: null, openUntil: null });
}

function markFailure(service: BackendService, error: unknown, failureThreshold: number, cooldownMs: number): void {
  const state = states[service];
  state.consecutiveFailures += 1;
  state.lastError = error instanceof Error ? error.message : String(error);
  if (state.consecutiveFailures >= failureThreshold) {
    state.openUntil = Date.now() + cooldownMs;
    recordBackendStatus(service, 'open', { error: state.lastError, openUntil: state.openUntil });
    return;
  }
  recordBackendStatus(service, 'degraded', { error: state.lastError, openUntil: null });
}

function withTimeoutSignal(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(`timeout_${timeoutMs}ms`), timeoutMs);
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return controller;
}

export async function attemptBackendRequest<T>(opts: BackendAttemptOptions<T>): Promise<BackendAttemptResult<T>> {
  const gate = shouldAttemptBackend(opts.service, opts.enabled, opts.baseUrl);
  if (!gate.allowed) {
    return { ok: false, attempted: false, reason: gate.reason };
  }

  const attempts = Math.max(1, opts.retries + 1);
  let lastError: unknown;

  for (let i = 0; i < attempts; i += 1) {
    const controller = withTimeoutSignal(opts.timeoutMs);
    try {
      const data = await opts.request(controller.signal, i + 1);
      markSuccess(opts.service);
      return { ok: true, attempted: true, data };
    } catch (error) {
      lastError = error;
      markFailure(opts.service, error, opts.failureThreshold, opts.cooldownMs);
      if (i < attempts - 1 && opts.retryDelayMs > 0) {
        await sleep(opts.retryDelayMs * (i + 1));
      }
    } finally {
      if (!controller.signal.aborted) {
        controller.abort('done');
      }
    }
  }

  logger.warn('[backendAvailability] backend request failed', {
    service: opts.service,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });

  return { ok: false, attempted: true, error: lastError, reason: 'request_failed' };
}

export async function getNavigationServerAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // graceful anonymous fallback
  }

  return headers;
}
