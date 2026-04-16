/**
 * useLoginNotifications — device fingerprinting + login event reporting hook.
 *
 * Device fingerprint is computed from stable, non-sensitive browser signals.
 * It is never used as a security token — its sole purpose is advisory:
 * "is this probably a device we've seen before?"
 *
 * Fingerprint sources:
 *   - Canvas 2D rendering fingerprint (fast, reasonably stable)
 *   - WebGL renderer string
 *   - Screen resolution + color depth
 *   - Timezone offset
 *   - User language
 *
 * Security note: fingerprints can be spoofed by adversarial clients.
 * The server-side `check_new_device` DB function governs whether a device
 * is "trusted" — the client only provides the input signal.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";
import { dbLoose } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoginEvent {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  device_fingerprint: string | null;
  location_city: string | null;
  location_country: string | null;
  is_new_device: boolean;
  created_at: string;
}

export interface KnownDevice {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_name: string | null;
  last_seen_at: string;
  created_at: string;
}

// ─── Fingerprinting ───────────────────────────────────────────────────────────

async function computeFingerprint(): Promise<string> {
  const parts: string[] = [];

  // 1. Canvas 2D
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = "#069";
      ctx.fillText("FP 🔒", 2, 15);
      ctx.fillStyle = "rgba(102,204,0,0.7)";
      ctx.fillText("FP 🔒", 4, 17);
      parts.push(canvas.toDataURL());
    }
  } catch {/* blocked by CSP or privacy mode */}

  // 2. WebGL renderer
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      if (ext) {
        parts.push(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string);
        parts.push(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string);
      }
    }
  } catch {/* WebGL not available */}

  // 3. Screen + color
  parts.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

  // 4. Timezone
  parts.push(String(new Date().getTimezoneOffset()));
  parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // 5. Language
  parts.push(navigator.language);

  // Hash all parts to a compact fingerprint
  const raw = parts.join("|");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(raw),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32); // 16-byte hex — sufficient entropy
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useLoginNotifications() {
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [knownDevices, setKnownDevices] = useState<KnownDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch login history (last 20 events) ──────────────────────────────────
  const fetchLoginEvents = useCallback(async () => {
     
    const { data, error: dbErr } = await dbLoose
      .from("login_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setLoginEvents((data ?? []) as LoginEvent[]);
  }, []);

  // ── Fetch known devices ───────────────────────────────────────────────────
  const fetchKnownDevices = useCallback(async () => {
     
    const { data, error: dbErr } = await dbLoose
      .from("known_devices")
      .select("*")
      .order("last_seen_at", { ascending: false });
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    setKnownDevices((data ?? []) as KnownDevice[]);
  }, []);

  useEffect(() => {
    void fetchLoginEvents();
    void fetchKnownDevices();
  }, [fetchLoginEvents, fetchKnownDevices]);

  // ── Report login to server ─────────────────────────────────────────────────
  const reportLogin = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const fingerprint = await computeFingerprint();

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl;
      const runtimeConfig = getSupabaseRuntimeConfig();
      const apikey = String(runtimeConfig.supabasePublishableKey || "").trim();

      await fetch(`${supabaseUrl}/functions/v1/login-notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apikey ? { apikey } : {}),
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          fingerprint,
          userAgent: navigator.userAgent,
        }),
      });

      // Refresh lists after reporting
      await Promise.all([fetchLoginEvents(), fetchKnownDevices()]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fetchLoginEvents, fetchKnownDevices]);

  // ── Revoke (delete) a known device ────────────────────────────────────────
  const revokeDevice = useCallback(
    async (id: string): Promise<boolean> => {
       
      const { error: dbErr } = await dbLoose
        .from("known_devices")
        .delete()
        .eq("id", id);
      if (dbErr) {
        setError(dbErr.message);
        return false;
      }
      setKnownDevices((prev) => prev.filter((d) => d.id !== id));
      return true;
    },
    [],
  );

  return {
    loginEvents,
    knownDevices,
    loading,
    error,
    reportLogin,
    revokeDevice,
    refetch: () => Promise.all([fetchLoginEvents(), fetchKnownDevices()]),
  };
}
