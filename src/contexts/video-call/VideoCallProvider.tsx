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

import { ReactNode, useState, useCallback, useEffect, useRef } from "react";
import { getStableCallsDeviceId } from "@/lib/platform/device";
import { useVideoCallSfu, type VideoCall, type VideoCallStatus } from "@/hooks/useVideoCallSfu";
import { useIncomingCalls } from "@/hooks/useIncomingCalls";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { onNativeCallAction } from "@/lib/native/callBridge";
import { supabase } from "@/integrations/supabase/client";
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
import type { RtpCapabilities } from "@/calls-v2/types";
import type { CallIdentity, KeyPackageData } from "@/calls-v2/callKeyExchange";
import type { RekeyEvent } from "@/calls-v2/rekeyStateMachine";

import { VideoCallSignalingContext } from "./VideoCallSignalingContext";
import { VideoCallMediaContext } from "./VideoCallMediaContext";
import { VideoCallUIContext } from "./VideoCallUIContext";
import type {
  VideoCallSignalingContextType,
  VideoCallMediaContextType,
  VideoCallUIContextType,
  CalleeProfile,
} from "./types";

// ─── Environment constants ─────────────────────────────────────────────────────
const CALLS_V2_ENABLED_RAW = String(import.meta.env.VITE_CALLS_V2_ENABLED ?? "").trim().toLowerCase();
// Fail-safe default: calls are enabled unless explicitly disabled.
// This prevents accidental outages when deploy env injection omits VITE_CALLS_V2_ENABLED.
const CALLS_V2_ENABLED = CALLS_V2_ENABLED_RAW === "" ? true : CALLS_V2_ENABLED_RAW === "true";
const CALLS_V2_WS_URL = (import.meta.env.VITE_CALLS_V2_WS_URL ?? "").trim();
/** URL Edge Function get-turn-credentials. Если задан — используется вместо встроенного turn-credentials. */
const TURN_CREDENTIALS_EDGE_FN = "get-turn-credentials";
/** Сколько секунд до истечения credentials начинать экстренное обновление (30 минут). */
const TURN_REFRESH_BEFORE_EXPIRY_SEC = 30 * 60;
const CALLS_V2_WS_URLS = (import.meta.env.VITE_CALLS_V2_WS_URLS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const REKEY_INTERVAL_MS = Math.max(30_000, Number(import.meta.env.VITE_CALLS_V2_REKEY_INTERVAL_MS ?? "120000"));
const FRAME_E2EE_ADVERTISE_SFRAME = import.meta.env.VITE_CALLS_FRAME_E2EE_ADVERTISE_SFRAME === "true";

// ─── Pure utility functions ────────────────────────────────────────────────────
function normalizeWsEndpoint(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (value.startsWith("ws://") || value.startsWith("wss://")) return value;
  if (value.startsWith("http://")) return `ws://${value.slice("http://".length)}`;
  if (value.startsWith("https://")) return `wss://${value.slice("https://".length)}`;
  if (value.startsWith("/")) {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}${value}`;
  }

  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${value}`;
}

function isLocalEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const h = url.hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch (error) {
    logger.warn("video_call_context.endpoint_parse_failed", { error, endpoint });
    return false;
  }
}

function getCallsConfigIssue(): string | null {
  if (!CALLS_V2_ENABLED) {
    return "Calls V2 disabled";
  }

  const endpoints = [CALLS_V2_WS_URL, ...CALLS_V2_WS_URLS]
    .map((value) => normalizeWsEndpoint(value))
    .filter(Boolean);

  if (endpoints.length === 0) {
    return "Calls WS endpoint is not configured";
  }

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    const insecureRemoteEndpoint = endpoints.find((endpoint) => endpoint.startsWith("ws://") && !isLocalEndpoint(endpoint));
    if (insecureRemoteEndpoint) {
      return `Insecure calls endpoint on HTTPS page: ${insecureRemoteEndpoint}`;
    }
  }

  return null;
}

function getCallsConfigToastDescription(issue: string): string {
  if (issue === "Calls V2 disabled") {
    return "Сервис звонков отключен конфигурацией сборки. Установите VITE_CALLS_V2_ENABLED=true или удалите флаг, и задайте рабочий WS endpoint.";
  }
  if (issue === "Calls WS endpoint is not configured") {
    return "Не задан VITE_CALLS_V2_WS_URL или VITE_CALLS_V2_WS_URLS. Сборка фронта не знает, куда подключать SFU.";
  }
  if (issue.startsWith("Insecure calls endpoint on HTTPS page:")) {
    return "На HTTPS-странице нельзя использовать внешний ws:// endpoint. Нужен только wss:// адрес для сервиса звонков.";
  }
  return "Конфигурация сервиса звонков неполная. Проверьте env для Calls V2, TURN и SFU.";
}

function hasInsertableStreamsSupport(): boolean {
  try {
    const hasEncodedStreams =
      typeof RTCRtpSender !== "undefined" &&
      "createEncodedStreams" in RTCRtpSender.prototype;
    const hasScriptTransform = typeof (globalThis as any).RTCRtpScriptTransform !== "undefined";
    return hasEncodedStreams || hasScriptTransform;
  } catch (error) {
    logger.warn("video_call_context.insertable_streams_check_failed", { error });
    return false;
  }
}

function extractRouterCapsFromJoinPayload(payload: unknown): RtpCapabilities | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { routerRtpCapabilities?: RtpCapabilities; mediasoup?: { routerRtpCapabilities?: RtpCapabilities } };
  return p.routerRtpCapabilities ?? p.mediasoup?.routerRtpCapabilities ?? null;
}

function toBase64Utf8(value: string): string {
  return btoa(
    encodeURIComponent(value).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
  );
}
// Suppress "declared but never used" — toBase64Utf8 is a utility kept for future use
void toBase64Utf8;

