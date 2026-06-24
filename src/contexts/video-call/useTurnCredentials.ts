import { useCallback, type MutableRefObject } from "react";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";
import { TURN_CREDENTIALS_API_KEY, TURN_CREDENTIALS_URL } from "@/lib/turnCredentialsConfig";
import {
  TURN_CREDENTIALS_EDGE_FNS,
  TURN_REFRESH_BEFORE_EXPIRY_SEC,
} from "./videoCallProvider.helpers";

interface Params {
  turnIceServersRef: MutableRefObject<RTCIceServer[] | null>;
  turnIceExpiryRef: MutableRefObject<number>;
}

export function useTurnCredentials({ turnIceServersRef, turnIceExpiryRef }: Params) {
  const fetchTurnIceServers = useCallback(async (): Promise<RTCIceServer[] | null> => {
    const nowSec = Math.floor(Date.now() / 1000);

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
      // RFC 7635 §4.2: nonce MUST be random, ≠ requestId
      const nonceBytes = new Uint8Array(16);
      crypto.getRandomValues(nonceBytes);
      let nonceBase64 = "";
      for (let i = 0; i < nonceBytes.length; i++) nonceBase64 += String.fromCharCode(nonceBytes[i]);
      nonceBase64 = btoa(nonceBase64).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

      if (TURN_CREDENTIALS_URL) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "x-turn-nonce": nonceBase64,
            "x-request-id": requestId,
          };
          if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
          if (TURN_CREDENTIALS_API_KEY) headers.apikey = TURN_CREDENTIALS_API_KEY;

          const response = await fetch(TURN_CREDENTIALS_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({ requestId, nonce: nonceBase64 }),
          });

          if (response.ok) {
            data = await response.json().catch(() => ({}));
            invokeError = null;
          } else {
            const text = await response.text().catch(() => "");
            invokeError = new Error(`TURN endpoint ${response.status}: ${text}`);
            logger.warn("[useTurnCredentials] URL failed, fallback to edge function", { status: response.status });
          }
        } catch (err) {
          invokeError = err;
          logger.warn("[useTurnCredentials] URL exception, fallback to edge function", err);
        }
      }

      if (!data) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const runtimeConfig = getSupabaseRuntimeConfig();
        const publishableKey = String(runtimeConfig.supabasePublishableKey || "").trim();

        for (const fn of TURN_CREDENTIALS_EDGE_FNS) {
          try {
            const result = await supabase.functions.invoke(fn, {
              body: { requestId, nonce: nonceBase64 },
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
      }

      if (invokeError) {
        logger.warn("[useTurnCredentials] fetch failed (STUN-only fallback):", invokeError);
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
        logger.warn("[useTurnCredentials] empty iceServers");
        return null;
      }

      turnIceServersRef.current = parsed.iceServers;
      turnIceExpiryRef.current = typeof parsed.expiresAt === "number"
        ? parsed.expiresAt
        : nowSec + (typeof parsed.ttl === "number" ? parsed.ttl : 86_400);

      logger.info("[useTurnCredentials] refreshed", {
        count: parsed.iceServers.length,
        expiresAt: turnIceExpiryRef.current,
      });

      return parsed.iceServers;
    } catch (err) {
      logger.warn("[useTurnCredentials] exception (STUN-only fallback):", err);
      return null;
    }
  }, [turnIceServersRef, turnIceExpiryRef]);

  return { fetchTurnIceServers };
}
