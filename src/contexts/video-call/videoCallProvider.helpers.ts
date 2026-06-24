import { logger } from "@/lib/logger";
import type { RtpCapabilities, TransportCreatedPayload } from "@/calls-v2/types";
import type { CallMediaEncryption } from "@/calls-v2/callMediaEncryption";
import type { RekeyStateMachine } from "@/calls-v2/rekeyStateMachine";
import { TURN_CREDENTIALS_EDGE_FNS } from "@/lib/turnCredentialsConfig";

const CALLS_V2_ENABLED_RAW = String(import.meta.env.VITE_CALLS_V2_ENABLED ?? "").trim().toLowerCase();

// Fail-safe default: calls are enabled unless explicitly disabled.
// This prevents accidental outages when deploy env injection omits VITE_CALLS_V2_ENABLED.
export const CALLS_V2_ENABLED = CALLS_V2_ENABLED_RAW === "" ? true : CALLS_V2_ENABLED_RAW === "true";

const CALLS_V2_WS_URLS_RAW = (import.meta.env.VITE_CALLS_V2_WS_URLS ?? "")
  .split(",")
  .map((value: string) => value.trim())
  .filter(Boolean);

const DEFAULT_PROD_SFU_ENDPOINTS = [
  "wss://sfu-ru.mansoni.ru/ws",
] as const;

const INSECURE_WS_PREFIX = "ws" + "://";

const IS_LOCALHOST_RUNTIME =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

const IS_MANSONI_RU_RUNTIME =
  typeof window !== "undefined" &&
  /(^|\.)mansoni\.ru$/i.test(window.location.hostname);

export const SHOULD_USE_PROD_SFU_DEFAULTS =
  CALLS_V2_WS_URLS_RAW.length === 0 &&
  IS_MANSONI_RU_RUNTIME;

function enforceRuOnlyEndpoints(rawEndpoints: string[]): string[] {
  if (!IS_MANSONI_RU_RUNTIME) return rawEndpoints;

  const ruOnly = rawEndpoints.filter((endpoint) => /sfu-ru\.mansoni\.ru/i.test(endpoint));
  if (ruOnly.length > 0) return ruOnly;
  return [...DEFAULT_PROD_SFU_ENDPOINTS];
}

const CALLS_V2_ENDPOINTS_RAW_UNFILTERED = SHOULD_USE_PROD_SFU_DEFAULTS
  ? [...DEFAULT_PROD_SFU_ENDPOINTS]
  : [
      ...(IS_LOCALHOST_RUNTIME ? ["ws://127.0.0.1:8787"] : []),
      ...CALLS_V2_WS_URLS_RAW,
    ];

const CALLS_V2_ENDPOINTS_RAW = enforceRuOnlyEndpoints(CALLS_V2_ENDPOINTS_RAW_UNFILTERED);

export const CALLS_V2_ENDPOINTS = expandWsEndpoints(CALLS_V2_ENDPOINTS_RAW);

export const CALLS_V2_WS_URL = CALLS_V2_ENDPOINTS[0] ?? "";

// TURN credentials edge function (production canonical).
// Legacy get-turn-credentials removed - consolidated into turn-credentials.
export { TURN_CREDENTIALS_EDGE_FNS };

// Сколько секунд до истечения credentials начинать экстренное обновление (30 минут).
export const TURN_REFRESH_BEFORE_EXPIRY_SEC = 30 * 60;

export const CALLS_V2_WS_URLS = CALLS_V2_ENDPOINTS;

export const TURN_REQUIRED_MISSING_ERROR = "turn_required_missing: no relay candidates — calls behind symmetric NAT will fail";

export const REKEY_INTERVAL_MS = Math.max(30_000, Number(import.meta.env.VITE_CALLS_V2_REKEY_INTERVAL_MS ?? "120000"));
export const FRAME_E2EE_ADVERTISE_SFRAME = import.meta.env.VITE_CALLS_FRAME_E2EE_ADVERTISE_SFRAME === "true";

