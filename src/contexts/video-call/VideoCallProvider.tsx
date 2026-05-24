/**
 * VideoCallProvider — Composite provider.
 *
 * Architecture:
 *  This single component holds ALL call orchestration logic and simultaneously
 *  provides THREE separate React contexts:
 *    1. VideoCallSignalingContext  — call lifecycle state + actions
 *    2. VideoCallMediaContext      — streams + mute/video toggles
 *    3. VideoCallUIContext         — UI-lock flag
 *
 * Re-render isolation:
 *  - isCallUiActive changes     → ONLY VideoCallUIContext consumers re-render
 *  - isMuted/streams change     → ONLY VideoCallMediaContext consumers re-render
 *  - status/call change         → ONLY VideoCallSignalingContext consumers re-render
 *
 * Security invariants:
 *  - No TURN credentials, ECDH keys, or ECDSA private keys appear in context values.
 *    All cryptographic material lives in refs (callKeyExchangeRef, callMediaEncryptionRef,
 *    turnIceServersRef) and never leaves this component.
 *  - keyPackageNonceRef provides anti-replay protection for KEY_PACKAGE messages.
 *  - epochGuardRef enforces fail-closed media: frames are dropped without E2EE_READY.
 *  - rekeyMachineRef state machine drives periodic key rotation with deadline enforcement.
 *
 * Scale note:
 *  - All networking is event-driven via CallsWsClient; no polling.
 *  - TURN credentials are cached in refs (no state → no re-renders) with 30-min
 *    pre-expiry refresh.
 *  - SFU mediasoup transports are lazily initialized per call session.
 */

