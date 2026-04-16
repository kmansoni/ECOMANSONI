// Backwards-compatible wrapper for the Supabase client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as mainSupabase } from "@/integrations/supabase/client";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";

export const supabase = mainSupabase;

/**
 * Escape hatch for Supabase tables/RPCs not yet in the generated Database
 * schema. Uses `any` database type so postgrest-js returns `any` for all
 * queries instead of `unknown`/`{}`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = SupabaseClient<any, 'public', any>;
export const dbLoose: LooseClient = mainSupabase as unknown as LooseClient;

// Environment values for direct access when needed.
const runtimeConfig = getSupabaseRuntimeConfig();
export const SUPABASE_URL = runtimeConfig.supabaseUrl;
export const SUPABASE_ANON_KEY = runtimeConfig.supabasePublishableKey;
