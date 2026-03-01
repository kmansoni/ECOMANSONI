// Backwards-compatible wrapper for the Supabase client.
import { supabase as mainSupabase } from "@/integrations/supabase/client";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";

export const supabase = mainSupabase;

// Environment values for direct access when needed.
const runtimeConfig = getSupabaseRuntimeConfig();
export const SUPABASE_URL = runtimeConfig.supabaseUrl;
export const SUPABASE_ANON_KEY = runtimeConfig.supabasePublishableKey;
