/**
 * Shared Supabase availability probe with TTL-based retry.
 * 
 * Prevents permanent fallback to localStorage after transient network failures.
 * Used by useArchivedChats and usePinnedChats.
 */
import { supabase, dbLoose } from "@/lib/supabase";

let _available: boolean | null = null;
let _probeAt = 0;
const PROBE_TTL_OK_MS = 60_000;
const PROBE_TTL_FAIL_MS = 30 * 60_000;

function isExpectedOptionalSettingsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as Record<string, unknown>;
  const code = String(e.code ?? "");
  const status = Number(e.status ?? 0);
  const message = String(e.message ?? "").toLowerCase();
  const details = String(e.details ?? "").toLowerCase();
  const mentionsSettingsTable =
    message.includes("chat_user_settings") ||
    message.includes("user_chat_settings") ||
    details.includes("chat_user_settings") ||
    details.includes("user_chat_settings");
  return (
    code === "42501" ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    status === 403 ||
    status === 404 ||
    (mentionsSettingsTable && (message.includes("does not exist") || message.includes("schema cache") || message.includes("permission"))) ||
    (mentionsSettingsTable && details.includes("schema cache"))
  );
}

export async function probeSupabase(): Promise<boolean> {
  const ttl = _available === false ? PROBE_TTL_FAIL_MS : PROBE_TTL_OK_MS;
  if (_available !== null && Date.now() - _probeAt < ttl) {
    return _available;
  }
  try {
    const { error } = await dbLoose
      .from("user_chat_settings")
      .select("conversation_id")
      .limit(1);
    if (!error || error.code === "PGRST116") {
      _available = true;
    } else if (isExpectedOptionalSettingsError(error)) {
      _available = false;
    } else {
      _available = false;
    }
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
