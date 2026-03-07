/**
 * src/lib/email/backendEndpoints.ts — Email Router API base URL resolution.
 *
 * Architecture:
 *  - Production: email sends are proxied through Supabase Edge Function `email-send`.
 *    The API key lives in Supabase Vault and NEVER reaches the browser bundle.
 *    Use getEmailEdgeFunctionUrl() to get the Edge Function URL.
 *
 *  - Dev mode (VITE_EMAIL_ROUTER_DIRECT=true): direct calls to email-router for
 *    local development without Supabase. Use getEmailRouterApiBases() for failover list.
 */

/**
 * Returns the URL of the Supabase Edge Function `email-send`.
 *
 * Production path — requires VITE_SUPABASE_URL to be set.
 * Returns empty string if VITE_SUPABASE_URL is not configured.
 */
export function getEmailEdgeFunctionUrl(): string {
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? '';
  if (!supabaseUrl) return '';
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/email-send`;
}

/**
 * Returns ordered list of email router base URLs for failover.
 *
 * Used only in dev mode (VITE_EMAIL_ROUTER_DIRECT=true).
 *
 * Reads VITE_EMAIL_ROUTER_API_URL — supports comma-separated list for
 * multi-region failover:
 *   VITE_EMAIL_ROUTER_API_URL="https://email1.example.com,https://email2.example.com"
 *
 * In dev mode, falls back to http://localhost:8090 if not configured.
 * Returns empty array in production.
 */
export function getEmailRouterApiBases(): string[] {
  const raw: string = (import.meta as any).env?.VITE_EMAIL_ROUTER_API_URL ?? '';

  const bases = raw
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter((url) => url.length > 0);

  // Dev-mode fallback: if no URL configured, try localhost
  if (bases.length === 0 && (import.meta as any).env?.DEV) {
    bases.push('http://localhost:8090');
  }

  return bases;
}
