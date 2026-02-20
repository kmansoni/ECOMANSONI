import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createMemoryStorage } from "@/lib/multiAccount/memoryStorage";
import { createFetchWithTimeout } from "@/lib/network/fetchWithTimeout";

function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^["']+|["']+$/g, "").replace(/\s+/g, "");
}

function normalizeSupabaseKey(value: unknown): string {
  return normalizeEnv(value).replace(/\s+/g, "");
}

export function createEphemeralSupabaseClient(): SupabaseClient<Database> {
  const SUPABASE_URL = normalizeEnv(import.meta.env.VITE_SUPABASE_URL);
  const SUPABASE_PUBLISHABLE_KEY = normalizeSupabaseKey(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY,
  );

  const storage = createMemoryStorage();

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: {
      fetch: createFetchWithTimeout({ timeoutMs: 15_000 }),
    },
    auth: {
      storage,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
