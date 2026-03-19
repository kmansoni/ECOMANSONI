/**
 * useTurnCredentials — React hook.
 *
 * Fetches time-limited TURN credentials from the Edge Function, caches them in
 * refs (never in React state — avoids re-renders), and handles safe expiry refresh.
 *
 * Security:
 *  - Credentials are HMAC-SHA1 per RFC 5766 §9.2; TTL comes from the server (default 24 h).
 *  - Cached in refs until 30 minutes before server-declared expiry.
 *  - Fallback to null (STUN-only) if the function is unavailable — calls may still work.
 *  - No credentials stored in localStorage/sessionStorage — memory-only.
 *
 * Race condition safety:
 *  - Multiple concurrent callers may execute simultaneously; since all write the same
 *    data and it's a ref (not state), there is no torn-read / UI inconsistency risk.
 */

import { useRef, useCallback } from "react";
import type { MutableRefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";
import { logger } from "@/lib/logger";

// Ordered by priority — "turn-credentials" is the canonical production name.
const TURN_CREDENTIALS_EDGE_FNS = ["turn-credentials", "get-turn-credentials"] as const;
/** Refresh window before server-declared expiry (30 min). */
const TURN_REFRESH_BEFORE_EXPIRY_SEC = 30 * 60;

export interface UseTurnCredentialsResult {
  turnIceServersRef: MutableRefObject<RTCIceServer[] | null>;
  turnIceExpiryRef: MutableRefObject<number>;
  fetchTurnIceServers: () => Promise<RTCIceServer[] | null>;
}

export function useTurnCredentials(): UseTurnCredentialsResult {
  const turnIceServersRef = useRef<RTCIceServer[] | null>(null);
  /** Unix seconds when the current credentials expire. Zero means "not fetched yet". */
  const turnIceExpiryRef = useRef<number>(0);

  const fetchTurnIceServers = useCallback(async (): Promise<RTCIceServer[] | null> => {
    const nowSec = Math.floor(Date.now() / 1000);

    // Return cached credentials if still fresh (with 30-min safety margin).
    if (
      turnIceServersRef.current &&
      turnIceExpiryRef.current > nowSec + TURN_REFRESH_BEFORE_EXPIRY_SEC
    ) {
      return turnIceServersRef.current;
    }

    try {
      let data: unknown = null;
      let invokeError: unknown = null;
      const requestId = crypto.randomUUID();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const runtimeConfig = getSupabaseRuntimeConfig();
      const publishableKey = String(runtimeConfig.supabasePublishableKey || "").trim();

      for (const fn of TURN_CREDENTIALS_EDGE_FNS) {
        try {
          const result = await supabase.functions.invoke(fn, {
            body: { requestId, nonce: requestId },
            headers: {
              ...(publishableKey ? { apikey: publishableKey } : {}),
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
          });
          if (!result.error) {
            data = result.data;
            invokeError = null;
            break;
          }
          invokeError = result.error;
          logger.warn("[useTurnCredentials] edge function failed", { fn, error: result.error });
        } catch (fnError) {
          invokeError = fnError;
          logger.warn("[useTurnCredentials] edge function invoke exception", { fn, error: fnError });
        }
      }

      if (invokeError) {
        logger.warn("[useTurnCredentials] TURN credentials fetch failed (STUN-only fallback):", invokeError);
        return null;
      }

      const parsed = data as {
        iceServers?: RTCIceServer[];
        ttl?: number;
        expiresAt?: number;
        error?: string;
      } | null;

      if (parsed?.error) {
        logger.warn("[useTurnCredentials] server error:", parsed.error);
        return null;
      }

      if (!Array.isArray(parsed?.iceServers) || parsed.iceServers.length === 0) {
        logger.warn("[useTurnCredentials] returned empty iceServers");
        return null;
      }

      turnIceServersRef.current = parsed.iceServers;
      turnIceExpiryRef.current =
        typeof parsed.expiresAt === "number"
          ? parsed.expiresAt
          : nowSec + (typeof parsed.ttl === "number" ? parsed.ttl : 86_400);

      logger.info("[useTurnCredentials] refreshed", {
        count: parsed.iceServers.length,
        expiresAt: turnIceExpiryRef.current,
      });

      return parsed.iceServers;
    } catch (err) {
      logger.warn("[useTurnCredentials] fetch exception (STUN-only fallback):", err);
      return null;
    }
  }, []);

  return { turnIceServersRef, turnIceExpiryRef, fetchTurnIceServers };
}
