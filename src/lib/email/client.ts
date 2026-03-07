/**
 * src/lib/email/client.ts — Frontend Email Router client.
 *
 * Security model (dual-mode):
 *
 *  PRODUCTION (default):
 *   - Вызывает Supabase Edge Function `email-send` через HTTPS + Supabase JWT.
 *   - API-ключ email-router НИКОГДА не попадает в браузер — хранится в Supabase Vault.
 *   - Только аутентифицированные пользователи могут отправить email.
 *
 *  DEV MODE (VITE_EMAIL_ROUTER_DIRECT=true):
 *   - Прямой вызов email-router (для локальной разработки без Supabase Edge Functions).
 *   - VITE_EMAIL_ROUTER_API_KEY используется ТОЛЬКО в dev-режиме.
 *   - НЕ использовать в production.
 *
 * @module lib/email/client
 */

import { supabase } from '@/integrations/supabase/client';
import { getEmailEdgeFunctionUrl, getEmailRouterApiBases } from './backendEndpoints';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EmailPayload {
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  from?: string;
  replyTo?: string;
}

export interface EmailResult {
  success: true;
  messageId: string;
  queued: boolean;
  smtpResponse: string;
}

export interface EmailError {
  success: false;
  error: string;
  details?: string;
  retryable?: boolean;
  /** Which base URL succeeded in returning (even an error response) — dev mode only */
  respondedBase?: string;
}

export type EmailSendResult = EmailResult | EmailError;

// ─── Internal helpers ────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Returns true if direct email-router mode is enabled.
 *
 * Direct mode is ONLY for local development — it bypasses the Edge Function proxy
 * and calls the email-router directly using VITE_EMAIL_ROUTER_API_KEY.
 *
 * Enabled by setting VITE_EMAIL_ROUTER_DIRECT=true in .env.local.
 * Automatically disabled in production builds (import.meta.env.PROD).
 */
function isDirectModeEnabled(): boolean {
  try {
    const isDirect = (import.meta as any).env?.VITE_EMAIL_ROUTER_DIRECT === 'true';
    const isDev = (import.meta as any).env?.DEV === true;
    return isDev && isDirect;
  } catch {
    return false;
  }
}

/**
 * Read the dev-only API key.
 *
 * SECURITY: VITE_* variables are inlined into the browser bundle.
 * This key is ONLY used in dev mode (VITE_EMAIL_ROUTER_DIRECT=true).
 * Never used in production — the Edge Function holds the real key in Vault.
 */
function getDevApiKey(): string {
  try {
    return (import.meta as any).env?.VITE_EMAIL_ROUTER_API_KEY ?? '';
  } catch {
    return '';
  }
}

// ─── Production path: Supabase Edge Function proxy ───────────────────────────

/**
 * Send email via Supabase Edge Function `email-send`.
 *
 * The Edge Function verifies the JWT, applies rate limiting, then proxies
 * the request to email-router with the server-side API key from Vault.
 *
 * Requires the user to be authenticated (valid Supabase session).
 */
async function sendEmailViaProxy(payload: EmailPayload): Promise<EmailSendResult> {
  const edgeFunctionUrl = getEmailEdgeFunctionUrl();

  if (!edgeFunctionUrl) {
    return {
      success: false,
      error: 'NO_SUPABASE_URL_CONFIGURED',
      details: 'VITE_SUPABASE_URL is not set. Cannot reach email proxy.',
    };
  }

  // Retrieve current session — JWT required for Edge Function auth
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    return {
      success: false,
      error: 'NOT_AUTHENTICATED',
      details: 'A valid Supabase session is required to send email.',
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = { success: false, error: 'INVALID_PROXY_RESPONSE', details: 'Non-JSON response from email proxy' };
    }

    return data as EmailSendResult;
  } catch (err: unknown) {
    clearTimeout(timer);
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      success: false,
      error: isTimeout ? 'PROXY_TIMEOUT' : 'PROXY_UNREACHABLE',
      details: isTimeout ? 'Email proxy did not respond within timeout.' : 'Network error reaching email proxy.',
      retryable: true,
    };
  }
}

// ─── Dev path: direct email-router call (legacy, dev only) ───────────────────

/**
 * Attempt a single POST /send against one base URL directly.
 * Only used in dev mode (VITE_EMAIL_ROUTER_DIRECT=true).
 * Returns null if the request could not be completed (network error / timeout).
 */
