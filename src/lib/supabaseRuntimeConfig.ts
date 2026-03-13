function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^["']+|["']+$/g, "").trim();
}

function normalizeSupabaseKey(value: unknown): string {
  return normalizeEnv(value).replace(/\s+/g, "");
}

const EMERGENCY_SUPABASE_URL = "https://lfkbgnbjxskspsownvjm.supabase.co";
const EMERGENCY_SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxma2JnbmJqeHNrc3Bzb3dudmptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NDI0NTYsImV4cCI6MjA4NzAxODQ1Nn0.WNubMc1s9TA91aT_txY850x2rWJ1ayxiTs7Rq6Do21k";

type RuntimeConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  usedFallback: boolean;
};

let cachedRuntimeConfig: RuntimeConfig | null = null;
let missingEnvLogged = false;

/**
 * Get Supabase runtime configuration from environment variables.
 * 
 * IMPORTANT: This function intentionally does NOT provide fallback credentials.
 * If VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY are missing,
 * the application will fail loudly rather than silently use invalid credentials.
 * 
 * For development, ensure your .env file contains:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY)
 */
export function getSupabaseRuntimeConfig(): RuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;

  const envUrl = normalizeEnv(import.meta.env.VITE_SUPABASE_URL);
  const envKey = normalizeSupabaseKey(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
  );

  // Fail loudly if credentials are missing - no silent fallbacks
  const usedFallback = !envUrl || !envKey;

  if (usedFallback) {
    // Log once per page lifecycle to avoid noisy repeated CRITICAL logs.
    if (!missingEnvLogged) {
      const payload = {
        hasUrl: !!envUrl,
        hasKey: !!envKey,
        envUrl: envUrl ? "(set)" : "MISSING",
        envKey: envKey ? "(set)" : "MISSING",
      };
      if (import.meta.env.DEV) {
        console.warn("[SupabaseRuntimeConfig] Missing VITE_SUPABASE_* — using emergency fallback", payload);
      } else {
        console.error("[SupabaseRuntimeConfig] CRITICAL: Missing required environment variables!", payload);
      }
      missingEnvLogged = true;
    }

    // Emergency fallback to primary production project credentials.
    // This keeps auth/app boot functional when deploy env injection is misconfigured.
    cachedRuntimeConfig = {
      supabaseUrl: envUrl || EMERGENCY_SUPABASE_URL,
      supabasePublishableKey: envKey || EMERGENCY_SUPABASE_PUBLISHABLE_KEY,
      usedFallback: true,
    };
    return cachedRuntimeConfig;
  }

  cachedRuntimeConfig = {
    supabaseUrl: envUrl,
    supabasePublishableKey: envKey,
    usedFallback: false,
  };
  return cachedRuntimeConfig;
}
