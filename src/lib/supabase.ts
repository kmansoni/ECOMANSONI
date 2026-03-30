// Backwards-compatible wrapper for the Supabase client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as mainSupabase } from "@/integrations/supabase/client";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";

export const supabase = mainSupabase;

/**
 * Type-safe escape hatch for Supabase tables/RPCs not yet in the generated
 * Database schema. Uses permissive `unknown` row/args/returns while preserving
 * valid query builder methods (`from`, `insert`, `update`, `rpc`, etc.).
 */
type LooseRow = Record<string, unknown>;
type LooseFunction = {
	Args: Record<string, unknown>;
	Returns: unknown;
};
type LooseDatabase = {
	public: {
		Tables: Record<string, {
			Row: LooseRow;
			Insert: LooseRow;
			Update: LooseRow;
			Relationships: [];
		}>;
		Views: Record<string, never>;
		Functions: Record<string, LooseFunction>;
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
};

type LooseClient = SupabaseClient<LooseDatabase>;
export const dbLoose: LooseClient = mainSupabase as unknown as LooseClient;

// Environment values for direct access when needed.
const runtimeConfig = getSupabaseRuntimeConfig();
export const SUPABASE_URL = runtimeConfig.supabaseUrl;
export const SUPABASE_ANON_KEY = runtimeConfig.supabasePublishableKey;