const REQUIRE_SFRAME_OVERRIDE = String(import.meta.env.VITE_CALLS_REQUIRE_SFRAME ?? "").trim().toLowerCase();
const REQUIRE_SFRAME_FOR_LOCAL_RUNTIME = REQUIRE_SFRAME_OVERRIDE === "true";

// Localhost/127.0.0.1 is used for smoke/e2e runs where strict SFrame can be disabled
// unless it is explicitly forced via VITE_CALLS_REQUIRE_SFRAME=true.
export const REQUIRE_SFRAME =
  REQUIRE_SFRAME_OVERRIDE === "true"
    ? true
    : REQUIRE_SFRAME_OVERRIDE === "false"
      ? false
      : (import.meta.env.PROD && !IS_LOCALHOST_RUNTIME) || REQUIRE_SFRAME_FOR_LOCAL_RUNTIME;

export const MEDIA_BOOTSTRAP_RETRY_BACKOFF_MS = 10_000;
export const MEDIA_BOOTSTRAP_MAX_RETRIES = 15;

function normalizeWsEndpoint(raw: string): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  const requireSecureTransport =
    typeof window === "undefined" ? true : window.location.protocol === "https:";
  const wsScheme = requireSecureTransport ? "wss://" : "ws://";

  if (value.startsWith("wss://")) return value;
  if (value.startsWith(INSECURE_WS_PREFIX)) {
    return requireSecureTransport
      ? `wss://${value.slice(INSECURE_WS_PREFIX.length)}`
      : value;
  }
  if (value.startsWith("http://")) return `${wsScheme}${value.slice("http://".length)}`;
  if (value.startsWith("https://")) return `${wsScheme}${value.slice("https://".length)}`;
  if (value.startsWith("/")) {
    return `${wsScheme}${window.location.host}${value}`;
  }

  return `${wsScheme}${value}`;
}

function canonicalizeSfuHost(endpoint: string): string {
  try {
    const parsed = new URL(endpoint);
    const host = parsed.hostname.toLowerCase();

    // Operational guardrail: some deploys accidentally publish *.mansoni.com
    // while SFU ingress is bound to *.mansoni.ru.
    if (/^sfu-[a-z0-9-]+\.mansoni\.com$/.test(host)) {
      const fixed = endpoint.replace(/\.mansoni\.com(?=[:/?]|$)/i, ".mansoni.ru");
      logger.warn("video_call_context.sfu_host_canonicalized", {
        from: endpoint,
        to: fixed,
      });
      return fixed;
    }

    return endpoint;
  } catch (error) {
    logger.debug("video_call_context.sfu_host_canonicalize_failed", {
      endpoint,
      error,
    });
    return endpoint;
  }
}

export function expandWsEndpoints(rawEndpoints: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const pushUnique = (value: string) => {
    const normalized = normalizeWsEndpoint(value);
    if (!normalized) return;
    const canonical = canonicalizeSfuHost(normalized);
    const key = canonical.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  rawEndpoints.forEach(pushUnique);
  return out;
}

export function getCallsConfigIssue(): string | null {
  if (!CALLS_V2_ENABLED) {
    return "Calls V2 disabled";
  }

  const endpoints = CALLS_V2_ENDPOINTS;

  if (endpoints.length === 0) {
    return "Calls WS endpoint is not configured";
  }

  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    const insecureEndpoint = endpoints.find((endpoint) => endpoint.startsWith(INSECURE_WS_PREFIX));
    if (insecureEndpoint) {
      return `Insecure calls endpoint on HTTPS page: ${insecureEndpoint}`;
    }
  }

  return null;
}

export function getCallsConfigToastDescription(issue: string): string {
  if (issue === "Calls V2 disabled") {
    return "Сервис звонков отключен конфигурацией сборки. Установите VITE_CALLS_V2_ENABLED=true или удалите флаг, и задайте рабочий WS endpoint.";
  }
  if (issue === "Calls WS endpoint is not configured") {
    return "Не задан VITE_CALLS_V2_WS_URLS. Сборка фронта не знает, куда подключать SFU.";
  }
  if (issue.startsWith("Insecure calls endpoint on HTTPS page:")) {
    return "На HTTPS-странице нельзя использовать небезопасный WebSocket endpoint. Нужен только wss:// адрес для сервиса звонков.";
  }
  if (issue === TURN_REQUIRED_MISSING_ERROR) {
    return "TURN-сервер недоступен. Звонки не работают за мобильной сетью или корпоративным firewall. Обратитесь в поддержку.";
  }
  return "Конфигурация сервиса звонков неполная. Проверьте env для Calls V2, TURN и SFU.";
}