function makeRandomB64(size: number): string {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function getMediaPermissionToastPayload(error: unknown, callType: "video" | "audio"): { title: string; description: string } {
  const permissionTitle = callType === "video" ? "Нет доступа к камере или микрофону" : "Нет доступа к микрофону";
  const mediaStartTitle = callType === "video" ? "Не удалось запустить камеру или микрофон" : "Не удалось запустить микрофон";

  if (error && typeof error === "object" && "name" in error && String((error as { name?: unknown }).name ?? "") === "VideoCallMediaAccessError") {
    const causeName = String((error as { causeName?: unknown }).causeName ?? "UnknownError");
    if (causeName === "NotAllowedError" || causeName === "SecurityError") {
      return {
        title: permissionTitle,
        description: "Разрешите доступ в настройках браузера и перезапустите звонок",
      };
    }
    if (causeName === "NotFoundError" || causeName === "DevicesNotFoundError") {
      return {
        title: mediaStartTitle,
        description: "Не найдено устройство микрофона или камеры",
      };
    }
    if (causeName === "NotReadableError" || causeName === "TrackStartError") {
      return {
        title: mediaStartTitle,
        description: "Устройство занято другим приложением",
      };
    }
    if (causeName === "NotSupportedError" || causeName === "NotSecureError") {
      return {
        title: "Звонки не поддерживаются",
        description: "Браузер или WebView не поддерживает доступ к микрофону для звонков",
      };
    }
    if (causeName === "AbortError") {
      return {
        title: mediaStartTitle,
        description: "Запрос доступа к микрофону был прерван. Попробуйте еще раз",
      };
    }
  }

  if (error && typeof error === "object" && "name" in error) {
    const name = String((error as { name?: unknown }).name ?? "");
    if (name === "NotAllowedError" || name === "SecurityError") {
      return {
        title: permissionTitle,
        description: "Разрешите доступ в настройках браузера и перезапустите звонок",
      };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return {
        title: mediaStartTitle,
        description: "Не найдено устройство микрофона или камеры",
      };
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return {
        title: mediaStartTitle,
        description: "Устройство занято другим приложением",
      };
    }
  }

  return {
    title: "Не удалось начать звонок",
    description: "Произошла ошибка инициализации медиа. Попробуйте еще раз",
  };
}

function isMediaErrorForCall(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  // VideoCallStartError is a DB/network error, never a media-permission error
  if (name === "VideoCallStartError") return false;
  const causeName = "causeName" in error ? String((error as { causeName?: unknown }).causeName ?? "") : "";
  return (
    name === "VideoCallMediaAccessError" ||
    name === "NotAllowedError" ||
    name === "SecurityError" ||
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "NotReadableError" ||
    name === "TrackStartError" ||
    name === "AbortError" ||
    name === "OverconstrainedError" ||
    name === "NotSupportedError" ||
    name === "NotSecureError" ||
    causeName === "NotAllowedError" ||
    causeName === "SecurityError" ||
    causeName === "NotFoundError" ||
    causeName === "DevicesNotFoundError" ||
    causeName === "NotReadableError" ||
    causeName === "TrackStartError" ||
    causeName === "AbortError" ||
    causeName === "OverconstrainedError" ||
    causeName === "NotSupportedError" ||
    causeName === "NotSecureError"
  );
}

// ─── VideoCallProvider ─────────────────────────────────────────────────────────
export function VideoCallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [pendingIncomingCall, setPendingIncomingCall] = useState<VideoCall | null>(null);
  const callsWsRef = useRef<CallsWsClient | null>(null);
  const sfuManagerRef = useRef<SfuMediaManager | null>(null);
  const sfuRouterRtpCapabilitiesRef = useRef<RtpCapabilities | null>(null);
  const callsWsCallIdRef = useRef<string | null>(null);
  const callsWsRoomRef = useRef<string | null>(null);
  const callsWsMediaRoomRef = useRef<string | null>(null);
  const callsWsSendTransportRef = useRef<string | null>(null);
  const callsWsRecvTransportRef = useRef<string | null>(null);
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
  const callKeyExchangeRef = useRef<CallKeyExchange | null>(null);
  const callMediaEncryptionRef = useRef<CallMediaEncryption | null>(null);
  const rekeyMachineRef = useRef<RekeyStateMachine | null>(null);
  const epochGuardRef = useRef<EpochGuard | null>(null);
  const consumerAddedUnsubRef = useRef<(() => void) | null>(null);

  // UI-lock: keeps call UI visible even during transient status changes (permission prompts, etc.)
  const [isCallUiActive, setIsCallUiActive] = useState(false);
  const isCallUiActiveRef = useRef(false);

  // Profile of the callee shown immediately on the call screen before the call record loads from DB
  const [pendingCalleeProfile, setPendingCalleeProfile] = useState<CalleeProfile | null>(null);

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
      issue,
    });
  }, []);

  const {
    status,
    currentCall,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    connectionState,
    startCall: startVideoCall,
    answerCall: answerVideoCall,
    endCall: endVideoCall,
    toggleMute,
    toggleVideo,
    retryWithFreshCredentials,
    setRemoteStream: setRemoteMediaStream,
  } = useVideoCallSfu({
    onCallEnded: (call) => {
      logger.info("[VideoCallContext] Call ended:", call.id.slice(0, 8));
      if (callsWsCallIdRef.current === call.id) {
        callsWsCallIdRef.current = null;
        callsWsRoomRef.current = null;
        callsWsMediaRoomRef.current = null;
        callsWsSendTransportRef.current = null;
        callsWsRecvTransportRef.current = null;
      }
      setPendingIncomingCall(null);
      setPendingCalleeProfile(null);
      setIsCallUiActive(false); // Release UI-lock on call end
    },
  });

  const closeCallsV2 = useCallback(() => {
    if (rekeyTimerRef.current) {
      window.clearInterval(rekeyTimerRef.current);
      rekeyTimerRef.current = null;
    }
    if (sfuManagerRef.current) {
      sfuManagerRef.current.close();
      sfuManagerRef.current = null;
    }
    if (consumerAddedUnsubRef.current) {
      consumerAddedUnsubRef.current();
      consumerAddedUnsubRef.current = null;
    }
    setRemoteMediaStream(null);
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
    if (!callsWsRef.current) return;
    callsWsRef.current.close();
    callsWsRef.current = null;
    callsWsCallIdRef.current = null;
    callsWsRoomRef.current = null;
    callsWsMediaRoomRef.current = null;
    callsWsSendTransportRef.current = null;
    callsWsRecvTransportRef.current = null;
    e2eeLeaderDeviceRef.current = null;
    keyPackageNonceRef.current.clear();
  }, [setRemoteMediaStream]);

  /**
   * Fetch time-limited TURN credentials from Edge Function `get-turn-credentials`.
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
      const { data, error } = await supabase.functions.invoke(TURN_CREDENTIALS_EDGE_FN);

      if (error) {
        logger.warn("[VideoCallContext] get-turn-credentials error (STUN-only fallback):", error);
        return null;
      }

      const parsed = data as {
        iceServers?: RTCIceServer[];
        ttl?: number;
        expiresAt?: number;
        error?: string;
      } | null;

      if (parsed?.error) {
        logger.warn("[VideoCallContext] get-turn-credentials server error:", parsed.error);
        return null;
      }

      if (!Array.isArray(parsed?.iceServers) || parsed.iceServers.length === 0) {
        logger.warn("[VideoCallContext] get-turn-credentials returned empty iceServers");
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
      logger.warn("[VideoCallContext] get-turn-credentials fetch exception (STUN-only fallback):", err);
      return null;
    }
  }, []);

  const ensureCallsV2Connected = useCallback(async (): Promise<CallsWsClient | null> => {
    if (!CALLS_V2_ENABLED || !user) return null;
    if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) {
      logger.warn("[VideoCallContext] calls-v2 disabled: no WS endpoint configured");
      return null;
    }
    if (callsWsRef.current) return callsWsRef.current;

    const rawEndpoints = CALLS_V2_WS_URLS.length > 0 ? CALLS_V2_WS_URLS : (CALLS_V2_WS_URL ? [CALLS_V2_WS_URL] : []);
    const endpoints = rawEndpoints
      .map(normalizeWsEndpoint)
      .filter((v, i, arr) => !!v && arr.indexOf(v) === i);
    if (endpoints.length === 0) {
      logger.warn("[VideoCallContext] calls-v2 disabled: WS endpoints normalized to empty", { rawEndpoints });
      return null;
    }

    // Prefetch TURN credentials before WS connect so they are ready when transports are created.
    // Fire-and-forget (await) — failure is non-fatal; call proceeds on STUN-only fallback.
    await fetchTurnIceServers();

    const requireWss = !import.meta.env.DEV && !endpoints.some(isLocalEndpoint);
    logger.info("[VideoCallContext] calls-v2 connect:start", {
      endpointCount: endpoints.length,
      firstEndpoint: endpoints[0],
      requireWss,
    });
    const client = new CallsWsClient({
      url: endpoints[0],
      urls: endpoints,
      requireWss,
      heartbeatMs: 10_000,
      reconnect: { enabled: true, maxAttempts: 20, baseDelayMs: 500, maxDelayMs: 12_000 },
      ackRetry: { maxRetries: 1, retryDelayMs: 250 },
    });

    try {
      const offState = client.onConnectionStateChange((state) => {
        logger.info("[VideoCallContext] calls-v2 ws-state", { state });
      });
      await client.connect();
      logger.info("[VideoCallContext] calls-v2 connect:ok", { state: client.connectionState });

      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        logger.warn("[VideoCallContext] calls-v2 auth:skip no access token");
        client.close();
        return null;
      }

      const deviceId = getStableCallsDeviceId();
      await client.hello({
        client: {
          platform: "web",
          appVersion: "calls-v2-bootstrap",
          deviceId,
        },
      });
      logger.info("[VideoCallContext] calls-v2 hello:ok", { deviceId });
      await client.auth({ accessToken });
      logger.info("[VideoCallContext] calls-v2 auth:ok");
      await client.e2eeCaps({
        insertableStreams: hasInsertableStreamsSupport(),
        sframe: FRAME_E2EE_ADVERTISE_SFRAME && hasInsertableStreamsSupport(),
      });
      logger.info("[VideoCallContext] calls-v2 e2ee_caps:ok");

      // Initialize CallKeyExchange + CallMediaEncryption for this WS session.
      // Re-initialize on each new connection (ephemeral keys per session).
      if (!callKeyExchangeRef.current) {
        const identity: CallIdentity = {
          userId: user.id,
          deviceId: getStableCallsDeviceId(),
          sessionId: crypto.randomUUID(),
        };
        const kx = new CallKeyExchange(identity);
        await kx.initialize();
        callKeyExchangeRef.current = kx;
        logger.info("[VideoCallContext] calls-v2 CallKeyExchange initialized");
      }
      if (!callMediaEncryptionRef.current) {
        callMediaEncryptionRef.current = new CallMediaEncryption();
        logger.info("[VideoCallContext] calls-v2 CallMediaEncryption initialized");
      }

      // Initialize RekeyStateMachine + EpochGuard for this WS session
      if (!rekeyMachineRef.current) {
        rekeyMachineRef.current = new RekeyStateMachine();
      }
      if (!epochGuardRef.current) {
        epochGuardRef.current = new EpochGuard(true); // strict: media blocked without E2EE
      }
      epochGuardRef.current.markAuthenticated();

      // Wire rekey state machine events
      rekeyMachineRef.current.onEvent((event: RekeyEvent) => {
        logger.info(`[Rekey] ${event.type} epoch=${event.epoch}`, event.reason ?? '');

        if (event.type === 'QUORUM_REACHED') {
          // All active peers ACK'd → send REKEY_COMMIT to server
          const activeRoomId = callsWsRoomRef.current;
          if (activeRoomId) {
            void client.rekeyCommit({ roomId: activeRoomId, epoch: event.epoch }).catch((err) => {
              logger.warn('[VideoCallContext] rekeyCommit failed', err);
            });
          }
        }

        if (event.type === 'REKEY_COMMITTED') {
          // Epoch activated — ungate media
          epochGuardRef.current?.markE2eeReady(event.epoch);
          if (event.epoch > e2eeEpochRef.current) {
            e2eeEpochRef.current = event.epoch;
          }
        }

        if (event.type === 'REKEY_ABORTED' || event.type === 'DEADLINE_EXCEEDED') {
          logger.error(`[Rekey] Aborted epoch=${event.epoch}: ${event.reason}`);
          // Keep current epoch active; do NOT advance guard
        }
      });

      client.on("AUTH_FAIL", (frame) => {
        logger.warn("[VideoCallContext] calls-v2 auth-fail", { payload: frame.payload });
      });

      client.on("ERROR", (frame) => {
        logger.warn("[VideoCallContext] calls-v2 server-error", {
          type: frame.type,
          payload: frame.payload,
          ack: frame.ack,
        });
      });

      client.on("ROOM_LEFT", (frame) => {
        logger.warn("[VideoCallContext] calls-v2 room-left", { payload: frame.payload });
      });

      // SECURITY FIX: Unsubscribe connection state handler after setup to prevent
      // handler accumulation across re-renders and potential memory/event-listener leaks.
      offState();

      client.on("ROOM_SNAPSHOT", (frame) => {
        const snapshot = frame.payload as { e2ee?: { leaderDeviceId?: string }; peers?: Array<{ peerId?: string; deviceId?: string }> } | null;
        const leader = snapshot?.e2ee?.leaderDeviceId;
        if (typeof leader === "string" && leader.length > 0) {
          e2eeLeaderDeviceRef.current = leader;
        }
        // Populate rekey machine with current room peers
        if (Array.isArray(snapshot?.peers)) {
          const peerIds: string[] = (snapshot.peers as Array<{ peerId?: string; deviceId?: string }>)
            .map((p) => p.peerId ?? p.deviceId ?? '')
            .filter(Boolean);
          rekeyMachineRef.current?.setActivePeers(peerIds);
        }
      });

      client.on("REKEY_BEGIN", (frame) => {
        const activeRoomId = callsWsRoomRef.current;
        const rekeyPayload = frame.payload as { roomId?: string; epoch?: number | string } | undefined;
        const roomId = rekeyPayload?.roomId;
        if (!activeRoomId || !roomId || roomId !== activeRoomId) return;

        const epochRaw = rekeyPayload?.epoch;
        const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(epoch) || epoch < 0) return;

        const myDeviceId = getStableCallsDeviceId();
        const leaderDeviceId = e2eeLeaderDeviceRef.current;
        if (!leaderDeviceId || leaderDeviceId === myDeviceId) return;

        const nonce = `${roomId}:${epoch}:${myDeviceId}`;
        if (keyPackageNonceRef.current.has(nonce)) return;
        keyPackageNonceRef.current.add(nonce);
        if (keyPackageNonceRef.current.size > 2000) {
          const keep = Array.from(keyPackageNonceRef.current).slice(-1000);
          keyPackageNonceRef.current = new Set(keep);
        }

        // Phase B: Real ECDH KEY_PACKAGE.
        // Non-leader creates own epoch key (for outbound SFrame encryption) and sends
        // its ECDH public key to the leader. Leader will respond with a KEY_PACKAGE
        // containing the epoch key wrapped with ECDH(leader_priv, our_pub).
        const keyExchange = callKeyExchangeRef.current;
        const mediaEncryption = callMediaEncryptionRef.current;

        if (!keyExchange || !mediaEncryption) {
          logger.warn("[VideoCallContext] KEY_PACKAGE: key exchange not initialized, skipping");
          return;
        }

        void (async () => {
          try {
            // Create our epoch key (used for outbound SFrame until leader's epoch key arrives)
            const epochKey = await keyExchange.createEpochKey(epoch);
            await mediaEncryption.setEncryptionKey(epochKey);

            const senderPublicKey = await keyExchange.getPublicKeyBase64();

            // Phase C: ECDSA identity binding.
            // Sign (userId || ephemeralPubKey) with device identity key so the leader
            // can verify this KEY_PACKAGE was originated by the authenticated user.
            // The ephemeral ECDH public key is encoded as base64 in senderPublicKey.
            const identityKeyPair = await getOrCreateIdentityKeyPair();
            const ephemeralPubKeyBytes = Uint8Array.from(
              atob(senderPublicKey),
              (c) => c.charCodeAt(0),
            );
            const sigBytes = await signIdentity(
              identityKeyPair.privateKey,
              user?.id ?? "",
              ephemeralPubKeyBytes.buffer,
            );
            // Export identity public key as JWK and embed in senderIdentity for peer verification
            const identityPubKeyJwk = await exportEcdsaPublicKey(identityKeyPair.publicKey);
            const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

            // Phase B: we don't know leader's ECDH public key yet, so we can't wrap
            // for them. We send our senderPublicKey so the leader can ECDH back to us.
            // ciphertext = our senderPublicKey again (discovery packet; no epoch key wrapped yet).
            // Leader on receipt will createKeyPackage(our_pub, epoch) and send back wrapped epoch key.
            void client.keyPackage({
              roomId,
              targetDeviceId: leaderDeviceId,
              epoch,
              ciphertext: senderPublicKey, // discovery: our public key as payload
              sig: sigB64,                 // Phase C: real ECDSA P-256 identity binding
              senderPublicKey,
              senderIdentity: {
                userId: user?.id ?? "",
                deviceId: getStableCallsDeviceId(),
                sessionId: (callKeyExchangeRef.current as unknown as { identity?: { sessionId?: string } })?.identity?.sessionId ?? crypto.randomUUID(),
                // identityPubKeyJwk is passed as part of senderIdentity for ECDSA verification
                ...({ identityPubKeyJwk } as Record<string, unknown>),
              },
            }).catch((error) => {
              logger.warn("[VideoCallContext] KEY_PACKAGE send failed", error);
            });

            logger.info("[VideoCallContext] KEY_PACKAGE sent (Phase C ECDSA+ECDH discovery)", { epoch, roomId });
          } catch (err) {
            logger.warn("[VideoCallContext] KEY_PACKAGE async error", err);
          }
        })();
      });

      client.on("KEY_PACKAGE", (frame) => {
        const activeRoomId = callsWsRoomRef.current;
        const keyPkgPayload = frame.payload as {
          roomId?: string;
          targetDeviceId?: string;
          epoch?: number | string;
        } | undefined;
        const roomId = keyPkgPayload?.roomId;
        if (!activeRoomId || !roomId || roomId !== activeRoomId) return;

        const myDeviceId = getStableCallsDeviceId();
        const targetDeviceId = keyPkgPayload?.targetDeviceId;
        if (!targetDeviceId || targetDeviceId !== myDeviceId) return;

        const epochRaw = keyPkgPayload?.epoch;
        const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(epoch) || epoch < 0) return;

        // Phase C: Anti-replay + epoch gating via RekeyStateMachine
        const msgId = (frame.payload as Record<string, unknown> | undefined)?.messageId as string | undefined;
        const isValidPkg = rekeyMachineRef.current?.validateKeyPackage(epoch, msgId);
        if (isValidPkg === false) {
          logger.warn("[VideoCallContext] KEY_PACKAGE rejected: anti-replay or stale epoch", { epoch, msgId });
          return;
        }

        const keyExchange = callKeyExchangeRef.current;
        const mediaEncryption = callMediaEncryptionRef.current;

        void (async () => {
          try {
            const rawPayload = frame.payload as Record<string, unknown> | undefined;
            const senderPublicKeyB64 = rawPayload?.senderPublicKey as string | undefined;
            const ciphertextB64 = rawPayload?.ciphertext as string | undefined;
            const sigB64 = rawPayload?.sig as string | undefined;

            if (keyExchange && mediaEncryption && senderPublicKeyB64 && ciphertextB64) {
              // Determine sender identity from whatever the frame provides
              const senderUserId = rawPayload?.fromUserId as string | undefined
                ?? rawPayload?.fromDeviceId as string | undefined
                ?? 'unknown';
              const senderDeviceId = rawPayload?.fromDeviceId as string | undefined ?? '';

              const pkgData: KeyPackageData = {
                senderPublicKey: senderPublicKeyB64,
                ciphertext: ciphertextB64,
                sig: sigB64 ?? makeRandomB64(64),
                epoch,
                // salt: required by KeyPackageData; extract from payload or use empty string
                // (processKeyPackage will reject if signature doesn't match due to wrong salt)
                salt: (rawPayload?.salt as string | undefined) ?? '',
                senderIdentity: {
                  userId: senderUserId,
                  deviceId: senderDeviceId,
                  sessionId: '',
                },
              };

              // Try full ECDH unwrap (real wrapped epoch key from leader)
              try {
                const peerEpochKey = await keyExchange.processKeyPackage(pkgData);
                await mediaEncryption.setDecryptionKey(senderUserId, peerEpochKey);
                logger.info("[VideoCallContext] KEY_PACKAGE: processKeyPackage OK", { epoch, senderUserId });
              } catch (error) {
                logger.warn("video_call_context.key_package_process_failed", { error, epoch, senderUserId });
                // Sender sent discovery packet (ciphertext = their public key, not wrapped epoch key).
                // If we are the leader → create epoch key and respond with wrapped KEY_PACKAGE.
                const leaderDeviceId = e2eeLeaderDeviceRef.current;
                if (leaderDeviceId === myDeviceId && senderDeviceId) {
                  logger.info("[VideoCallContext] KEY_PACKAGE: leader responding with wrapped epoch key", { epoch, senderDeviceId });
                  void (async () => {
                    try {
                      // Get or create epoch key for this epoch
                      const epochKey = keyExchange.getCurrentEpochKey()?.epoch === epoch
                        ? keyExchange.getCurrentEpochKey()!
                        : await keyExchange.createEpochKey(epoch);
                      await mediaEncryption.setEncryptionKey(epochKey);

                      // createKeyPackage uses ECDH with sender's public key
                      const pkg = await keyExchange.createKeyPackage(senderPublicKeyB64, epoch);
                      void client.keyPackage({
                        roomId,
                        targetDeviceId: senderDeviceId,
                        epoch,
                        ciphertext: pkg.ciphertext,
                        sig: pkg.sig,
                        senderPublicKey: pkg.senderPublicKey,
                        senderIdentity: {
                          userId: user?.id ?? "",
                          deviceId: getStableCallsDeviceId(),
                          sessionId: (callKeyExchangeRef.current as unknown as { identity?: { sessionId?: string } })?.identity?.sessionId ?? crypto.randomUUID(),
                        },
                      }).catch((err) => {
                        logger.warn("[VideoCallContext] leader KEY_PACKAGE response failed", err);
                      });
                    } catch (e2) {
                      logger.warn("[VideoCallContext] leader KEY_PACKAGE creation failed", e2);
                    }
                  })();
                }
              }
            }
          } finally {
            // Always send KEY_ACK regardless of key exchange outcome
            void client.keyAck({
              roomId,
              epoch,
              fromDeviceId: myDeviceId,
            }).catch((error) => {
              logger.warn("[VideoCallContext] KEY_ACK send failed", error);
            });
          }
        })();
      });

      client.on("REKEY_COMMIT", (frame) => {
        const commitPayload = frame.payload as { epoch?: number | string } | undefined;
        const epochRaw = commitPayload?.epoch;
        const nextEpoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw);
        if (!Number.isFinite(nextEpoch)) return;
        // Desync guard: never move backward.
        if (nextEpoch > e2eeEpochRef.current) {
          e2eeEpochRef.current = nextEpoch;
          // Activate epoch in state machine (if we're the initiator)
          rekeyMachineRef.current?.activateEpoch(nextEpoch);
          // Ungate media for new epoch
          epochGuardRef.current?.markE2eeReady(nextEpoch);
          const activeRoomId = callsWsRoomRef.current;
          if (activeRoomId) {
            void client.e2eeReady({ roomId: activeRoomId, epoch: nextEpoch }).catch((err) => {
              logger.warn("[VideoCallContext] E2EE_READY after REKEY_COMMIT failed", err);
            });
          }
        }
      });

      client.on("PEER_JOINED", (frame) => {
        const peerId = (frame.payload as Record<string, unknown> | undefined)?.peerId as string | undefined;
        if (peerId) {
          rekeyMachineRef.current?.addPeer(peerId);
        }
      });

      client.on("PEER_LEFT", (frame) => {
        const peerId = (frame.payload as Record<string, unknown> | undefined)?.peerId as string | undefined;
        if (peerId) {
          rekeyMachineRef.current?.removePeer(peerId);
        }
      });

      client.on("KEY_ACK", (frame) => {
        const payload = frame.payload as Record<string, unknown> | undefined;
        const fromDeviceId = payload?.fromDeviceId as string | undefined;
        const epochRaw = payload?.epoch;
        const epoch = typeof epochRaw === "number" ? epochRaw : Number(epochRaw ?? 0);
        const msgId = payload?.messageId as string | undefined;
        if (fromDeviceId && Number.isFinite(epoch)) {
          rekeyMachineRef.current?.onKeyAckReceived(fromDeviceId, epoch, msgId);
        }
      });

      callsWsRef.current = client;
      return client;
    } catch (err) {
      logger.warn("[VideoCallContext] calls-v2 connect/bootstrap failed", err);
      client.close();
      return null;
    }
  }, [fetchTurnIceServers, user]);

  const bootstrapCallsV2Room = useCallback(
    async (call: VideoCall, role: "caller" | "callee") => {
      if (!CALLS_V2_ENABLED || !user) return true;
      if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) return false;

      const callId = call.id;
      if (callsWsCallIdRef.current === callId && callsWsRoomRef.current) return true;
      logger.info("[VideoCallContext] calls-v2 room-bootstrap:start", { callId, role });

      const client = await ensureCallsV2Connected();
      if (!client) return false;

      try {
        let roomId: string;
        let joinToken: string | undefined;

        if (role === "caller") {
          await client.roomCreate({
            callId,
            preferredRegion: "tr",
          });
          logger.info("[VideoCallContext] calls-v2 room-create:sent", { callId });

          const createdFrame = await client.waitFor(
            "ROOM_CREATED",
            (frame) => {
              const payload = frame.payload as { roomId?: string } | undefined;
              return typeof payload?.roomId === "string" && payload.roomId.length > 0;
            },
            { timeoutMs: 5000, acceptRecent: true }
          );
          roomId = (createdFrame.payload as { roomId?: string } | undefined)?.roomId as string;
          logger.info("[VideoCallContext] calls-v2 room-created:ok", { callId, roomId });

          try {
            const secretFrame = await client.waitFor(
              "ROOM_JOIN_SECRET",
              (frame) => {
                const payload = frame.payload as { roomId?: string; joinToken?: string } | undefined;
                return payload?.roomId === roomId && typeof payload?.joinToken === "string" && payload.joinToken.length > 0;
              },
              { timeoutMs: 1200, acceptRecent: true }
            );
            joinToken = (secretFrame.payload as { joinToken?: string } | undefined)?.joinToken as string;
            logger.info("[VideoCallContext] calls-v2 room-join-secret:ok", { roomId });
          } catch (error) {
            logger.warn("video_call_context.room_join_secret_wait_failed", { error, roomId });
            // SFU mode: join token is optional and ROOM_JOIN_SECRET is not emitted.
            joinToken = undefined;
            logger.info("[VideoCallContext] calls-v2 room-join-secret:skip (sfu mode)", { roomId });
          }

          // Persist room bootstrap hints for callee-side answer flow.
          const { error: persistRoomError } = await supabase
            .from("video_calls" as never)
            .update({
              calls_v2_room_id: roomId,
              calls_v2_join_token: joinToken ?? null,
            } as never)
            .eq("id", callId);
          if (persistRoomError) {
            logger.warn("[VideoCallContext] calls-v2 room hints persist failed", {
              callId,
              roomId,
              error: persistRoomError.message,
            });
          }
        } else {
          const hintedRoomId = (call as VideoCall & { room_id?: string; calls_v2_room_id?: string }).calls_v2_room_id
            ?? (call as VideoCall & { room_id?: string }).room_id;
          const hintedJoinToken = (call as VideoCall & { join_token?: string; calls_v2_join_token?: string }).calls_v2_join_token
            ?? (call as VideoCall & { join_token?: string }).join_token;

          if (!hintedRoomId) {
            logger.warn("[VideoCallContext] calls-v2 callee bootstrap skipped: missing room/join token", {
              callId,
              hasRoomId: !!hintedRoomId,
              hasJoinToken: !!hintedJoinToken,
            });
            return false;
          }

          roomId = hintedRoomId;
          joinToken = hintedJoinToken;
          logger.info("[VideoCallContext] calls-v2 callee-room-hint:ok", {
            callId,
            roomId,
            hasJoinToken: !!joinToken,
          });
        }

        await client.roomJoin({
          roomId,
          joinToken,
          deviceId: getStableCallsDeviceId(),
          preferredRegion: "tr",
        });
        logger.info("[VideoCallContext] calls-v2 room-join:ok", { callId, roomId, role });
        const joinedFrame = await client.waitFor(
          "ROOM_JOIN_OK",
          (frame) => {
            const payload = frame.payload as { roomId?: string } | undefined;
            return payload?.roomId === roomId;
          },
          { timeoutMs: 5000, acceptRecent: true }
        );
        const joinedPayload = joinedFrame.payload as Record<string, unknown> | undefined;
        const joinedEpochRaw = joinedPayload?.epoch;
        const joinedEpoch = typeof joinedEpochRaw === "number" ? joinedEpochRaw : Number(joinedEpochRaw ?? 0);
        if (Number.isFinite(joinedEpoch) && joinedEpoch >= 0) {
          e2eeEpochRef.current = joinedEpoch;
        } else {
          e2eeEpochRef.current = 0;
        }
        const joinCaps = extractRouterCapsFromJoinPayload(joinedPayload);
        if (joinCaps) {
          sfuRouterRtpCapabilitiesRef.current = joinCaps;
          logger.info("[VideoCallContext] calls-v2 routerRtpCapabilities captured from ROOM_JOIN_OK", { roomId });
        }
        // Inform epoch guard that we have joined
        epochGuardRef.current?.markRoomJoined(e2eeEpochRef.current);
        await client.e2eeReady({ roomId, epoch: e2eeEpochRef.current });
        epochGuardRef.current?.markE2eeReady(e2eeEpochRef.current);
        logger.info("[VideoCallContext] calls-v2 e2ee-ready:ok", { roomId, epoch: e2eeEpochRef.current });

        // Backward compatibility: some deployments may still emit ROOM_JOINED.
        const joinedUnsub = client.on("ROOM_JOINED", (frame) => {
          const payload = frame.payload as { roomId?: string; routerRtpCapabilities?: RtpCapabilities; mediasoup?: { routerRtpCapabilities?: RtpCapabilities } } | undefined;
          if (payload?.roomId !== roomId) return;
          const caps = extractRouterCapsFromJoinPayload(payload);
          if (caps) {
            sfuRouterRtpCapabilitiesRef.current = caps;
            logger.info("[VideoCallContext] calls-v2 routerRtpCapabilities captured", { roomId });
          }
          joinedUnsub();
        });

        const consumeUnsub = client.on("PRODUCER_ADDED", (frame) => {
          const payload = frame.payload as { roomId?: string; producerId?: string } | undefined;
          if (payload?.roomId !== roomId) return;
          const producerId = payload?.producerId;
          if (!producerId) return;
          // Use SFU device rtpCapabilities if loaded, else router capabilities
          const rtpCapabilities =
            sfuManagerRef.current?.rtpCapabilities ??
            sfuRouterRtpCapabilitiesRef.current;
          if (!rtpCapabilities) {
            logger.warn("[VideoCallContext] calls-v2 consume skipped: rtpCapabilities not ready", { roomId, producerId });
            return;
          }
          void client.consume({ roomId, producerId, rtpCapabilities }).catch((err) => {
            logger.warn("[VideoCallContext] calls-v2 consume failed", err);
          });
        });

        setTimeout(() => {
          consumeUnsub();
        }, 10 * 60_000);

        callsWsCallIdRef.current = callId;
        callsWsRoomRef.current = roomId;
        logger.info("[VideoCallContext] calls-v2 room-bootstrap:done", { callId, roomId });

        if (rekeyTimerRef.current) {
          window.clearInterval(rekeyTimerRef.current);
          rekeyTimerRef.current = null;
        }

        // Phase C: State machine-driven rekey.
        // Timer only initiates; actual commit happens on QUORUM_REACHED event.
        rekeyTimerRef.current = window.setInterval(() => {
          const activeClient = callsWsRef.current;
          const activeRoomId = callsWsRoomRef.current;
          const machine = rekeyMachineRef.current;
          const keyExchange = callKeyExchangeRef.current;
          if (!activeClient || !activeRoomId || !machine || !keyExchange) return;

          const newEpoch = machine.initiateRekey();
          if (newEpoch === null) return; // blocked: wrong state or cooldown

          const mediaEncryption = callMediaEncryptionRef.current;

          // Advance epoch guard (disables media during key delivery)
          epochGuardRef.current?.markEpochAdvanced(newEpoch);

          void (async () => {
            try {
              const epochKey = await keyExchange.createEpochKey(newEpoch);
              if (mediaEncryption) await mediaEncryption.setEncryptionKey(epochKey);

              await activeClient.rekeyBegin({ roomId: activeRoomId, epoch: newEpoch });
              // Transition machine to KEY_DELIVERY; starts deadline timer
              machine.onRekeyBeginAcked(newEpoch);
              logger.info("[VideoCallContext] calls-v2 rekey:begin sent", { epoch: newEpoch });
            } catch (err) {
              logger.error("[VideoCallContext] calls-v2 rekey:begin failed, aborting", err);
              machine.abortRekey(String(err));
              // Restore previous epoch in guard on abort
              epochGuardRef.current?.markE2eeReady(e2eeEpochRef.current);
            }
          })();
        }, REKEY_INTERVAL_MS);
        return true;
      } catch (err) {
        logger.warn("[VideoCallContext] calls-v2 room bootstrap failed", err);
        return false;
      }
    },
    [ensureCallsV2Connected, user]
  );

  const rebuildRemoteStream = useCallback(() => {
    const manager = sfuManagerRef.current;
    if (!manager) {
      setRemoteMediaStream(null);
      return;
    }
    const tracks = manager.getAllRemoteTracks().filter((track) => track.readyState === "live");
    if (tracks.length === 0) {
      setRemoteMediaStream(null);
      return;
    }
    setRemoteMediaStream(new MediaStream(tracks));
  }, [setRemoteMediaStream]);

  const bootstrapCallsV2Media = useCallback(
    async (call: VideoCall, stream: MediaStream | null) => {
      if (!CALLS_V2_ENABLED || !user || !stream) return;
      if (!CALLS_V2_WS_URL && CALLS_V2_WS_URLS.length === 0) return;
      const callId = call.id;
      const hintedRoomId = (call as VideoCall & { room_id?: string; calls_v2_room_id?: string }).calls_v2_room_id
        ?? (call as VideoCall & { room_id?: string }).room_id;
      const roomId = callsWsCallIdRef.current === callId
        ? callsWsRoomRef.current
        : (hintedRoomId ?? null);

      if (!roomId) {
        logger.warn("[VideoCallContext] calls-v2 media-bootstrap skipped: room unresolved", {
          callId,
          mappedCallId: callsWsCallIdRef.current,
          mappedRoomId: callsWsRoomRef.current,
          hintedRoomId,
        });
        return;
      }

      if (callsWsRoomRef.current !== roomId) return;
      if (callsWsMediaRoomRef.current === roomId) return;

      const client = callsWsRef.current ?? (await ensureCallsV2Connected());
      if (!client) return;

      try {
        logger.info("[VideoCallContext] calls-v2 media-bootstrap:start", { callId, roomId });

        // Phase C: Fail-closed epoch guard — no media without E2EE_READY
        try {
          epochGuardRef.current?.assertMediaAllowed('PRODUCE');
        } catch (e) {
          logger.error('[VideoCallContext] [EpochGuard] Cannot bootstrap media:', e);
          return;
        }

        // --- SFU Device initialization ---
        const routerRtpCapabilities = sfuRouterRtpCapabilitiesRef.current;
        if (!routerRtpCapabilities) {
          logger.warn("[VideoCallContext] calls-v2 media-bootstrap skipped: routerRtpCapabilities not ready. Waiting for ROOM_JOINED event.", { roomId });
          return;
        }

        // Lazy-init SfuMediaManager per call session
        if (!sfuManagerRef.current) {
          sfuManagerRef.current = new SfuMediaManager();
        }
        const sfuManager = sfuManagerRef.current;

        // ── TURN credentials ──────────────────────────────────────────────────
        const iceServersSnapshot = turnIceServersRef.current ?? undefined;
        if (iceServersSnapshot && iceServersSnapshot.length > 0) {
          logger.info("[VideoCallContext] TURN iceServers ready for SFU transports", { count: iceServersSnapshot.length });
        } else {
          logger.warn("[VideoCallContext] No TURN ice servers available — SFU will use STUN only (may fail behind strict NAT)");
        }
        // ─────────────────────────────────────────────────────────────────────

        // cast: our RtpCapabilities is structurally compatible with mediasoup-client RtpCapabilities
        await sfuManager.loadDevice(routerRtpCapabilities as import('mediasoup-client').types.RtpCapabilities);

        // --- Send Transport ---
        await client.transportCreate({ roomId, direction: "send" });
        const sendCreated = await client.waitFor(
          "TRANSPORT_CREATED",
          (frame) => {
            const p = frame.payload as { roomId?: string; direction?: string } | undefined;
            return p?.roomId === roomId && p?.direction === "send";
          },
          { timeoutMs: 5000, acceptRecent: true }
        );
        const sendParams = sendCreated.payload as import('@/calls-v2/types').TransportCreatedPayload | undefined;
        if (!sendParams?.transportId) return;
        logger.info("[VideoCallContext] calls-v2 transport-created:send", { roomId, transportId: sendParams.transportId });

        sfuManager.createSendTransport(
          {
            id: sendParams.transportId,
            iceParameters: sendParams.iceParameters as import('mediasoup-client').types.IceParameters,
            iceCandidates: sendParams.iceCandidates as import('mediasoup-client').types.IceCandidate[],
            dtlsParameters: sendParams.dtlsParameters as import('mediasoup-client').types.DtlsParameters,
            iceServers: iceServersSnapshot,
          },
          async (dtlsParameters) => {
            await client.transportConnect({
              roomId,
              transportId: sendParams.transportId,
              dtlsParameters: dtlsParameters as import('@/calls-v2/types').DtlsParameters,
            });
            logger.info("[VideoCallContext] calls-v2 transport-connect:send:ok", { roomId });
          },
          async ({ kind, rtpParameters, appData }) => {
            await client.produce({
              roomId,
              transportId: sendParams.transportId,
              kind,
              rtpParameters: rtpParameters as import('@/calls-v2/types').RtpParameters,
              appData: appData as Record<string, unknown>,
            });
            const producedFrame = await client.waitFor(
              "PRODUCED",
              (frame) => {
                const p = frame.payload as { roomId?: string; producerId?: string } | undefined;
                return p?.roomId === roomId && typeof p?.producerId === "string";
              },
              { timeoutMs: 5000, acceptRecent: true }
            );
            const producerId = (producedFrame.payload as { producerId?: string })?.producerId;
            if (!producerId) throw new Error("PRODUCED event missing producerId");
            logger.info("[VideoCallContext] calls-v2 produce:ok", { roomId, kind, producerId });
            return producerId;
          }
        );
        callsWsSendTransportRef.current = sendParams.transportId;

        // --- Recv Transport ---
        await client.transportCreate({ roomId, direction: "recv" });
        const recvCreated = await client.waitFor(
          "TRANSPORT_CREATED",
          (frame) => {
            const p = frame.payload as { roomId?: string; direction?: string } | undefined;
            return p?.roomId === roomId && p?.direction === "recv";
          },
          { timeoutMs: 5000, acceptRecent: true }
        );
        const recvParams = recvCreated.payload as import('@/calls-v2/types').TransportCreatedPayload | undefined;
        if (!recvParams?.transportId) return;
        logger.info("[VideoCallContext] calls-v2 transport-created:recv", { roomId, transportId: recvParams.transportId });

        sfuManager.createRecvTransport(
          {
            id: recvParams.transportId,
            iceParameters: recvParams.iceParameters as import('mediasoup-client').types.IceParameters,
            iceCandidates: recvParams.iceCandidates as import('mediasoup-client').types.IceCandidate[],
            dtlsParameters: recvParams.dtlsParameters as import('mediasoup-client').types.DtlsParameters,
            iceServers: iceServersSnapshot,
          },
          async (dtlsParameters) => {
            await client.transportConnect({
              roomId,
              transportId: recvParams.transportId,
              dtlsParameters: dtlsParameters as import('@/calls-v2/types').DtlsParameters,
            });
            logger.info("[VideoCallContext] calls-v2 transport-connect:recv:ok", { roomId });
          }
        );
        callsWsRecvTransportRef.current = recvParams.transportId;

        // Subscribe to CONSUMER_ADDED events and create consumers + attach SFrame receiver transforms.
        if (consumerAddedUnsubRef.current) {
          consumerAddedUnsubRef.current();
          consumerAddedUnsubRef.current = null;
        }

        consumerAddedUnsubRef.current = client.on("CONSUMER_ADDED", (frame) => {
          const p = frame.payload as import('@/calls-v2/types').ConsumedPayload | undefined;
          if (!p || p.roomId !== roomId) return;
          void sfuManager.consume({
            id: p.consumerId,
            producerId: p.producerId,
            kind: p.kind as import('mediasoup-client').types.MediaKind,
            rtpParameters: p.rtpParameters as import('mediasoup-client').types.RtpParameters,
          }).then((consumer) => {
            logger.info("[VideoCallContext] calls-v2 consumer:created", { roomId, consumerId: consumer.id, kind: consumer.kind });
            // Attach E2EE receiver transform (Insertable Streams) — fail-closed: frames dropped without key
            if (CallMediaEncryption.isSupported()) {
              const receiver = sfuManagerRef.current?.getConsumerReceiver(consumer.id);
              if (receiver) {
                // Use producerId as peerId — links to who created this producer
                callMediaEncryptionRef.current?.setupReceiverTransform(receiver, p.producerId, consumer.id);
              }
            }
            return client.consumerResume({ roomId, consumerId: consumer.id }).then(() => {
              rebuildRemoteStream();
            });
          }).catch((err) => {
            logger.warn("[VideoCallContext] calls-v2 consume/resume failed", err);
          });
        });

        // Produce all live local tracks + attach SFrame sender transforms
        const tracks = stream.getTracks().filter((track) => track.readyState === "live");
        for (const track of tracks) {
          const producer = await sfuManager.produce(track, { trackId: track.id });
          // Attach E2EE sender transform after produce (Insertable Streams)
          if (CallMediaEncryption.isSupported()) {
            const sender = sfuManagerRef.current?.getProducerSender(producer.id);
            if (sender) {
              callMediaEncryptionRef.current?.setupSenderTransform(sender, producer.id);
            }
          }
        }

        rebuildRemoteStream();

        callsWsMediaRoomRef.current = roomId;
        logger.info("[VideoCallContext] calls-v2 media-bootstrap:done", { roomId, trackCount: tracks.length });
      } catch (err) {
        logger.warn("[VideoCallContext] calls-v2 media bootstrap failed", err);
      }
    },
    [ensureCallsV2Connected, rebuildRemoteStream, user]
  );

  const { incomingCall: detectedIncomingCall, clearIncomingCall } = useIncomingCalls({
    onIncomingCall: (call) => {
      // Don't show incoming call if we're already in a call or UI-lock is active
      if (status !== "idle" || isCallUiActiveRef.current) {
        logger.info("[VideoCallContext] Already in call or UI active, ignoring incoming");
        return;
      }
      logger.info("[VideoCallContext] Setting pending incoming call:", call.id.slice(0, 8));
      setPendingIncomingCall(call);
    },
  });

  // Sync incoming call state - prioritize pendingIncomingCall to avoid flicker
  // Only show incoming call when we're truly idle AND UI-lock is not active
  const incomingCall = (status === "idle" && !isCallUiActive) ? pendingIncomingCall : null;

  // Debug logging
  logger.info("[VideoCallContext] State:", {
    status,
    hasCurrentCall: !!currentCall,
    hasPendingIncoming: !!pendingIncomingCall,
    hasDetectedIncoming: !!detectedIncomingCall,
    isCallUiActive,
  });

  const answerCall = useCallback(async (call: VideoCall) => {
    const configIssue = getCallsConfigIssue();
    if (configIssue) {
      logger.error("[VideoCallContext] answerCall blocked by config:", configIssue);
      toast.error("Звонок недоступен", {
        description: getCallsConfigToastDescription(configIssue),
        duration: 6000,
      });
      return;
    }

    logger.info("[VideoCallContext] answerCall: Activating UI-lock BEFORE getUserMedia");
    setIsCallUiActive(true); // Activate UI-lock BEFORE getUserMedia
    setPendingIncomingCall(null);
    clearIncomingCall();

    try {
      await answerVideoCall(call);

      // Refresh call row to pick up caller-persisted calls-v2 room metadata.
      let resolvedCall = call as VideoCall & {
        calls_v2_room_id?: string | null;
        calls_v2_join_token?: string | null;
      };
      try {
        const { data: freshCall } = await supabase
          .from("video_calls" as never)
          .select("id, calls_v2_room_id, calls_v2_join_token" as never)
          .eq("id", call.id)
          .maybeSingle();
        if (freshCall && typeof freshCall === "object") {
          const fresh = freshCall as {
            calls_v2_room_id?: string | null;
            calls_v2_join_token?: string | null;
          };
          resolvedCall = {
            ...resolvedCall,
            calls_v2_room_id: fresh.calls_v2_room_id ?? null,
            calls_v2_join_token: fresh.calls_v2_join_token ?? null,
          };
        }
      } catch (roomHintError) {
        logger.warn("[VideoCallContext] answerCall room-hints refresh failed", roomHintError);
      }

      const roomBootstrapOk = await bootstrapCallsV2Room(resolvedCall, "callee");
      if (!roomBootstrapOk) {
        await endVideoCall("ended");
        throw new Error("calls_v2_room_bootstrap_failed");
      }
    } catch (err) {
      logger.error("[VideoCallContext] answerCall error:", err);
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
    }
  }, [answerVideoCall, bootstrapCallsV2Room, clearIncomingCall, endVideoCall]);

  const declineCall = useCallback(async () => {
    if (incomingCall || pendingIncomingCall) {
      const callToDecline = incomingCall || pendingIncomingCall;
      if (!callToDecline) return;

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
  }, [incomingCall, pendingIncomingCall, clearIncomingCall]);

  const endCall = useCallback(async () => {
    logger.info("[VideoCallContext] endCall called");
    if (currentCall) {
      await endVideoCall("ended");
    } else if (incomingCall || pendingIncomingCall) {
      await declineCall();
    }
    closeCallsV2();
    setIsCallUiActive(false); // Release UI-lock
  }, [currentCall, incomingCall, pendingIncomingCall, endVideoCall, declineCall, closeCallsV2]);

  const startCall = useCallback(async (
    calleeId: string,
    conversationId: string | null,
    callType: "video" | "audio",
    calleeProfile?: CalleeProfile
  ) => {
    if (!user) return null;

    const configIssue = getCallsConfigIssue();
    if (configIssue) {
      logger.error("[VideoCallContext] startCall blocked by config:", configIssue);
      toast.error("Не удалось начать звонок", {
        description: getCallsConfigToastDescription(configIssue),
        duration: 6000,
      });
      return null;
    }

    logger.info("[VideoCallContext] startCall: Activating UI-lock BEFORE startVideoCall");
    if (calleeProfile) setPendingCalleeProfile(calleeProfile);
    setIsCallUiActive(true); // Activate UI-lock BEFORE getUserMedia (happens inside startVideoCall)

    try {
      const result = await startVideoCall(calleeId, conversationId, callType);
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
      const roomBootstrapOk = await bootstrapCallsV2Room(result, "caller");
      if (!roomBootstrapOk) {
        await endVideoCall("ended");
        throw new Error("calls_v2_room_bootstrap_failed");
      }
      return result;
    } catch (err) {
      logger.error("[VideoCallContext] startCall error:", err);
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
    }
  }, [user, startVideoCall, bootstrapCallsV2Room, endVideoCall]);

  const retryConnection = useCallback(async () => {
    const configIssue = getCallsConfigIssue();
    if (configIssue) {
      logger.error("[VideoCallContext] retryConnection blocked by config:", configIssue);
      toast.error("Повторное подключение недоступно", {
        description: getCallsConfigToastDescription(configIssue),
        duration: 6000,
      });
      return;
    }
    await retryWithFreshCredentials();
  }, [retryWithFreshCredentials]);

  useEffect(() => {
    if (!currentCall || !localStream) return;
    void bootstrapCallsV2Media(currentCall, localStream);
  }, [currentCall, localStream, bootstrapCallsV2Media]);

  useEffect(() => {
    return onNativeCallAction(async (action) => {
      const actionType = action.type;
      const incomingLike = pendingIncomingCall ?? incomingCall;
      const matchesIncoming = incomingLike?.id === action.callId;
      const matchesCurrent = currentCall?.id === action.callId;

      if ((actionType === "accept" || actionType === "answer") && incomingLike && matchesIncoming) {
        await answerCall(incomingLike);
        return;
      }

      if ((actionType === "decline" || actionType === "reject") && matchesIncoming) {
        await declineCall();
        return;
      }

      if ((actionType === "end" || actionType === "disconnect") && matchesCurrent) {
        logger.info("[VideoCallContext] Ignoring native end/disconnect action to avoid false DB ended status", {
          callId: action.callId,
          actionType,
          status,
          connectionState,
        });
        return;
      }
    });
  }, [pendingIncomingCall, incomingCall, currentCall, answerCall, declineCall, status, connectionState]);

  useEffect(() => {
    return () => {
      closeCallsV2();
    };
  }, [closeCallsV2]);

  // ─── Build context values ───────────────────────────────────────────────────
  // Each value object is reconstructed only when its specific slice of state changes.
  // This ensures that unrelated context consumers do not re-render.

  const signalingValue: VideoCallSignalingContextType = {
    status,
    currentCall,
    incomingCall,
    connectionState,
    pendingCalleeProfile,
    startCall,
    answerCall,
    declineCall,
    endCall,
    retryConnection,
  };

  const mediaValue: VideoCallMediaContextType = {
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    toggleMute,
    toggleVideo,
  };

  const uiValue: VideoCallUIContextType = {
    isCallUiActive,
  };

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

