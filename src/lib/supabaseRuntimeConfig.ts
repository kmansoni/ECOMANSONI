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
 */
export function getSupabaseRuntimeConfig(): RuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;

  const envUrl = normalizeEnv(import.meta.env.VITE_SUPABASE_URL);
  const envKey = normalizeSupabaseKey(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
  );

  if (!envUrl || !envKey) {
    const missing = [
      !envUrl && "VITE_SUPABASE_URL",
      !envKey && "VITE_SUPABASE_PUBLISHABLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `[SupabaseRuntimeConfig] Missing required environment variable(s): ${missing}.\n` +
        "Copy .env.example to .env and set the missing values before starting the app.",
    );
  }

  cachedRuntimeConfig = { supabaseUrl: envUrl, supabasePublishableKey: envKey };
  return cachedRuntimeConfig;
}
