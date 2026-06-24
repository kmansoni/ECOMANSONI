/**
 * MediaViewModel — local/remote streams, mute/video/screenshare, noise suppression,
 * background blur, TURN credentials, media bootstrap lifecycle.
 *
 * Ownership:
 *  - localStream / remoteStream
 *  - mute / video toggle state
 *  - screenshare
 *  - noise suppression / background blur
 *  - TURN ICE server fetch and caching
 *  - media bootstrap trigger
 *  - relay metrics collection
 *
 * NOT owned here (wired via deps):
 *  - SfuMediaManager lifecycle → managed by useCallsV2Bootstrap
 *  - Consumers/producers → managed by ParticipantsViewModel
 *  - E2EE key exchange → managed by E2eeViewModel
 *
 * Exposes: media context value + imperative refs for Provider
 */

import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { useVideoCallSfu, type VideoCall } from "@/hooks/useVideoCallSfu";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";
import {
  TURN_CREDENTIALS_API_KEY,
  TURN_CREDENTIALS_URL,
} from "@/lib/turnCredentialsConfig";
import { TURN_REFRESH_BEFORE_EXPIRY_SEC } from "./videoCallProvider.helpers";
import type { VideoCallMediaContextType } from "./types";
import { hasE2eeSupport } from "./videoCallProvider.helpers";

interface MediaViewModelDeps {
  user: { id: string } | null;
  legacyEngineActive: boolean;
  bootstrapCallsV2Media: (call: VideoCall, stream: MediaStream) => Promise<void>;
  rebuildRemoteStream: () => void;
  callsWsRef: React.MutableRefObject<import("@/calls-v2/wsClient").CallsWsClient | null>;
  currentCall: VideoCall | null;
  pendingIncomingCall: VideoCall | null;
  isCallUiActive: boolean;
  callStateRef: React.MutableRefObject<import("@/calls-v2/callStateMachine").CallState>;
  dispatchFsm: (event: import("@/calls-v2/callStateMachine").CallEvent) => import("@/calls-v2/callStateMachine").CallState;
  isCallConnecting: (s: import("@/calls-v2/callStateMachine").CallState) => boolean;
  markMediaBootstrapProgress?: (callId: string, stage: string) => void;
  markMediaBootstrapFailed?: (callId: string, reason: string) => void;
}