/**
 * Check if E2EE is supported in this browser.
 * Requires Insertable Streams API (RTCRtpScriptTransform or createEncodedStreams).
 * Fail-closed: returns false if Insertable Streams unavailable — call must not proceed.
 */
export function hasE2eeSupport(): boolean {
  try {
    if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
      return false;
    }
    return hasInsertableStreamsSupport();
  } catch (error) {
    logger.warn("video_call_context.e2ee_support_check_failed", { error });
    return false;
  }
}

/**
 * Check if the browser supports Insertable Streams API for hardware-accelerated E2EE.
 * Returns false if only software fallback is available.
 */
export function hasInsertableStreamsSupport(): boolean {
  try {
    const hasEncodedStreams =
      typeof RTCRtpSender !== "undefined" &&
      "createEncodedStreams" in RTCRtpSender.prototype;
    const hasScriptTransform = typeof (globalThis as { RTCRtpScriptTransform?: unknown }).RTCRtpScriptTransform !== "undefined";
    return hasEncodedStreams || hasScriptTransform;
  } catch (error) {
    logger.warn("video_call_context.insertable_streams_check_failed", { error });
    return false;
  }
}

export type E2eeReadyCheckResult = {
  ready: boolean;
  epoch: number;
  mediaEpoch: number | null;
  hasOutboundKey: boolean;
  missingDecryptionPeers: string[];
  missingSenderKeys: string[];
  inboundReady: boolean;
  pendingReceiverTransforms: string[];
  quorumReady: boolean;
  rekeyState: string | null;
  missingAckPeers: string[];
};

export type E2eeReadyCheckParams = {
  epoch: number;
  mediaEncryption: CallMediaEncryption | null | undefined;
  rekeyMachine?: RekeyStateMachine | null;
  missingSenderKeys?: Iterable<string>;
  inbound?: {
    ready: boolean;
    missingDecryptionPeers?: string[];
    pendingConsumers?: string[];
  } | null;
  requireQuorum?: boolean;
};

export function canSendE2eeReady({
  epoch,
  mediaEncryption,
  rekeyMachine,
  missingSenderKeys,
  inbound,
  requireQuorum = false,
}: E2eeReadyCheckParams): E2eeReadyCheckResult {
  const activePeers = rekeyMachine?.getActivePeerIds() ?? new Set<string>();
  // E2EE_READY is a local media-readiness signal, not proof that every active
  // peer has already delivered a decrypt key. Requiring keys for all active
  // peers creates a bootstrap deadlock for outgoing calls: the caller has no
  // inbound consumers yet, so there is no remote sender to decrypt, but the
  // server will not unlock media until E2EE_READY. Inbound readiness below is
  // still fail-closed: pending consumers and known remote producers must have
  // receiver transforms/decryption keys before we mark ready.
  const mediaMissingPeers: string[] = [];
  const inboundMissingPeers = inbound?.missingDecryptionPeers ?? [];
  const missingDecryptionPeers: string[] = Array.from(new Set<string>([...mediaMissingPeers, ...inboundMissingPeers]));
  const pendingReceiverTransforms = inbound?.pendingConsumers ?? [];
  const ackStatus = rekeyMachine?.getAckStatus() ?? [];
  const missingAckPeers = ackStatus
    .filter((ack) => activePeers.has(ack.peerId) && !ack.acked)
    .map((ack) => ack.peerId);
  const rekeyState = rekeyMachine?.getState() ?? null;
  const quorumReady = !requireQuorum || missingAckPeers.length === 0;
  const senderKeys = Array.from(missingSenderKeys ?? []).filter(Boolean);
  const hasOutboundKey = Boolean(mediaEncryption?.hasOutboundKey());
  const mediaEpoch = mediaEncryption?.getEpoch() ?? null;
  const inboundReady = inbound?.ready ?? true;

  return {
    ready:
      hasOutboundKey &&
      mediaEpoch === epoch &&
      missingDecryptionPeers.length === 0 &&
      senderKeys.length === 0 &&
      inboundReady &&
      pendingReceiverTransforms.length === 0 &&
      quorumReady,
    epoch,
    mediaEpoch,
    hasOutboundKey,
    missingDecryptionPeers,
    missingSenderKeys: senderKeys,
    inboundReady,
    pendingReceiverTransforms,
    quorumReady,
    rekeyState,
    missingAckPeers,
  };
}