import { ReactNode, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { useVideoCallSfu, type VideoCall, type VideoCallStatus } from "@/hooks/useVideoCallSfu";
import { useVideoCall as useLegacyP2pVideoCall } from "@/hooks/useVideoCall";
import { useIncomingCalls } from "@/hooks/useIncomingCalls";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { onNativeCallAction } from "@/lib/native/callBridge";
import { supabase } from "@/integrations/supabase/client";
import { getSupabaseRuntimeConfig } from "@/lib/supabaseRuntimeConfig";
import { TURN_CREDENTIALS_API_KEY, TURN_CREDENTIALS_URL } from "@/lib/turnCredentialsConfig";
import { CallsWsClient } from "@/calls-v2/wsClient";
import {
  getOrCreateIdentityKeyPair,
  signIdentity,
  exportPublicKey as exportEcdsaPublicKey,
} from "@/calls-v2/ecdsaIdentity";
import { SfuMediaManager } from "@/calls-v2/sfuMediaManager";
import { CallKeyExchange } from "@/calls-v2/callKeyExchange";
import { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import { RekeyStateMachine } from "@/calls-v2/rekeyStateMachine";
import { EpochGuard } from "@/calls-v2/epochGuard";
import {
  CALL_ENGINE_MODE,
  transition as fsmTransition,
  isCallActive,
  isCallConnected,
  isCallConnecting,
  fromLegacyStatus,
} from "@/calls-v2/callStateMachine";
import type { CallState, CallEvent } from "@/calls-v2/callStateMachine";
import type { RtpCapabilities } from "@/calls-v2/types";
import type { CallIdentity, KeyPackageData } from "@/calls-v2/callKeyExchange";
import type { RekeyEvent } from "@/calls-v2/rekeyStateMachine";

import { VideoCallSignalingContext } from "./VideoCallSignalingContext";
import { VideoCallMediaContext } from "./VideoCallMediaContext";
import { VideoCallUIContext } from "./VideoCallUIContext";
import { useCallsV2Bootstrap } from "./useCallsV2Bootstrap";
import { useCallsV2MediaBootstrap } from "./useCallsV2MediaBootstrap";
import { useE2eePipeBreakRecovery } from "./useE2eePipeBreakRecovery";
import { resolveLocalProducerIdForTrack } from "./resolveLocalProducerId";
import type {
  VideoCallSignalingContextType,
  VideoCallMediaContextType,
  VideoCallUIContextType,
  CalleeProfile,
} from "./types";
import {
  CALLS_V2_ENABLED,
  CALLS_V2_WS_URL,
  CALLS_V2_WS_URLS,
  SHOULD_USE_PROD_SFU_DEFAULTS,
  TURN_CREDENTIALS_EDGE_FNS,
  TURN_REFRESH_BEFORE_EXPIRY_SEC,
  REKEY_INTERVAL_MS,
  FRAME_E2EE_ADVERTISE_SFRAME,
  REQUIRE_SFRAME,
  MEDIA_BOOTSTRAP_MAX_RETRIES,
  expandWsEndpoints,
  isLocalEndpoint,
  getCallsConfigIssue,
  getCallsConfigToastDescription,
  hasInsertableStreamsSupport,
  makeRandomB64,
  getMediaPermissionToastPayload,
  getCallsBootstrapToastPayload,
  isMediaErrorForCall,
} from "./videoCallProvider.helpers";

const DECRYPTION_KEY_WAIT_TIMEOUT_MS = 15_000;
const DECRYPTION_KEY_WATCHDOG_INTERVAL_MS = 2_000;

// ─── VideoCallProvider ─────────────────────────────────────────────────────────
export function VideoCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pendingIncomingCall, setPendingIncomingCall] = useState<VideoCall | null>(null);
  const callsWsRef = useRef<CallsWsClient | null>(null);
  const sfuManagerRef = useRef<SfuMediaManager | null>(null);
  const sfuRouterRtpCapabilitiesRef = useRef<RtpCapabilities | null>(null);
  const callsWsCallIdRef = useRef<string | null>(null);
  const callsWsRoomRef = useRef<string | null>(null);
  const lastSnapshotRoomVersionRef = useRef<number>(-1);
  const callsWsMediaRoomRef = useRef<string | null>(null);
  const callsWsMediaBootstrapInFlightRoomRef = useRef<string | null>(null);
  const callsWsSendTransportRef = useRef<string | null>(null);
  const callsWsRecvTransportRef = useRef<string | null>(null);
  const localProducerIdsRef = useRef<{ audio: string | null; video: string | null }>({ audio: null, video: null });
  const activeCallsV2BootstrapCallIdRef = useRef<string | null>(null);
  const relayMetricsTimerRef = useRef<number | null>(null);
  const relayMetricsLastLogAtRef = useRef<number>(0);
  const relayMetricsLastSignatureRef = useRef<string>("");
  const rekeyTimerRef = useRef<number | null>(null);
  const e2eeEpochRef = useRef<number>(0);
  /**
   * Кэш TURN ICE-серверов, полученных от Edge Function `get-turn-credentials`.
   * Структурно совместим с RTCIceServer[] и mediasoup-client TransportOptions.iceServers.
   * Обновляется перед созданием каждого WS-соединения; TTL = 24 ч (сервер вернёт expiresAt).
   */
  const turnIceServersRef = useRef<RTCIceServer[] | null>(null);
  const turnIceExpiryRef = useRef<number>(0); // Unix seconds
  const e2eeLeaderDeviceRef = useRef<string | null>(null);
  const keyPackageNonceRef = useRef<Set<string>>(new Set());
  const keyPackageNonceTimestampsRef = useRef<Map<string, number>>(new Map());
  const callKeyExchangeRef = useRef<CallKeyExchange | null>(null);
  const callMediaEncryptionRef = useRef<CallMediaEncryption | null>(null);
  const rekeyMachineRef = useRef<RekeyStateMachine | null>(null);
  const epochGuardRef = useRef<EpochGuard | null>(null);
  const lastCallsBootstrapErrorRef = useRef<Error | null>(null);
  const consumerAddedUnsubRef = useRef<(() => void) | null>(null);
  const producerAddedUnsubRef = useRef<(() => void) | null>(null);
  const mediaBootstrapBlockedUntilRef = useRef<Map<string, number>>(new Map());
  const mediaBootstrapErrorLogAtRef = useRef<Map<string, number>>(new Map());
  const mediaBootstrapToastShownRef = useRef<Set<string>>(new Set());
  const mediaBootstrapRetryAttemptsRef = useRef<Map<string, number>>(new Map());
const startCallInFlightRef = useRef(false);
const answerCallInFlightRef = useRef(false);
const endCallInFlightRef = useRef(false);
const mediaBootstrapCompletedRef = useRef<Map<string, boolean>>(new Map());
const unansweredCallTimerRef = useRef<number | null>(null);

// E2EE pipe break recovery: stored consumer params for re-consume + debounce
   const consumerCreateParamsRef = useRef<Map<string, import('@/calls-v2/types').ConsumedPayload>>(new Map());
   const producerPeerKeyRef = useRef<Map<string, string>>(new Map());
   const peerUserIdByDeviceIdRef = useRef<Map<string, string>>(new Map());
   /** trackId → timestamp последней попытки recovery (debounce 10s) */
   const pipeBreakRetryAtRef = useRef<Map<string, number>>(new Map());
   /** trackId:direction → in-flight guard, чтобы исключить параллельные recovery гонки */
   const pipeBreakRecoveryInFlightRef = useRef<Set<string>>(new Set());
   /** Ref для функции recovery — заполняется после определения, вызывается из closure в CallMediaEncryption */
   const handleE2eePipeBreakRef = useRef<((info: import('@/lib/e2ee/insertableStreams').PipeBreakInfo) => void) | null>(null);

   /** trackId → deferred inbound receiver waiting for decryption key */
   const pendingReceiverTransformsRef = useRef<Map<string, {
     receiver: RTCRtpReceiver;
     peerKey: string;
     deferredAt: number;
     recoveryRequested: boolean;
   }>>(new Map());

   // UI-lock: keeps call UI visible even during transient status changes (permission prompts, etc.)
  const [isCallUiActive, setIsCallUiActive] = useState(false);
  const isCallUiActiveRef = useRef(false);
  const [isE2eeActive, setIsE2eeActive] = useState(false);

  // Profile of the callee shown immediately on the call screen before the call record loads from DB
  const [pendingCalleeProfile, setPendingCalleeProfile] = useState<CalleeProfile | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);

  // ─── Call FSM (primary state source) ──────────────────────────────────────
  const [callState, setCallState] = useState<CallState>("idle");
  const callStateRef = useRef<CallState>("idle");

  /**
   * Dispatch an FSM event. Updates both state and ref.
   * Returns the new state. On invalid transitions, logs a warning and returns current state.
   */
  const dispatchFsm = useCallback((event: CallEvent): CallState => {
    const prev = callStateRef.current;
    const next = fsmTransition(prev, event);
    if (next === null) {
      logger.warn("[CallFSM] invalid transition", { prev, event });
      return prev;
    }
    callStateRef.current = next;
    setCallState(next);
    logger.info("[CallFSM] transition", { prev, event, next });
    return next;
  }, []);

  const syncCallState = useCallback((next: CallState, reason: string) => {
    const prev = callStateRef.current;
    if (prev === next) return;
    callStateRef.current = next;
    setCallState(next);
    logger.warn("[CallFSM] forced sync", { prev, next, reason });
  }, []);
  // ────────────────────────────────────────────────────────────────────────────

  // Sync ref with state for callbacks
  useEffect(() => {
    isCallUiActiveRef.current = isCallUiActive;
  }, [isCallUiActive]);

  useEffect(() => {
    const issue = getCallsConfigIssue();
    logger.info("[VideoCallContext] calls-v2 config", {
      enabled: CALLS_V2_ENABLED,
      endpointCount: [CALLS_V2_WS_URL, ...CALLS_V2_WS_URLS].filter(Boolean).length,
      frameE2eeAdvertiseSframe: FRAME_E2EE_ADVERTISE_SFRAME,
      hasInsertableStreams: hasInsertableStreamsSupport(),
      usingProdSfuDefaults: SHOULD_USE_PROD_SFU_DEFAULTS,
      issue,
    });
    if (!hasInsertableStreamsSupport()) {
      logger.warn("[VideoCallContext] Insertable Streams not supported — E2EE media encryption unavailable in this browser");
      toast.warning("Шифрование недоступно", {
        description: "Ваш браузер не поддерживает Insertable Streams. Обновите браузер для E2EE-защиты звонков.",
        duration: 8000,
      });
    }
  }, []);

  const {
    status,
    currentCall,
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
    connectionState,
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
  } = useVideoCallSfu({
    onCallEnded: (call) => {
      logger.info("[VideoCallContext] Call ended:", call.id.slice(0, 8));
      dispatchFsm("CLEANUP_DONE");
      dispatchFsm("RESET");
      if (activeCallsV2BootstrapCallIdRef.current === call.id) {
        activeCallsV2BootstrapCallIdRef.current = null;
      }
      if (callsWsCallIdRef.current === call.id) {
        callsWsCallIdRef.current = null;
        callsWsRoomRef.current = null;
        lastSnapshotRoomVersionRef.current = -1;
        callsWsMediaRoomRef.current = null;
        callsWsMediaBootstrapInFlightRoomRef.current = null;
        callsWsSendTransportRef.current = null;
        callsWsRecvTransportRef.current = null;
      }
      closeCallsV2();
      setPendingIncomingCall(null);
      setPendingCalleeProfile(null);
      setIsCallUiActive(false); // Release UI-lock on call end
    },
    onRetryMediaBootstrap: async (call, stream) => {
      await bootstrapCallsV2Media(call, stream);
    },
    onLocalTrackReplaced: async (kind, track) => {
      const manager = sfuManagerRef.current;
      const resolution = manager
        ? resolveLocalProducerIdForTrack({
            declaredKind: kind,
            trackKind: track.kind,
            localProducerIds: localProducerIdsRef.current,
            getProducerKind: (producerId) => manager.getProducerKind(producerId),
          })
        : { producerId: null, resolvedKind: kind, usedFallbackKind: false };
      const producerId = resolution.producerId;
      if (!manager || !producerId) {
        logger.info("video_call_sfu.local_track_replace_deferred", {
          kind,
          resolvedKind: resolution.resolvedKind,
          usedFallbackKind: resolution.usedFallbackKind,
          trackKind: track.kind,
          hasManager: !!manager,
          hasProducerId: !!producerId,
        });
        return;
      }
      await manager.replaceProducerTrack(producerId, track);
    },
  });

  // ─── Legacy P2P engine ─────────────────────────────────────────────────────
  // Always instantiated (React hooks rules) but only active when SFU bootstrap fails.
  const [legacyEngineActive, setLegacyEngineActive] = useState(false);

  const {
    status: legacyStatus,
    currentCall: legacyCurrentCall,
    localStream: legacyLocalStream,
    remoteStream: legacyRemoteStream,
    isMuted: legacyIsMuted,
    isVideoOff: legacyIsVideoOff,
    connectionState: legacyConnectionState,
    startCall: legacyStartVideoCall,
    answerCall: legacyAnswerVideoCall,
    endCall: legacyEndVideoCall,
    toggleMute: legacyToggleMute,
    toggleVideo: legacyToggleVideo,
    retryWithFreshCredentials: legacyRetryWithFreshCredentials,
  } = useLegacyP2pVideoCall({
    onCallEnded: (call) => {
      logger.info("[VideoCallContext] Legacy P2P call ended:", call.id.slice(0, 8));
      setPendingIncomingCall(null);
      setPendingCalleeProfile(null);
      setIsCallUiActive(false);
      setLegacyEngineActive(false);
    },
  });
  // ──────────────────────────────────────────────────────────────────────────

  const closeCallsV2 = useCallback(() => {
    if (unansweredCallTimerRef.current) {
      window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = null;
    }
    if (relayMetricsTimerRef.current) {
      window.clearInterval(relayMetricsTimerRef.current);
      relayMetricsTimerRef.current = null;
    }
    relayMetricsLastLogAtRef.current = 0;
    relayMetricsLastSignatureRef.current = "";
    if (rekeyTimerRef.current) {
      window.clearInterval(rekeyTimerRef.current);
      rekeyTimerRef.current = null;
    }
    if (sfuManagerRef.current) {
      sfuManagerRef.current.close();
      sfuManagerRef.current = null;
    }
    localProducerIdsRef.current = { audio: null, video: null };
    if (consumerAddedUnsubRef.current) {
      consumerAddedUnsubRef.current();
      consumerAddedUnsubRef.current = null;
    }
    if (producerAddedUnsubRef.current) {
      producerAddedUnsubRef.current();
      producerAddedUnsubRef.current = null;
    }
    setRemoteMediaStream(null);
    setRemoteScreenStream(null);
    sfuRouterRtpCapabilitiesRef.current = null;
    // Destroy E2EE key material and media encryption transforms
    callKeyExchangeRef.current?.destroy();
    callKeyExchangeRef.current = null;
    callMediaEncryptionRef.current?.destroy();
    callMediaEncryptionRef.current = null;
    // Destroy rekey state machine + epoch guard
    rekeyMachineRef.current?.destroy();
    rekeyMachineRef.current = null;
    epochGuardRef.current?.markRoomLeft();
    epochGuardRef.current = null;
    if (callsWsRef.current) {
      callsWsRef.current.close();
      callsWsRef.current = null;
    }
    callsWsCallIdRef.current = null;
    callsWsRoomRef.current = null;
    lastSnapshotRoomVersionRef.current = -1;
    callsWsMediaRoomRef.current = null;
    callsWsMediaBootstrapInFlightRoomRef.current = null;
    callsWsSendTransportRef.current = null;
    callsWsRecvTransportRef.current = null;
    e2eeLeaderDeviceRef.current = null;
    keyPackageNonceRef.current.clear();
    keyPackageNonceTimestampsRef.current.clear();
    setIsE2eeActive(false);
    lastCallsBootstrapErrorRef.current = null;
    mediaBootstrapBlockedUntilRef.current.clear();
    mediaBootstrapErrorLogAtRef.current.clear();
    mediaBootstrapToastShownRef.current.clear();
    mediaBootstrapRetryAttemptsRef.current.clear();
    consumerCreateParamsRef.current.clear();
    producerPeerKeyRef.current.clear();
    pendingReceiverTransformsRef.current.clear();
    pipeBreakRetryAtRef.current.clear();
    pipeBreakRecoveryInFlightRef.current.clear();
  }, [setRemoteMediaStream]);

  /**
   * Fetch time-limited TURN credentials from Edge Function.
   *
   * Security:
   *  - Credentials are HMAC-SHA1 per RFC 5766 §9.2, TTL from server (default 24 h)
   *  - Cached in ref until 30 minutes before server-declared expiry
   *  - Fallback to null (STUN-only) if function unavailable — calls may still work without NAT
   *  - No credentials stored in localStorage/sessionStorage — memory-only
   *
   * Race condition safety:
   *  - Multiple concurrent callers may execute this simultaneously; since all write the same
   *    data and it's a ref (not state), there is no torn read / UI inconsistency risk.
   */
  const fetchTurnIceServers = useCallback(async (): Promise<RTCIceServer[] | null> => {
    const nowSec = Math.floor(Date.now() / 1000);

    // Return cached if still fresh (with 30-min safety margin)
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
      if (TURN_CREDENTIALS_URL) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const accessToken = sessionData.session?.access_token;
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            "x-turn-nonce": requestId,
            "x-request-id": requestId,
          };
          if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
          if (TURN_CREDENTIALS_API_KEY) headers.apikey = TURN_CREDENTIALS_API_KEY;

          const response = await fetch(TURN_CREDENTIALS_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({ requestId, nonce: requestId }),
          });

          if (response.ok) {
            data = await response.json().catch(() => ({}));
            invokeError = null;
          } else {
            const text = await response.text().catch(() => "");
            invokeError = new Error(`TURN endpoint ${response.status}: ${text}`);
            logger.warn("[VideoCallContext] TURN credentials URL failed, fallback to edge function", {
              status: response.status,
            });
          }
        } catch (customUrlError) {
          invokeError = customUrlError;
          logger.warn("[VideoCallContext] TURN credentials URL exception, fallback to edge function", customUrlError);
        }
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      const runtimeConfig = getSupabaseRuntimeConfig();
      const publishableKey = String(runtimeConfig.supabasePublishableKey || "").trim();

      if (!data) {
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
            logger.warn("[VideoCallContext] TURN credentials edge function failed", { fn, error: result.error });
          } catch (fnError) {
            invokeError = fnError;
            logger.warn("[VideoCallContext] TURN credentials edge function invoke exception", { fn, error: fnError });
          }
        }
      }

      if (invokeError) {
        logger.warn("[VideoCallContext] TURN credentials fetch failed (STUN-only fallback):", invokeError);
        return null;
      }

      const parsed = data as {
        iceServers?: RTCIceServer[];
        ttl?: number;
        expiresAt?: number;
        error?: string;
      } | null;

      if (parsed?.error) {
        logger.warn("[VideoCallContext] turn-credentials server error:", parsed.error);
        return null;
      }

      if (!Array.isArray(parsed?.iceServers) || parsed.iceServers.length === 0) {
        logger.warn("[VideoCallContext] turn-credentials returned empty iceServers");
        return null;
      }

      // Persist in refs — never in React state (avoids re-render, credentials are not UI)
      turnIceServersRef.current = parsed.iceServers;
      turnIceExpiryRef.current = typeof parsed.expiresAt === "number"
        ? parsed.expiresAt
        : nowSec + (typeof parsed.ttl === "number" ? parsed.ttl : 86_400);

      logger.info(
        "[VideoCallContext] TURN credentials refreshed",
        { count: parsed.iceServers.length, expiresAt: turnIceExpiryRef.current }
      );

      return parsed.iceServers;
    } catch (err) {
      logger.warn("[VideoCallContext] turn-credentials fetch exception (STUN-only fallback):", err);
      return null;
    }
}, []);

  const requestDeferredKeyDiscovery = useCallback(async (
    client: CallsWsClient,
    roomId: string,
    epoch: number,
  ): Promise<void> => {
    const leaderDeviceId = e2eeLeaderDeviceRef.current;
    const myDeviceId = getStableCallsDeviceId();
    if (!leaderDeviceId || leaderDeviceId === myDeviceId) return;

    const kx = callKeyExchangeRef.current;
    if (!kx || !user) return;

    const senderPublicKey = await kx.getPublicKeyBase64();
    const sessionIdForDiscovery = kx.getSessionId();
    const identityKeyPair = await getOrCreateIdentityKeyPair();
    const sigBytes = await signIdentity(
      identityKeyPair.privateKey,
      user.id,
      myDeviceId,
      sessionIdForDiscovery,
      senderPublicKey,
      senderPublicKey,
      epoch,
      "",
    );
    const identityPubKeyJwk = await exportEcdsaPublicKey(identityKeyPair.publicKey);
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    const mySigningPublicKey = await kx.getSigningPublicKeyBase64();

    await client.keyPackage({
      roomId,
      fromDeviceId: myDeviceId,
      toDeviceId: leaderDeviceId,
      targetDeviceId: leaderDeviceId,
      epoch,
      keyPackageType: "DISCOVERY",
      discoveryNonce: crypto.randomUUID(),
      ciphertext: senderPublicKey,
      sig: sigB64,
      senderPublicKey,
      senderSigningPublicKey: mySigningPublicKey,
      salt: "",
      senderIdentity: {
        userId: user.id,
        deviceId: myDeviceId,
        sessionId: sessionIdForDiscovery,
        identityPubKeyJwk,
      },
    });
  }, [
    callKeyExchangeRef,
    e2eeLeaderDeviceRef,
    user,
  ]);

   const { ensureCallsV2Connected, bootstrapCallsV2Room } = useCallsV2Bootstrap({
    user,
    fetchTurnIceServers,
    setPendingIncomingCall,
    callsWsRef,
    sfuManagerRef,
    sfuRouterRtpCapabilitiesRef,
    callsWsCallIdRef,
    callsWsRoomRef,
    lastSnapshotRoomVersionRef,
    callsWsMediaRoomRef,
    callsWsMediaBootstrapInFlightRoomRef,
    callsWsSendTransportRef,
    callsWsRecvTransportRef,
    rekeyTimerRef,
    e2eeEpochRef,
    turnIceServersRef,
    e2eeLeaderDeviceRef,
    keyPackageNonceRef,
    keyPackageNonceTimestampsRef,
    callKeyExchangeRef,
    callMediaEncryptionRef,
    rekeyMachineRef,
    epochGuardRef,
    lastCallsBootstrapErrorRef,
    producerPeerKeyRef,
    peerUserIdByDeviceIdRef,
    handleE2eePipeBreakRef,
    producerAddedUnsubRef,
    isCallStillActiveForBootstrap: (callId) => activeCallsV2BootstrapCallIdRef.current === callId,
    onE2eeActivated: () => setIsE2eeActive(true),
    onDecryptionKeyReady: (peerKey) => {
      const enc = callMediaEncryptionRef.current;
      if (!enc) return;
      for (const [trackId, pending] of pendingReceiverTransformsRef.current) {
        if (enc.hasDecryptionKeyForPeer(pending.peerKey)) {
          try {
            enc.setupReceiverTransform(pending.receiver, pending.peerKey, trackId);
            pendingReceiverTransformsRef.current.delete(trackId);
            logger.info("[VideoCallContext] E2EE receiver transform re-applied after key arrival", { trackId, peerKey });
          } catch (e) {
            logger.error("[VideoCallContext] E2EE receiver transform re-apply failed", { trackId, error: e instanceof Error ? e.message : String(e) });
          }
        }
      }
    },
  });

   const { rebuildRemoteStream, bootstrapCallsV2Media } = useCallsV2MediaBootstrap({
     user,
     ensureCallsV2Connected,
     callsWsRef,
     sfuManagerRef,
     sfuRouterRtpCapabilitiesRef,
     callsWsCallIdRef,
     callsWsRoomRef,
     callsWsMediaRoomRef,
     callsWsMediaBootstrapInFlightRoomRef,
     callsWsSendTransportRef,
     callsWsRecvTransportRef,
     turnIceServersRef,
     epochGuardRef,
     e2eeEpochRef,
     callKeyExchangeRef,
     callMediaEncryptionRef,
     localProducerIdsRef,
     consumerAddedUnsubRef,
     consumerCreateParamsRef,
     producerPeerKeyRef,
     pendingReceiverTransformsRef,
     mediaBootstrapBlockedUntilRef,
     mediaBootstrapErrorLogAtRef,
     mediaBootstrapToastShownRef,
     mediaBootstrapCompletedRef,
     isScreenSharing,
     screenStream,
     setRemoteMediaStream,
     setRemoteScreenStream,
     callStateRef,
     dispatchFsm,
     isCallConnecting,
     canPromoteInCall: () => isCallActive(callState) || isCallConnecting(callState),
     markMediaBootstrapProgress,
     markMediaBootstrapFailed,
   });

  useE2eePipeBreakRecovery(
    sfuManagerRef,
    callMediaEncryptionRef,
    callsWsRef,
    callsWsMediaRoomRef,
    consumerCreateParamsRef,
    localProducerIdsRef,
    producerPeerKeyRef,
    pipeBreakRetryAtRef,
    pipeBreakRecoveryInFlightRef,
    handleE2eePipeBreakRef,
    rebuildRemoteStream,
  );

  useEffect(() => {
    if (!REQUIRE_SFRAME) return;

    const timer = window.setInterval(() => {
      const pending = pendingReceiverTransformsRef.current;
      if (pending.size === 0) return;

      const now = Date.now();
      for (const [trackId, item] of pending) {
        if (item.recoveryRequested) continue;
        if (now - item.deferredAt < DECRYPTION_KEY_WAIT_TIMEOUT_MS) continue;

        item.recoveryRequested = true;
        pending.set(trackId, item);

        logger.warn("video_call_context.e2ee_key_missing_timeout", {
          trackId,
          peerKey: item.peerKey,
          waitedMs: now - item.deferredAt,
          timeoutMs: DECRYPTION_KEY_WAIT_TIMEOUT_MS,
        });

        const ws = callsWsRef.current;
        const roomId = callsWsRoomRef.current;
        const epoch = e2eeEpochRef.current;
        if (ws && roomId && ws.connectionState === "connected" && Number.isFinite(epoch) && epoch >= 0) {
          void requestDeferredKeyDiscovery(ws, roomId, epoch).then(() => {
            logger.info("[VideoCallContext] E2EE deferred key discovery requested", {
              trackId,
              peerKey: item.peerKey,
              epoch,
            });
          }).catch((error) => {
            logger.warn("[VideoCallContext] E2EE deferred key discovery failed", {
              trackId,
              peerKey: item.peerKey,
              epoch,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }

        pending.delete(trackId);
        handleE2eePipeBreakRef.current?.({
          trackId,
          direction: "decrypt",
          peerId: item.peerKey,
        });
      }
    }, DECRYPTION_KEY_WATCHDOG_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    callsWsRef,
    callsWsRoomRef,
    e2eeEpochRef,
    pendingReceiverTransformsRef,
    requestDeferredKeyDiscovery,
  ]);

  const { incomingCall: detectedIncomingCall, clearIncomingCall } = useIncomingCalls({
    onIncomingCall: (call) => {
      const currentEngineStatus = legacyEngineActive ? legacyStatus : status;
      // Don't show incoming call if we're already in a call or UI-lock is active
      if (currentEngineStatus !== "idle" || isCallUiActiveRef.current) {
        logger.info("[VideoCallContext] Already in call or UI active, ignoring incoming");
        return;
      }
      logger.info("[VideoCallContext] Setting pending incoming call:", call.id.slice(0, 8));
      dispatchFsm("INCOMING_OFFER");
      setPendingIncomingCall(call);
    },
  });

  // Sync incoming call state — show incoming call when truly idle without UI-lock
  const activeStatus = legacyEngineActive ? legacyStatus : status;
  const incomingCall = (activeStatus === "idle" && !isCallUiActive) ? pendingIncomingCall : null;

  // State-change-only debug log (throttled, avoids render-loop flood)
  const lastStateSignatureRef = useRef("");
  useEffect(() => {
    const sig = [status, !!currentCall, !!pendingIncomingCall, !!detectedIncomingCall, isCallUiActive].join(":");
    if (sig === lastStateSignatureRef.current) return;
    lastStateSignatureRef.current = sig;
    logger.info("[VideoCallContext] State:", {
      status,
      hasCurrentCall: !!currentCall,
      hasPendingIncoming: !!pendingIncomingCall,
      hasDetectedIncoming: !!detectedIncomingCall,
      isCallUiActive,
    });
  }, [status, currentCall, pendingIncomingCall, detectedIncomingCall, isCallUiActive]);

  // ─── FSM: promote to in_call when legacy connectionState becomes "connected" ─
  // Catches the fallback timer path in useVideoCallSfu that promotes connectionState
  // without going through rebuildRemoteStream.
  useEffect(() => {
    if (legacyEngineActive) return;
    if (connectionState !== "connected") return;
    if (status !== "connected") return;
    const s = callStateRef.current;
    if (isCallConnecting(s)) {
      dispatchFsm("PROMOTE_IN_CALL");
    }
  }, [connectionState, legacyEngineActive, status, dispatchFsm]);

  // ─── FSM drift detection (legacy vs FSM) ───────────────────────────────────
  useEffect(() => {
    if (legacyEngineActive) return; // FSM doesn't track legacy P2P
    const expected = fromLegacyStatus(status, connectionState);
    if (expected !== callState) {
      logger.warn("[CallFSM:drift]", { expected, actual: callState, status, connectionState });

      // If media/signaling recovered after transient bootstrap failure,
      // keep UI/FSM aligned with actual call connectivity.
      if (
        callState === "failed"
        && expected !== "failed"
        && expected !== "idle"
        && expected !== "ended"
      ) {
        syncCallState(expected, "legacy_status_drift_recovery");
      }
    }
  }, [status, connectionState, legacyEngineActive, callState, syncCallState]);
  // ────────────────────────────────────────────────────────────────────────────

  const isExpectedCallsBootstrapFailure = (error: unknown): boolean => {
    const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
    return (
      message.includes("calls_v2_room_bootstrap_failed") ||
      message.includes("ws connection error") ||
      message.includes("websocket") ||
      message.includes("network") ||
      message.includes("timed out")
    );
  };

  const bootstrapCallsV2RoomWithRetry = useCallback(async (
    call: VideoCall & { calls_v2_room_id?: string | null; calls_v2_join_token?: string | null },
    role: "caller" | "callee",
    maxAttempts = 3,
  ): Promise<boolean> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const ok = await bootstrapCallsV2Room(call, role);
      if (ok) return true;
      if (attempt >= maxAttempts) return false;

      logger.warn("[VideoCallContext] calls_v2 bootstrap retry scheduled", {
        callId: call.id,
        role,
        attempt,
      });

      // P1-7 fix: if WS client is in a broken state, close it so ensureCallsV2Connected
      // creates a fresh connection on the next attempt instead of reusing a failed one.
      const ws = callsWsRef.current;
      if (ws && ws.connectionState !== "connected") {
        ws.close();
        callsWsRef.current = null;
      }

      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 1000 * attempt);
      });
    }
    return false;
  }, [bootstrapCallsV2Room, callsWsRef]);

  const answerCall = useCallback(async (call: VideoCall) => {
    if (answerCallInFlightRef.current) {
      logger.warn("[VideoCallContext] answerCall ignored: already in progress", { callId: call.id });
      return;
    }
    answerCallInFlightRef.current = true;
    if (unansweredCallTimerRef.current) {
      window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = null;
    }

    const configIssue = getCallsConfigIssue();
    if (configIssue) {
      logger.error("[VideoCallContext] answerCall blocked by config:", configIssue);
      toast.error("Звонок недоступен", {
        description: getCallsConfigToastDescription(configIssue),
        duration: 6000,
      });
      answerCallInFlightRef.current = false;
      return;
    }

    logger.info("[VideoCallContext] answerCall: Activating UI-lock BEFORE getUserMedia");
    setIsCallUiActive(true); // Activate UI-lock BEFORE getUserMedia
    setPendingIncomingCall(null);
    clearIncomingCall();
    // B: notify caller via WS relay
    const wsForAccept = callsWsRef.current;
    if (wsForAccept && call?.caller_id) {
      void wsForAccept.callAccept({ to: call.caller_id, callId: call.id })
        .catch((e) => logger.warn("[VideoCallContext] callAccept WS send failed", e));
    }

    try {
      await answerVideoCall(call);
      activeCallsV2BootstrapCallIdRef.current = call.id;
      dispatchFsm("CALLEE_ACCEPT");

      // Refresh call row to pick up caller-persisted calls-v2 room metadata.
      let resolvedCall = call as VideoCall & {
        calls_v2_room_id?: string | null;
        calls_v2_join_token?: string | null;
      };
      try {
        const { data: freshCall } = await supabase
          .from("video_calls")
          .select("id, calls_v2_room_id, calls_v2_join_token")
          .eq("id", call.id)
          .maybeSingle();
        if (freshCall) {
          resolvedCall = {
            ...resolvedCall,
            calls_v2_room_id: freshCall.calls_v2_room_id ?? null,
            calls_v2_join_token: freshCall.calls_v2_join_token ?? null,
          };
        }
      } catch (roomHintError) {
        logger.warn("[VideoCallContext] answerCall room-hints refresh failed", roomHintError);
      }

      // In unstable production networks the caller may persist room hints slightly later.
      // Give DB a short grace window before concluding "no SFU hints" in sfu_only mode.
      if (!resolvedCall.calls_v2_room_id) {
        for (let attempt = 1; attempt <= 4 && !resolvedCall.calls_v2_room_id; attempt++) {
          if (activeCallsV2BootstrapCallIdRef.current !== call.id) {
            logger.info("[VideoCallContext] answerCall delayed room-hints retry aborted: stale call", { callId: call.id });
            return;
          }
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 1200 * attempt);
          });
          if (activeCallsV2BootstrapCallIdRef.current !== call.id) {
            logger.info("[VideoCallContext] answerCall delayed room-hints fetch skipped: stale call", { callId: call.id });
            return;
          }
          try {
            const { data: delayedHints } = await supabase
              .from("video_calls")
              .select("id, calls_v2_room_id, calls_v2_join_token")
              .eq("id", call.id)
              .maybeSingle();
            if (delayedHints?.calls_v2_room_id) {
              resolvedCall = {
                ...resolvedCall,
                calls_v2_room_id: delayedHints.calls_v2_room_id,
                calls_v2_join_token: delayedHints.calls_v2_join_token ?? null,
              };
              logger.info("[VideoCallContext] answerCall room-hints resolved after retry", {
                callId: call.id,
                attempt,
              });
            }
          } catch (retryError) {
            logger.warn("[VideoCallContext] answerCall delayed room-hints fetch failed", retryError);
          }
        }
      }

      const roomBootstrapOk = await bootstrapCallsV2RoomWithRetry(resolvedCall, "callee");
      if (roomBootstrapOk && isCallConnecting(callStateRef.current)) dispatchFsm("BOOTSTRAP_OK");
      if (!roomBootstrapOk) {
        if (activeCallsV2BootstrapCallIdRef.current !== call.id) {
          logger.info("[VideoCallContext] answerCall bootstrap result ignored: stale call", { callId: call.id });
          return;
        }

        // Detect whether the caller used legacy P2P (no SFU room hints were written).
        // When calls_v2_room_id is absent the caller launched a P2P call — match the protocol.
        const hasSfuRoomHints = !!resolvedCall.calls_v2_room_id;

        if (!hasSfuRoomHints && CALL_ENGINE_MODE === "compatibility") {
          // Legacy P2P fallback for callee — only in compatibility mode.
          // In sfu_only mode this branch is unreachable; callers always write room hints.
          logger.info("[VideoCallContext] Answering legacy P2P call (no SFU room hints, compatibility mode)");
          releaseMediaWithoutDbUpdate();
          closeCallsV2();
          setLegacyEngineActive(true);
          try {
            await legacyAnswerVideoCall(call);
          } catch (legacyErr) {
            logger.error("[VideoCallContext] Legacy P2P answerCall failed", legacyErr);
            setIsCallUiActive(false);
            setLegacyEngineActive(false);
            if (isMediaErrorForCall(legacyErr)) {
              const toastPayload = getMediaPermissionToastPayload(legacyErr, call.call_type === "video" ? "video" : "audio");
              toast.error(toastPayload.title, { description: toastPayload.description, duration: 5000 });
            } else {
              toast.error("Не удалось принять звонок", {
                description: "Ошибка сети или сервиса звонков. Попробуйте еще раз",
                duration: 5000,
              });
            }
          }
          return;
        }

        // SFU bootstrap failed (or no room hints in sfu_only mode) → fail-closed.
        if (!hasSfuRoomHints) {
          logger.error("[VideoCallContext] No SFU room hints in sfu_only mode — cannot answer call");
        }
        await endVideoCall("ended");
        closeCallsV2();
        setIsCallUiActive(false);
        const toastPayload = getCallsBootstrapToastPayload(lastCallsBootstrapErrorRef.current);
        toast.error(toastPayload.title, {
          description: toastPayload.description,
          duration: 5000,
        });
        return;
      }
    } catch (err) {
      dispatchFsm("ERROR");
      if (isExpectedCallsBootstrapFailure(err)) {
        logger.warn("[VideoCallContext] answerCall bootstrap/connect failed", err);
      } else {
        logger.error("[VideoCallContext] answerCall error:", err);
      }
      if (isMediaErrorForCall(err)) {
        const toastPayload = getMediaPermissionToastPayload(err, call.call_type === "video" ? "video" : "audio");
        toast.error(toastPayload.title, {
          description: toastPayload.description,
          duration: 5000,
        });
      } else {
        toast.error("Не удалось принять звонок", {
          description: "Ошибка сети или сервиса звонков. Попробуйте еще раз",
          duration: 5000,
        });
      }
      setIsCallUiActive(false); // Release UI-lock on error
    } finally {
      answerCallInFlightRef.current = false;
    }
  }, [answerVideoCall, bootstrapCallsV2RoomWithRetry, clearIncomingCall, endVideoCall,
    closeCallsV2, releaseMediaWithoutDbUpdate, legacyAnswerVideoCall, dispatchFsm]);

  const declineCall = useCallback(async () => {
    dispatchFsm("CALL_END");
    if (incomingCall || pendingIncomingCall) {
      const callToDecline = incomingCall || pendingIncomingCall;
      if (!callToDecline) return;
      // B: notify caller via WS relay before DB update
      const wsForDecline = callsWsRef.current;
      if (wsForDecline && callToDecline.caller_id) {
        void wsForDecline.callDecline({ to: callToDecline.caller_id, callId: callToDecline.id })
          .catch((e) => logger.warn("[VideoCallContext] callDecline WS send failed", e));
      }

      const { error } = await supabase
        .from("video_calls")
        .update({
          status: "declined",
          ended_at: new Date().toISOString(),
        })
        .eq("id", callToDecline.id);
      if (error) {
        logger.error("[VideoCallContext] declineCall update failed", error);
      }

      setPendingIncomingCall(null);
      clearIncomingCall();
      setIsCallUiActive(false); // Release UI-lock
    }
  }, [incomingCall, pendingIncomingCall, clearIncomingCall, dispatchFsm]);

  const endCall = useCallback(async () => {
    if (endCallInFlightRef.current) {
      logger.warn("[VideoCallContext] endCall ignored: already in progress");
      return;
    }
    endCallInFlightRef.current = true;
    if (unansweredCallTimerRef.current) {
      window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = null;
    }

    logger.info("[VideoCallContext] endCall called");
    try {
      dispatchFsm("CALL_END");
      // B: send hangup via WS relay so the peer knows immediately
      const callForHangup = currentCall ?? legacyCurrentCall;
      const wsForHangup = callsWsRef.current;
      if (wsForHangup && callForHangup) {
        const peerId = callForHangup.caller_id === user?.id
          ? callForHangup.callee_id
          : callForHangup.caller_id;
        void wsForHangup.callHangup({ to: peerId, callId: callForHangup.id })
          .catch((e) => logger.warn("[VideoCallContext] callHangup WS send failed", e));
      }
      if (legacyEngineActive) {
        if (legacyCurrentCall) {
          await legacyEndVideoCall("ended");
        } else if (incomingCall || pendingIncomingCall) {
          await declineCall();
        }
        setLegacyEngineActive(false);
      } else {
        if (currentCall) {
          await endVideoCall("ended");
        } else if (incomingCall || pendingIncomingCall) {
          await declineCall();
        }
        closeCallsV2();
      }
      setIsCallUiActive(false); // Release UI-lock
    } finally {
      endCallInFlightRef.current = false;
    }
  }, [legacyEngineActive, currentCall, legacyCurrentCall, incomingCall, pendingIncomingCall, endVideoCall, legacyEndVideoCall, declineCall, closeCallsV2, dispatchFsm, user?.id]);

  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio",
    calleeProfile?: CalleeProfile
  ) => {
    if (!user) return null;

    if (startCallInFlightRef.current) {
      logger.warn("[VideoCallContext] startCall ignored: already in progress", { calleeId, callType });
      return null;
    }
    startCallInFlightRef.current = true;

    const configIssue = getCallsConfigIssue();
    if (configIssue) {
      logger.error("[VideoCallContext] startCall blocked by config:", configIssue);
      toast.error("Не удалось начать звонок", {
        description: getCallsConfigToastDescription(configIssue),
        duration: 6000,
      });
      startCallInFlightRef.current = false;
      return null;
    }

    logger.info("[VideoCallContext] startCall: Activating UI-lock BEFORE startVideoCall");
    if (calleeProfile) setPendingCalleeProfile(calleeProfile);
    setIsCallUiActive(true); // Activate UI-lock BEFORE getUserMedia (happens inside startVideoCall)

    try {
      const result = await startVideoCall(calleeId, conversationId, callType);
      if (result) dispatchFsm("CALLER_INITIATE");
      if (!result) {
        logger.error("[VideoCallContext] startVideoCall returned null unexpectedly — releasing UI-lock");
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        toast.error("Не удалось начать звонок", {
          description: "Проверьте сеть и попробуйте снова",
          duration: 5000,
        });
        return null;
      }
      activeCallsV2BootstrapCallIdRef.current = result.id;

      // Auto-end unanswered outgoing call after 60s
      if (unansweredCallTimerRef.current) window.clearTimeout(unansweredCallTimerRef.current);
      unansweredCallTimerRef.current = window.setTimeout(() => {
        unansweredCallTimerRef.current = null;
        if (callStateRef.current === "outgoing_ringing" || callStateRef.current === "bootstrapping") {
          logger.info("[VideoCallContext] Unanswered call timeout — ending call");
          void endVideoCall("ended").then(() => closeCallsV2());
          setPendingCalleeProfile(null);
          setIsCallUiActive(false);
          dispatchFsm("CALL_END");
          toast.info("Нет ответа", { duration: 3000 });
        }
      }, 60_000);

      // B: deliver call.invite via WS relay so caller doesn't need DB polling
      const ws = callsWsRef.current ?? await ensureCallsV2Connected();
      if (ws) {
        void ws.callInvite({
          to: calleeId,
          callId: result.id,
          callType,
          conversationId: conversationId ?? undefined,
        }).catch((e) => logger.warn("[VideoCallContext] callInvite WS send failed", e));
      }
      dispatchFsm("BOOTSTRAP_START");
      const roomBootstrapOk = await bootstrapCallsV2RoomWithRetry(result, "caller");
      if (roomBootstrapOk && callStateRef.current === "bootstrapping") dispatchFsm("BOOTSTRAP_OK");
      if (!roomBootstrapOk) {
        if (activeCallsV2BootstrapCallIdRef.current !== result.id) {
          logger.info("[VideoCallContext] startCall bootstrap result ignored: stale call", { callId: result.id });
          return null;
        }

        dispatchFsm("ERROR");
        // P0: Fail-closed — NO auto-fallback to legacy P2P.
        // Silent downgrade from SFU+E2EE to legacy P2P creates split-brain:
        // two different media engines, security postures, and state machines.
        // If SFU is down, the call must not start rather than silently degrade.
        logger.error("[VideoCallContext] SFU bootstrap failed for caller — fail-closed, no P2P fallback");
        releaseMediaWithoutDbUpdate();
        await endVideoCall("ended");
        closeCallsV2();
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        const toastPayload = getCallsBootstrapToastPayload(lastCallsBootstrapErrorRef.current);
        toast.error(toastPayload.title, {
          description: toastPayload.description,
          duration: 5000,
        });
        return null;
      }
      return result;
    } catch (err) {
      dispatchFsm("ERROR");
      if (isExpectedCallsBootstrapFailure(err)) {
        logger.warn("[VideoCallContext] startCall bootstrap/connect failed", err);
      } else {
        logger.error("[VideoCallContext] startCall error:", err);
      }
      setPendingCalleeProfile(null);
      setIsCallUiActive(false); // Release UI-lock on error
      if (isMediaErrorForCall(err)) {
        const toastPayload = getMediaPermissionToastPayload(err, callType);
        toast.error(toastPayload.title, {
          description: toastPayload.description,
          duration: 4000,
        });
      } else {
        toast.error("Не удалось начать звонок", {
          description: "Ошибка сети или сервиса звонков. Попробуйте еще раз",
          duration: 5000,
        });
      }
      return null;
    } finally {
      startCallInFlightRef.current = false;
    }
  }, [user, startVideoCall, bootstrapCallsV2RoomWithRetry, endVideoCall, closeCallsV2,
    releaseMediaWithoutDbUpdate, dispatchFsm, ensureCallsV2Connected]);

  const retryConnection = useCallback(async () => {
    if (legacyEngineActive) {
      await legacyRetryWithFreshCredentials();
      return;
    }
    const configIssue = getCallsConfigIssue();
    if (configIssue) {
      logger.error("[VideoCallContext] retryConnection blocked by config:", configIssue);
      toast.error("Повторное подключение недоступно", {
        description: getCallsConfigToastDescription(configIssue),
        duration: 6000,
      });
      return;
    }

    if (callStateRef.current === "failed") {
      const mapped = fromLegacyStatus(status, connectionState);
      const recoveredState: CallState =
        mapped === "failed" || mapped === "idle" || mapped === "ended"
          ? "transport_connecting"
          : mapped;
      syncCallState(recoveredState, "manual_retry");
    }

    await retryWithFreshCredentials();
  }, [
    legacyEngineActive,
    legacyRetryWithFreshCredentials,
    retryWithFreshCredentials,
    status,
    connectionState,
    syncCallState,
  ]);

  useEffect(() => {
    if (!currentCall || !localStream) return;
    void bootstrapCallsV2Media(currentCall, localStream);
  }, [currentCall, localStream, bootstrapCallsV2Media, dispatchFsm]);

   useEffect(() => {
     if (!currentCall || !localStream) return;

     if (!mediaBootstrapRetryAttemptsRef.current.has(currentCall.id)) {
       mediaBootstrapRetryAttemptsRef.current.set(currentCall.id, 0);
     }

     const retryTimer = window.setInterval(() => {
       const call = currentCall;
       const stream = localStream;
       if (!call || !stream) return;

       const currentAttempts = mediaBootstrapRetryAttemptsRef.current.get(call.id) ?? 0;
       if (currentAttempts >= MEDIA_BOOTSTRAP_MAX_RETRIES) {
         window.clearInterval(retryTimer);
         logger.error("[VideoCallContext] calls-v2 media-bootstrap retries exhausted", {
           callId: call.id,
           maxRetries: MEDIA_BOOTSTRAP_MAX_RETRIES,
           wsCallId: callsWsCallIdRef.current,
           wsRoomId: callsWsRoomRef.current,
           mediaRoomId: callsWsMediaRoomRef.current,
         });
         dispatchFsm("ERROR");
         void endVideoCall("ended").catch((error) => {
           logger.warn("[VideoCallContext] endVideoCall failed after media-bootstrap retries exhausted", error);
         });
         closeCallsV2();
         toast.error("Сервер звонков недоступен", {
           description: "Не удалось инициализировать медиа после нескольких попыток. Попробуйте завершить звонок и начать заново.",
           duration: 5000,
         });
         return;
       }

       if (callsWsCallIdRef.current !== call.id) return;
       if (!callsWsRoomRef.current) return;

       // Check if media bootstrap has completed successfully instead of comparing room IDs
       if (mediaBootstrapCompletedRef.current.get(call.id)) {
         mediaBootstrapRetryAttemptsRef.current.delete(call.id);
         window.clearInterval(retryTimer);
         return;
       }

       mediaBootstrapRetryAttemptsRef.current.set(call.id, currentAttempts + 1);
       void bootstrapCallsV2Media(call, stream);
     }, 2000);

     return () => {
       window.clearInterval(retryTimer);
     };
   }, [currentCall, localStream, bootstrapCallsV2Media, dispatchFsm, endVideoCall, closeCallsV2]);

  useEffect(() => {
    if (legacyEngineActive) return;
    if (!currentCall?.id) return;

    if (relayMetricsTimerRef.current) {
      window.clearInterval(relayMetricsTimerRef.current);
      relayMetricsTimerRef.current = null;
    }

    relayMetricsTimerRef.current = window.setInterval(() => {
      const manager = sfuManagerRef.current;
      if (!manager) return;

      void manager.sampleRelayMetrics()
        .then((snapshot) => {
          if (!snapshot) return;

          const now = Date.now();
          const signature = [
            snapshot.aggregate.relay_fallback_count,
            snapshot.aggregate.total_samples,
            snapshot.send?.isRelaySelected ? 1 : 0,
            snapshot.recv?.isRelaySelected ? 1 : 0,
          ].join(":");

          if (
            signature !== relayMetricsLastSignatureRef.current ||
            now - relayMetricsLastLogAtRef.current > 15000
          ) {
            relayMetricsLastSignatureRef.current = signature;
            relayMetricsLastLogAtRef.current = now;
            logger.info("video_call_context.relay_metrics", {
              callId: currentCall.id.slice(0, 8),
              sendRelay: !!snapshot.send?.isRelaySelected,
              recvRelay: !!snapshot.recv?.isRelaySelected,
              relayUsageRate: snapshot.aggregate.relay_usage_rate,
              relayFallbackCount: snapshot.aggregate.relay_fallback_count,
              totalSamples: snapshot.aggregate.total_samples,
              avgBytesOverRelay: snapshot.aggregate.avg_bytes_over_relay,
            });
          }
        })
        .catch((error) => {
          logger.debug("video_call_context.relay_metrics_sample_failed", { error });
        });
    }, 5000);

    return () => {
      if (relayMetricsTimerRef.current) {
        window.clearInterval(relayMetricsTimerRef.current);
        relayMetricsTimerRef.current = null;
      }
    };
  }, [legacyEngineActive, currentCall?.id]);

  useEffect(() => {
    return onNativeCallAction(async (action) => {
      const actionType = action.type;
      const incomingLike = pendingIncomingCall ?? incomingCall;
      const matchesIncoming = incomingLike?.id === action.callId;
      const matchesCurrent = currentCall?.id === action.callId;

      if ((actionType === "accept" || actionType === "answer") && incomingLike && matchesIncoming) {
        try {
          await answerCall(incomingLike);
        } catch (err) {
          logger.error("[VideoCallContext] answerCall failed in native handler", err);
        }
        return;
      }

      if ((actionType === "decline" || actionType === "reject") && matchesIncoming) {
        try {
          await declineCall();
        } catch (err) {
          logger.error("[VideoCallContext] declineCall failed in native handler", err);
        }
        return;
      }

      if ((actionType === "end" || actionType === "disconnect") && matchesCurrent) {
        logger.warn("[VideoCallContext] Native end/disconnect received — applying local fail-closed teardown", {
          callId: action.callId,
          actionType,
          status,
          connectionState,
        });

        dispatchFsm("CALL_END");
        releaseMediaWithoutDbUpdate();
        closeCallsV2();
        dispatchFsm("CLEANUP_DONE");
        dispatchFsm("RESET");
        setPendingIncomingCall(null);
        setPendingCalleeProfile(null);
        setIsCallUiActive(false);
        return;
      }
    });
  }, [
    pendingIncomingCall,
    incomingCall,
    currentCall,
    answerCall,
    declineCall,
    status,
    connectionState,
    dispatchFsm,
    releaseMediaWithoutDbUpdate,
    closeCallsV2,
  ]);

  useEffect(() => {
    return () => {
      closeCallsV2();
    };
  }, [closeCallsV2]);

  // ─── Build context values ───────────────────────────────────────────────────
  // Each value object is reconstructed only when its specific slice of state changes.
  // This ensures that unrelated context consumers do not re-render.

  const signalingValue: VideoCallSignalingContextType = useMemo(() => ({
    status: activeStatus,
    callState,
    currentCall: legacyEngineActive ? legacyCurrentCall : currentCall,
    incomingCall,
    connectionState: legacyEngineActive ? legacyConnectionState : connectionState,
    pendingCalleeProfile,
    startCall,
    answerCall,
    declineCall,
    endCall,
    retryConnection,
    isE2eeActive,
  }), [
    activeStatus,
    callState,
    legacyEngineActive,
    legacyCurrentCall,
    currentCall,
    incomingCall,
    legacyConnectionState,
    connectionState,
    pendingCalleeProfile,
    startCall,
    answerCall,
    declineCall,
    endCall,
    retryConnection,
    isE2eeActive,
  ]);

  const mediaValue: VideoCallMediaContextType = useMemo(() => ({
    localStream: legacyEngineActive ? legacyLocalStream : localStream,
    remoteStream: legacyEngineActive ? legacyRemoteStream : remoteStream,
    remoteScreenStream,
    isMuted: legacyEngineActive ? legacyIsMuted : isMuted,
    isVideoOff: legacyEngineActive ? legacyIsVideoOff : isVideoOff,
    isScreenSharing: legacyEngineActive ? false : isScreenSharing,
    screenStream: legacyEngineActive ? null : screenStream,
    noiseSuppressionEnabled: legacyEngineActive ? false : noiseSuppressionEnabled,
    backgroundBlurEnabled: legacyEngineActive ? false : backgroundBlurEnabled,
    toggleMute: legacyEngineActive ? legacyToggleMute : toggleMute,
    toggleVideo: legacyEngineActive ? legacyToggleVideo : toggleVideo,
    toggleScreenShare: legacyEngineActive
      ? async () => { toast.info("Демонстрация экрана недоступна в режиме совместимости"); }
      : async () => {
          if (isScreenSharing) {
            stopScreenShare();
            return;
          }
          await startScreenShare();
        },
    toggleNoiseSuppression: legacyEngineActive
      ? async () => { toast.info("Шумоподавление недоступно в режиме совместимости"); }
      : toggleNoiseSuppression,
    toggleBackgroundBlur: legacyEngineActive
      ? async () => { toast.info("Размытие фона недоступно в режиме совместимости"); }
      : toggleBackgroundBlur,
  }), [
    legacyEngineActive,
    legacyLocalStream,
    localStream,
    legacyRemoteStream,
    remoteStream,
    remoteScreenStream,
    legacyIsMuted,
    isMuted,
    legacyIsVideoOff,
    isVideoOff,
    isScreenSharing,
    screenStream,
    noiseSuppressionEnabled,
    backgroundBlurEnabled,
    legacyToggleMute,
    toggleMute,
    legacyToggleVideo,
    toggleVideo,
    stopScreenShare,
    startScreenShare,
    toggleNoiseSuppression,
    toggleBackgroundBlur,
  ]);

  const uiValue: VideoCallUIContextType = useMemo(() => ({
    isCallUiActive,
  }), [isCallUiActive]);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <VideoCallSignalingContext.Provider value={signalingValue}>
      <VideoCallMediaContext.Provider value={mediaValue}>
        <VideoCallUIContext.Provider value={uiValue}>
          {children}
        </VideoCallUIContext.Provider>
      </VideoCallMediaContext.Provider>
    </VideoCallSignalingContext.Provider>
  );
}

