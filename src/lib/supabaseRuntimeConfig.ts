import { logger } from "@/lib/logger";

function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^["']+|["']+$/g, "").trim();
}

function normalizeSupabaseKey(value: unknown): string {
  return normalizeEnv(value).replace(/\s+/g, "");
}

export type RuntimeConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  demoMode: boolean;
};

let cachedRuntimeConfig: RuntimeConfig | null = null;

/**
 * Returns Supabase runtime configuration sourced exclusively from environment
 * variables. Throws immediately if required variables are absent so that
 * misconfigured deployments fail loudly instead of silently pointing at an
 * unintended project.
 *
 * Required env vars (set in .env / CI secrets):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY  (or VITE_SUPABASE_ANON_KEY)
 *
 * Optional:
 *   VITE_DEMO_MODE=true - enables offline mode with mock auth when Supabase unavailable
 */
export function getSupabaseRuntimeConfig(): RuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;

  const demoMode = normalizeEnv(import.meta.env.VITE_DEMO_MODE).toLowerCase() === "true";
  const envUrl = normalizeEnv(import.meta.env.VITE_SUPABASE_URL);
  const envKey = normalizeSupabaseKey(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
  );

  // Demo mode: skip required env vars check, use placeholder values
  if (demoMode) {
    cachedRuntimeConfig = { 
      supabaseUrl: envUrl || "http://localhost:0", // placeholder for demo mode
      supabasePublishableKey: envKey || "demo-placeholder-key",
      demoMode: true,
    };
    logger.info("[SupabaseRuntimeConfig] Demo mode enabled - Supabase not required");
    return cachedRuntimeConfig;
  }

  if (!envUrl || !envKey) {
    const missing = [
      !envUrl && "VITE_SUPABASE_URL",
      !envKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `[SupabaseRuntimeConfig] Missing required environment variable(s): ${missing}.\n` +
        "Copy .env.example to .env and set the missing values before starting the app.\n" +
        "Alternatively, set VITE_DEMO_MODE=true for offline development.",
    );
  }

  cachedRuntimeConfig = { supabaseUrl: envUrl, supabasePublishableKey: envKey, demoMode: false };
  return cachedRuntimeConfig;
}