export function extractRouterCapsFromJoinPayload(payload: unknown): RtpCapabilities | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as { routerRtpCapabilities?: RtpCapabilities; mediasoup?: { routerRtpCapabilities?: RtpCapabilities } };
  const caps = p.routerRtpCapabilities ?? p.mediasoup?.routerRtpCapabilities ?? null;
  if (!caps) return null;
  if (!Array.isArray(caps.codecs) || caps.codecs.length === 0) {
    logger.warn("[VideoCallContext] ROOM_JOIN_OK/ROOM_JOINED routerRtpCapabilities received but codecs is empty", {
      hasCodecs: Array.isArray(caps.codecs),
      codecsLength: Array.isArray(caps.codecs) ? caps.codecs.length : "n/a",
      hasHeaderExtensions: Array.isArray((caps as Record<string, unknown>).headerExtensions),
    });
    return null;
  }
  return caps;
}

export function hasTransportFingerprints(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const fingerprints = (value as { fingerprints?: unknown }).fingerprints;
  return Array.isArray(fingerprints) && fingerprints.length > 0;
}

export function isValidTransportCreatedPayload(
  payload: TransportCreatedPayload | undefined
): payload is TransportCreatedPayload {
  if (!payload || typeof payload.transportId !== "string" || payload.transportId.length === 0) {
    return false;
  }

  if (!payload.iceParameters || typeof payload.iceParameters !== "object") {
    return false;
  }

  if (!Array.isArray(payload.iceCandidates)) {
    return false;
  }

  if (!payload.dtlsParameters || typeof payload.dtlsParameters !== "object") {
    return false;
  }

  return true;
}

export function makeRandomB64(size: number): string {
  const buf = new Uint8Array(size);
  crypto.getRandomValues(buf);
  let binary = "";
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

export function getMediaPermissionToastPayload(error: unknown, callType: "video" | "audio"): { title: string; description: string } {
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

export function getCallsBootstrapToastPayload(error: unknown): { title: string; description: string } {
  const message = String((error as { message?: unknown } | null | undefined)?.message ?? error ?? "").toLowerCase();

  if (
    message.includes("invalid accesstoken") ||
    message.includes("unauthenticated") ||
    message.includes("auth_fail") ||
    message.includes("auth failed") ||
    message.includes("no access token") ||
    message.includes("missing_session") ||
    message.includes("refresh")
  ) {
    return {
      title: "Требуется повторный вход",
      description: "Сессия входа устарела или недоступна. Обновите страницу и войдите снова, затем повторите звонок.",
    };
  }

  if (message.includes("turn_required_missing")) {
    return {
      title: "Не удалось подключиться к TURN-серверу",
      description: "Ваше подключение не поддерживает звонки. Попробуйте сменить сеть или Wi-Fi.",
    };
  }

  if (
    message.includes("peer_requires_e2ee") ||
    message.includes("calls_v2_peer_requires_e2ee")
  ) {
    return {
      title: "Версия приложения устарела",
      description: "Ваш браузер не поддерживает шифрование звонков. Обновите приложение до последней версии.",
    };
  }

  return {
    title: "Сервер звонков недоступен",
    description: "Не удалось подключиться к серверу звонков (SFU/WebSocket). Попробуйте позже или смените сеть.",
  };
}

export function isMediaErrorForCall(error: unknown): boolean {
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
