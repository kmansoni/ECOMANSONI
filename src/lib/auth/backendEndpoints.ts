import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";

function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function pushUnique(list: string[], value: string) {
  const v = stripTrailingSlash(value);
  if (!v) return;
  if (!list.includes(v)) list.push(v);
}

export function isSupabaseConfigured(): boolean {
  const runtimeConfig = getSupabaseRuntimeConfig();
  const supabaseUrl = normalizeEnv(runtimeConfig.supabaseUrl);
  const supabaseKey = normalizeEnv(runtimeConfig.supabasePublishableKey);
  return Boolean(supabaseUrl && supabaseKey);
}

// ── Email OTP helpers ─────────────────────────────────────────────────────

function getEdgeFunctionUrl(fnName: string): string {
  const runtimeConfig = getSupabaseRuntimeConfig();
  const supabaseUrl = stripTrailingSlash(normalizeEnv(runtimeConfig.supabaseUrl));
  if (!supabaseUrl) {
    throw new Error(`[backendEndpoints] VITE_SUPABASE_URL не задан — невозможно построить URL для ${fnName}`);
  }
  return `${supabaseUrl}/functions/v1/${fnName}`;
}

function getEdgeFunctionUrls(fnName: string): string[] {
  const urls: string[] = [];
  const runtimeConfig = getSupabaseRuntimeConfig();
  const runtimeUrl = stripTrailingSlash(normalizeEnv(runtimeConfig.supabaseUrl));
  if (!runtimeUrl) {
    throw new Error(`[backendEndpoints] VITE_SUPABASE_URL не задан — невозможно построить URL для ${fnName}`);
  }
  pushUnique(urls, `${runtimeUrl}/functions/v1/${fnName}`);
  return urls;
}

export function getSendEmailOtpUrl(): string {
  return getEdgeFunctionUrl("send-email-otp");
}

export function getSendEmailOtpUrls(): string[] {
  return getEdgeFunctionUrls("send-email-otp");
}

export function getVerifyEmailOtpUrl(): string {
  return getEdgeFunctionUrl("verify-email-otp");
}

export function getVerifyEmailOtpUrls(): string[] {
  return getEdgeFunctionUrls("verify-email-otp");
}

export function getAnonHeaders(): Record<string, string> {
  const runtimeConfig = getSupabaseRuntimeConfig();
  const supabaseKey = normalizeEnv(runtimeConfig.supabasePublishableKey);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (supabaseKey) {
    headers.apikey = supabaseKey;
    // Edge Functions with JWT verification enabled expect Bearer JWT.
    headers.Authorization = `Bearer ${supabaseKey}`;
  }

  return headers;
}