export function useMediaViewModel(deps: MediaViewModelDeps) {
  const {
    user,
    legacyEngineActive,
    bootstrapCallsV2Media,
    rebuildRemoteStream,
    callsWsRef,
    currentCall,
    pendingIncomingCall,
    isCallUiActive,
    callStateRef,
    dispatchFsm,
    isCallConnecting,
  } = deps;

  // ─── Media engine ──────────────────────────────────────────────────
  const {
    localStream,
    remoteStream,
    isScreenSharing,
    screenStream,
    startScreenShare,
    stopScreenShare,
    noiseSuppressionEnabled,
    toggleNoiseSuppression,
    backgroundBlurEnabled,
    toggleBackgroundBlur,
    isMuted,
    isVideoOff,
    startCall: startVideoCall,
    answerCall: answerVideoCall,
    endCall: endVideoCall,
    toggleMute,
    toggleVideo,
    retryWithFreshCredentials,
    markMediaBootstrapFailed,
    markMediaBootstrapProgress,
    setRemoteStream: setRemoteMediaStream,
    releaseMediaWithoutDbUpdate,
    currentCall: engineCurrentCall,
  } = useVideoCallSfu({
    onCallEnded: () => {
      // handled by SignalingViewModel
    },
    onRetryMediaBootstrap: async (call, stream) => {
      await bootstrapCallsV2Media(call, stream);
    },
    onLocalTrackReplaced: async (_kind, _track) => {
      // handled separately by useCallsV2MediaBootstrap
    },
  });

  // ─── TURN credentials ───────────────────────────────────────────────
  const turnIceServersRef = useRef<RTCIceServer[] | null>(null);
  const turnIceExpiryRef = useRef<number>(0);

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
          } else {
            invokeError = new Error(`TURN endpoint ${response.status}`);
          }
        } catch (customUrlError) {
          invokeError = customUrlError;
        }
      }

      if (!data) {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        const runtimeConfig = getSupabaseRuntimeConfig();
        const publishableKey = String(runtimeConfig.supabasePublishableKey || "").trim();

        const edgeFns = ["get-turn-credentials", "turn-credentials", "coturn-credentials"];

        for (const fn of edgeFns) {
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
          } catch (fnError) {
            invokeError = fnError;
          }
        }
      }

      if (invokeError) {
        logger.warn("[MediaVM] TURN fetch failed (STUN-only fallback):", invokeError);
        return null;
      }

      const parsed = data as {
        iceServers?: RTCIceServer[];
        ttl?: number;
        expiresAt?: number;
        error?: string;
      } | null;

      if (parsed?.error || !Array.isArray(parsed?.iceServers) || parsed.iceServers.length === 0) {
        return null;
      }

      turnIceServersRef.current = parsed.iceServers;
      turnIceExpiryRef.current =
        typeof parsed.expiresAt === "number"
          ? parsed.expiresAt
          : nowSec + (typeof parsed.ttl === "number" ? parsed.ttl : 86_400);

      logger.info("[MediaVM] TURN credentials refreshed", {
        count: parsed.iceServers.length,
        expiresAt: turnIceExpiryRef.current,
      });
      return parsed.iceServers;
    } catch (err) {
      logger.warn("[MediaVM] TURN fetch exception:", err);
      return null;
    }
  }, []);

  // ─── Relay metrics collection ────────────────────────────────────────
  const relayMetricsTimerRef = useRef<number | null>(null);
  const relayMetricsLastSignatureRef = useRef<string>("");
  const relayMetricsLastLogAtRef = useRef<number>(0);
  const sfuManagerRef = useRef<import("@/calls-v2/sfuMediaManager").SfuMediaManager | null>(null);

  const startRelayMetricsCollection = useCallback((callId: string, manager: typeof sfuManagerRef.current) => {
    if (relayMetricsTimerRef.current) {
      window.clearInterval(relayMetricsTimerRef.current);
    }

    relayMetricsTimerRef.current = window.setInterval(async () => {
      const snap = await manager?.sampleRelayMetrics?.();
      if (!snap) return;

      const now = Date.now();
      const sig = [
        snap.aggregate.relay_fallback_count,
        snap.aggregate.total_samples,
        snap.send?.isRelaySelected ? 1 : 0,
        snap.recv?.isRelaySelected ? 1 : 0,
      ].join(":");

      if (sig !== relayMetricsLastSignatureRef.current || now - relayMetricsLastLogAtRef.current > 15000) {
        relayMetricsLastSignatureRef.current = sig;
        relayMetricsLastLogAtRef.current = now;
        logger.info("video_call.relay_metrics", {
          callId: callId.slice(0, 8),
          sendRelay: !!snap.send?.isRelaySelected,
          recvRelay: !!snap.recv?.isRelaySelected,
          relayUsageRate: snap.aggregate.relay_usage_rate,
          relayFallbackCount: snap.aggregate.relay_fallback_count,
          totalSamples: snap.aggregate.total_samples,
        });
      }
    }, 5000);
  }, []);

  const stopRelayMetricsCollection = useCallback(() => {
    if (relayMetricsTimerRef.current) {
      window.clearInterval(relayMetricsTimerRef.current);
      relayMetricsTimerRef.current = null;
    }
  }, []);

  const setSfuManager = useCallback((manager: typeof sfuManagerRef.current) => {
    sfuManagerRef.current = manager;
  }, []);

  // ─── Media bootstrap trigger — runs when engine call + local stream are ready ─
  const bootstrapPendingRef = useRef(false);
  useEffect(() => {
    const bootstrapCall = engineCurrentCall ?? currentCall;
    if (!bootstrapCall || !localStream || bootstrapPendingRef.current) return;
    bootstrapPendingRef.current = true;
    void bootstrapCallsV2Media(bootstrapCall, localStream).finally(() => {
      bootstrapPendingRef.current = false;
    });
  }, [currentCall, engineCurrentCall, localStream, bootstrapCallsV2Media]);

  // ─── Remote screen stream ────────────────────────────────────────────
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

  // ─── Context value ──────────────────────────────────────────────────
  const mediaValue = useMemo<VideoCallMediaContextType>(() => ({
    localStream: legacyEngineActive ? null : localStream,
    remoteStream: legacyEngineActive ? null : remoteStream,
    remoteScreenStream,
    isMuted: legacyEngineActive ? false : isMuted,
    isVideoOff: legacyEngineActive ? false : isVideoOff,
    isScreenSharing: legacyEngineActive ? false : isScreenSharing,
    screenStream: legacyEngineActive ? null : screenStream,
    noiseSuppressionEnabled: legacyEngineActive ? false : noiseSuppressionEnabled,
    backgroundBlurEnabled: legacyEngineActive ? false : backgroundBlurEnabled,
    toggleMute: legacyEngineActive
      ? async () => { logger.info("[MediaVM] Mute unavailable in legacy mode"); }
      : toggleMute,
    toggleVideo: legacyEngineActive
      ? async () => { logger.info("[MediaVM] Video toggle unavailable in legacy mode"); }
      : toggleVideo,
    toggleScreenShare: legacyEngineActive
      ? async () => { toast.info("Демонстрация экрана недоступна в режиме совместимости"); }
      : async () => {
          if (isScreenSharing) {
            stopScreenShare();
          } else {
            await startScreenShare();
          }
        },
    toggleNoiseSuppression: legacyEngineActive
      ? async () => {}
      : toggleNoiseSuppression,
    toggleBackgroundBlur: legacyEngineActive
      ? async () => {}
      : toggleBackgroundBlur,
    isE2eeActive: false,
  }), [
    legacyEngineActive,
    localStream,
    remoteStream,
    remoteScreenStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    screenStream,
    noiseSuppressionEnabled,
    backgroundBlurEnabled,
    toggleMute,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    toggleNoiseSuppression,
    toggleBackgroundBlur,
  ]);

  return {
    // Context value
    mediaValue,
    // TURN
    turnIceServersRef,
    fetchTurnIceServers,
    // Remote streams
    setRemoteScreenStream,
    // SFU manager bridge
    setSfuManager,
    sfuManagerRef,
    // Relay metrics
    startRelayMetricsCollection,
    stopRelayMetricsCollection,
    relayMetricsTimerRef,
    // Media engine internals
    localStream,
    remoteStream,
    setRemoteMediaStream,
    isScreenSharing,
    screenStream,
    stopScreenShare,
    startScreenShare,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo,
    noiseSuppressionEnabled,
    backgroundBlurEnabled,
    toggleNoiseSuppression,
    toggleBackgroundBlur,
    startVideoCall,
    answerVideoCall,
    endVideoCall,
    retryWithFreshCredentials,
    markMediaBootstrapFailed,
    markMediaBootstrapProgress,
    releaseMediaWithoutDbUpdate,
  };
}