async function attemptDirectSend(
  base: string,
  payload: EmailPayload,
  apiKey: string
): Promise<EmailSendResult | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = { success: false, error: 'INVALID_RESPONSE', details: 'Non-JSON response from email router' };
    }

    const result = data as EmailSendResult;

    // 5xx = server-side transient; retry next base
    if (response.status >= 500) {
      return null;
    }

    return { ...result, respondedBase: base } as EmailSendResult;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Send email directly to email-router (dev mode only).
 */
async function sendEmailDirect(payload: EmailPayload): Promise<EmailSendResult> {
  const bases = getEmailRouterApiBases();
  const apiKey = getDevApiKey();

  if (bases.length === 0) {
    return {
      success: false,
      error: 'NO_ENDPOINT_CONFIGURED',
      details: 'No email router base URLs available. Check VITE_EMAIL_ROUTER_API_URL.',
    };
  }

  for (const base of bases) {
    const result = await attemptDirectSend(base, payload, apiKey);
    if (result !== null) {
      return result;
    }
  }

  return {
    success: false,
    error: 'ALL_ENDPOINTS_FAILED',
    details: `All ${bases.length} email router endpoint(s) failed to respond.`,
    retryable: true,
  };
}

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send an email.
 *
 * Routes to the appropriate backend based on mode:
 *  - Production: Supabase Edge Function proxy (API key in Vault, never in bundle)
 *  - Dev (VITE_EMAIL_ROUTER_DIRECT=true): direct email-router call with dev API key
 *
 * @throws Never — always returns EmailSendResult (success or error)
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailSendResult> {
  if (isDirectModeEnabled()) {
    return sendEmailDirect(payload);
  }
  return sendEmailViaProxy(payload);
}

// ─── Typed helpers ────────────────────────────────────────────────────────────

/**
 * Send email verification code.
 *
 * Maps to template `verification` with variables: name, code, link.
 */
export async function sendVerificationEmail(
  to: string,
  name: string,
  code: string,
  link: string
): Promise<EmailSendResult> {
  return sendEmail({
    to,
    template: 'verification',
    templateData: { name, code, link },
  });
}

/**
 * Send password reset link.
 *
 * Maps to template `reset-password` with variables: name, link, expiry_minutes.
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string,
  link: string,
  expiryMinutes = 30
): Promise<EmailSendResult> {
  return sendEmail({
    to,
    template: 'reset-password',
    templateData: { name, link, expiry_minutes: String(expiryMinutes) },
  });
}

/**
 * Send welcome email after successful registration.
 *
 * Maps to template `welcome` with variable: name.
 */
export async function sendWelcomeEmail(
  to: string,
  name: string
): Promise<EmailSendResult> {
  return sendEmail({
    to,
    template: 'welcome',
    templateData: { name },
  });
}

/**
 * Send a generic notification email.
 *
 * Maps to template `notification` with variables: title, body, action_url, action_text.
 */
export async function sendNotification(
  to: string,
  title: string,
  body: string,
  actionUrl = '',
  actionText = 'Открыть'
): Promise<EmailSendResult> {
  return sendEmail({
    to,
    template: 'notification',
    templateData: { title, body, action_url: actionUrl, action_text: actionText },
  });
}

/**
 * Health-check the email service.
 *
 * Production: calls Edge Function with a dummy health-check payload (requires auth).
 * Dev mode: directly polls /health on each configured base URL.
 *
 * Returns true if the service is reachable and functioning.
 */
export async function checkEmailHealth(): Promise<boolean> {
  if (isDirectModeEnabled()) {
    // Dev mode: direct health check
    const bases = getEmailRouterApiBases();
    const apiKey = getDevApiKey();

    for (const base of bases) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        const res = await fetch(`${base}/health`, {
          headers: { 'X-API-Key': apiKey },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (res.ok) return true;
      } catch {
        clearTimeout(timer);
      }
    }
    return false;
  }

  // Production: probe Edge Function reachability via a minimal POST request.
  // The Edge Function only accepts POST (GET → 405). We send a deliberately
  // invalid payload so the function validates auth + returns 400 — proving
  // the service is up without triggering an actual email send.
  // 200 OK or 4xx (auth/validation) both mean the function is reachable.
  // 5xx or network error means the service is down.
  const edgeFunctionUrl = getEmailEdgeFunctionUrl();
  if (!edgeFunctionUrl) return false;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        // Signal this is a health probe — Edge Function can short-circuit if desired
        'X-Health-Probe': '1',
      },
      // Minimal payload — will fail validation (no 'to' field) → 400,
      // but 400 means the service is reachable and authenticated.
      body: JSON.stringify({ _healthProbe: true }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Any response below 500 means the service is up (even 4xx = reachable)
    return res.status < 500;
  } catch {
    clearTimeout(timer);
    return false;
  }
}
