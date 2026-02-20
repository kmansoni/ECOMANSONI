import { supabase } from "@/integrations/supabase/client";
import { sha256Hex } from "@/lib/passcode";

function safeString(input: unknown, maxLen: number) {
  const str = String(input ?? "");
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen);
}

export async function computeSessionKey(session: any): Promise<string | null> {
  // Prefer refresh_token (stable across access token refreshes).
  const rt = session?.refresh_token;
  if (typeof rt === "string" && rt.length > 10) {
    return sha256Hex(rt);
  }
  const at = session?.access_token;
  if (typeof at === "string" && at.length > 10) {
    return sha256Hex(at);
  }
  return null;
}

export async function upsertMySession(params: {
  userId: string;
  session: any;
  deviceName?: string | null;
}) {
  const session_key = await computeSessionKey(params.session);
  if (!session_key) return;

  const device_name = params.deviceName ?? null;
  const user_agent = typeof navigator !== "undefined" ? safeString(navigator.userAgent, 500) : null;

  await supabase
    .from("user_sessions")
    .upsert(
      {
        user_id: params.userId,
        session_key,
        device_name,
        user_agent,
        last_seen_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id,session_key" },
    );
}

export async function heartbeatMySession(params: { userId: string; session: any }) {
  const session_key = await computeSessionKey(params.session);
  if (!session_key) return;

  await supabase
    .from("user_sessions")
    .update({ last_seen_at: new Date().toISOString() } as any)
    .eq("user_id", params.userId)
    .eq("session_key", session_key);
}

export async function revokeOtherSessions(params: { userId: string; session: any }) {
  const myKey = await computeSessionKey(params.session);
  if (!myKey) return;

  await supabase
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() } as any)
    .eq("user_id", params.userId)
    .neq("session_key", myKey)
    .is("revoked_at", null);
}

export async function revokeSessionById(params: { userId: string; sessionId: string }) {
  await supabase
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() } as any)
    .eq("user_id", params.userId)
    .eq("id", params.sessionId)
    .is("revoked_at", null);
}

export async function cleanupInactiveSessions(params: {
  userId: string;
  autoTerminateDays: number;
}) {
  const days = Math.max(7, Math.min(365, Math.round(params.autoTerminateDays || 180)));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  await supabase
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() } as any)
    .eq("user_id", params.userId)
    .lt("last_seen_at", cutoff)
    .is("revoked_at", null);
}
