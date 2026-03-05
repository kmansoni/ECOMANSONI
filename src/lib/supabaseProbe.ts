/**
 * Shared Supabase availability probe with TTL-based retry.
 * 
 * Prevents permanent fallback to localStorage after transient network failures.
 * Used by useArchivedChats and usePinnedChats.
 */
import { supabase } from "@/lib/supabase";

let _available: boolean | null = null;
let _probeAt = 0;
const PROBE_TTL_MS = 60_000; // re-probe every 60 seconds after failure

export async function probeSupabase(): Promise<boolean> {
  if (_available !== null && Date.now() - _probeAt < PROBE_TTL_MS) {
    return _available;
  }
  try {
    const { error } = await (supabase as any)
      .from("chat_user_settings")
      .select("conversation_id")
      .limit(1);
    _available = !error || error.code === "PGRST116";
  } catch {
    _available = false;
  }
  _probeAt = Date.now();
  return _available;
}

export function resetSupabaseProbe(): void {
  _available = null;
  _probeAt = 0;
}
