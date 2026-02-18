// Backwards-compatible wrapper for the Supabase client.
import { supabase as mainSupabase } from "@/integrations/supabase/client";

export const supabase = mainSupabase;

// Environment values for direct access when needed.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string;
