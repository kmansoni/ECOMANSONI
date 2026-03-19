import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";

function normalizeEnv(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\s+/g, "");
}

const TURN_CREDENTIALS_URL = normalizeEnv(import.meta.env.VITE_TURN_CREDENTIALS_URL);
const TURN_CREDENTIALS_API_KEY = normalizeEnv(import.meta.env.VITE_TURN_CREDENTIALS_API_KEY);

export interface IceServerConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize: number;
  iceTransportPolicy: RTCIceTransportPolicy;
}

// REMOVED: Hardcoded public TURN credentials (security vulnerability)
// All TURN credentials must be obtained dynamically via edge function

export type P2PMode = 'always' | 'contacts' | 'never';

export interface WebRTCConfigOptions {
  forceRelay?: boolean;
  p2pMode?: P2PMode;
  isContactCall?: boolean; // true если звонящий в списке контактов
}

// Baseline STUN fallback (safe in all environments).
const STUN_FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

// No third-party/public TURN fallback.
// If TURN is not configured in `turn-credentials`, we fall back to STUN-only.
const FALLBACK_ICE_SERVERS: RTCIceServer[] = STUN_FALLBACK_ICE_SERVERS;

// Cache for dynamic TURN credentials
let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiry = 0;
let cacheAutoInvalidationInitialized = false;

// Max cache TTL — 1 hour (short-lived credentials)
const DEFAULT_CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes
const FALLBACK_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MIN_CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cap
const TURN_FETCH_FAILURE_THRESHOLD = 3;
const TURN_FETCH_CIRCUIT_COOLDOWN_MS = 60 * 1000;

let turnFetchFailures = 0;
let turnFetchCircuitOpenUntil = 0;

interface TurnCredentialsResponse {
  iceServers?: RTCIceServer[];
  ttlSeconds?: number;
  error?: string;
}

function buildTurnRequestMetadata(): { nonce: string; requestId: string } {
  const fallback = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const requestId = globalThis.crypto?.randomUUID?.() ?? fallback;
  const nonce = requestId;
  return { nonce, requestId };
}

function normalizeIceServerUrls(urls: RTCIceServer["urls"]): string[] {
  const values = Array.isArray(urls) ? urls : [urls];
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function sanitizeIceServers(iceServers: RTCIceServer[] | null | undefined): RTCIceServer[] {
  if (!Array.isArray(iceServers)) return [];

  return iceServers.flatMap((server) => {
    const urls = normalizeIceServerUrls(server.urls);
    if (urls.length === 0) return [];

    const hasTurnUrl = urls.some((url) => /^turns?:/i.test(url));
    if (hasTurnUrl && (!server.username || !server.credential)) {
      logger.warn("webrtc_config.invalid_turn_server_skipped", { urls });
      return [];
    }

    return [{ ...server, urls } satisfies RTCIceServer];
  });
}

function hasTurnServer(iceServers: RTCIceServer[]): boolean {
  return iceServers.some((server) => {
    const urls = normalizeIceServerUrls(server.urls);
    return urls.some((u) => typeof u === "string" && /^turns?:/i.test(u));
  });
}

async function fetchTurnCredentials(): Promise<{ iceServers: RTCIceServer[] | null; ttlMs: number }> {
  const now = Date.now();
  if (turnFetchCircuitOpenUntil > now) {
    console.warn("[WebRTC Config] TURN fetch circuit is open; skipping remote call");
    return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
  }

  try {
    console.log("[WebRTC Config] Fetching TURN credentials...");

    if (TURN_CREDENTIALS_URL) {
      const { data, error } = await fetchTurnCredentialsFromUrl();
      if (!error) {
        const parsed = (data ?? {}) as TurnCredentialsResponse;
        const parsedResult = parseTurnResponse(parsed);
        if (parsedResult.iceServers && parsedResult.iceServers.length > 0) {
          turnFetchFailures = 0;
          turnFetchCircuitOpenUntil = 0;
          return parsedResult;
        }
        console.warn("[WebRTC Config] TURN endpoint returned no ICE servers, falling back to Supabase function");
      } else {
        console.error("[WebRTC Config] TURN endpoint error:", error);
        console.warn("[WebRTC Config] Falling back to Supabase turn-credentials function");
      }
    }

    const { nonce, requestId } = buildTurnRequestMetadata();
    const { data, error } = await supabase.functions.invoke("turn-credentials", {
      body: { nonce, requestId },
      headers: {
        "x-turn-nonce": nonce,
        "x-request-id": requestId,
      },
    });

    if (error) {
      console.error("[WebRTC Config] Edge function error:", error);
      return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
    }

    const parsed = (data ?? {}) as TurnCredentialsResponse;
    const result = parseTurnResponse(parsed);
    if (result.iceServers && result.iceServers.length > 0) {
      turnFetchFailures = 0;
      turnFetchCircuitOpenUntil = 0;
    }
    return result;
  } catch (err) {
    console.error("[WebRTC Config] Failed to fetch TURN credentials:", err);
    turnFetchFailures += 1;
    if (turnFetchFailures >= TURN_FETCH_FAILURE_THRESHOLD) {
      turnFetchCircuitOpenUntil = Date.now() + TURN_FETCH_CIRCUIT_COOLDOWN_MS;
      console.warn("[WebRTC Config] TURN fetch circuit opened due to consecutive failures");
    }
    return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
  }
}

function computeCacheTtl(ttlFromServerMs: number): number {
  if (ttlFromServerMs <= 0) return DEFAULT_CACHE_TTL_MS;

  // Prefer caching until "credential TTL - 1h" when possible.
  if (ttlFromServerMs > 60 * 60 * 1000) {
    return Math.max(MIN_CACHE_TTL_MS, ttlFromServerMs - 60 * 60 * 1000);
  }

  // For <=1h credentials, keep conservative refresh cadence.
  return Math.max(MIN_CACHE_TTL_MS, Math.floor(ttlFromServerMs * 0.5));
}

function parseTurnResponse(parsed: TurnCredentialsResponse): { iceServers: RTCIceServer[] | null; ttlMs: number } {
  if (parsed.error) {
    console.warn("[WebRTC Config] TURN error:", parsed.error);
  }

  const ttlFromServerMs = typeof parsed.ttlSeconds === "number" && Number.isFinite(parsed.ttlSeconds)
    ? Math.max(0, parsed.ttlSeconds) * 1000
    : 0;

  // Cache policy: TTL-1h (when TTL > 1h), otherwise 50% of TTL.
  const ttlMs = Math.max(
    MIN_CACHE_TTL_MS,
    Math.min(
      MAX_CACHE_TTL_MS,
      Math.min(
        DEFAULT_CACHE_TTL_MS,
        computeCacheTtl(ttlFromServerMs),
      ),
    ),
  );

  const sanitizedIceServers = sanitizeIceServers(parsed.iceServers);
  if (sanitizedIceServers.length > 0) {
    console.log("[WebRTC Config] Got", sanitizedIceServers.length, "ICE servers");
    return { iceServers: sanitizedIceServers, ttlMs };
  }

  if (Array.isArray(parsed.iceServers) && parsed.iceServers.length > 0) {
    logger.warn("webrtc_config.turn_response_invalid_ice_servers", {
      received: parsed.iceServers.length,
    });
  }

  return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
}

async function fetchTurnCredentialsFromUrl(): Promise<{ data: unknown | null; error: Error | null }> {
  try {
    const { nonce, requestId } = buildTurnRequestMetadata();
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token ?? "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-turn-nonce": nonce,
      "x-request-id": requestId,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (TURN_CREDENTIALS_API_KEY) headers.apikey = TURN_CREDENTIALS_API_KEY;

    const response = await fetch(TURN_CREDENTIALS_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ nonce, requestId }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { data: null, error: new Error(`TURN endpoint ${response.status}: ${text}`) };
    }

    const data = await response.json().catch(() => ({}));
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error("TURN endpoint error") };
  }
}

/**
 * Determine ICE transport policy from p2p mode options.
 */
function resolveIceTransportPolicy(
  options: WebRTCConfigOptions,
  canRelay: boolean,
): RTCIceTransportPolicy {
  const { forceRelay, p2pMode, isContactCall } = options;

  const wantRelay =
    forceRelay ||
    p2pMode === 'never' ||
    (p2pMode === 'contacts' && !isContactCall);

  if (wantRelay) {
    if (!canRelay) {
      console.warn("[WebRTC Config] relay requested but TURN is unavailable; downgrading to policy=all");
      return "all";
    }
    return "relay";
  }
  return "all";
}

/**
 * Get ICE servers with dynamic TURN (cached) or fallbacks.
 *
 * NOTE: relay policy is best-effort; if TURN is unavailable we downgrade to `all`
 * or the peer connection will fail to gather viable candidates.
 */
export async function getIceServers(
  optionsOrForceRelay: WebRTCConfigOptions | boolean = false,
): Promise<IceServerConfig> {
  initIceCacheAutoInvalidation();

  // Back-compat: accept plain boolean
  const options: WebRTCConfigOptions =
    typeof optionsOrForceRelay === "boolean"
      ? { forceRelay: optionsOrForceRelay }
      : optionsOrForceRelay;

  const now = Date.now();

  if (cachedIceServers && cacheExpiry > now) {
    const sanitizedCachedIceServers = sanitizeIceServers(cachedIceServers);
    if (sanitizedCachedIceServers.length !== cachedIceServers.length) {
      logger.warn("webrtc_config.cached_ice_servers_invalidated", {
        cached: cachedIceServers.length,
        valid: sanitizedCachedIceServers.length,
      });
      cachedIceServers = sanitizedCachedIceServers.length > 0 ? sanitizedCachedIceServers : null;
      if (!cachedIceServers) cacheExpiry = 0;
    }

    if (cachedIceServers && cacheExpiry > now) {
    console.log("[WebRTC Config] Using cached ICE servers");
    const canRelay = hasTurnServer(cachedIceServers);
    return {
      iceServers: cachedIceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: resolveIceTransportPolicy(options, canRelay),
    };
    }
  }

  const { iceServers: turnServers, ttlMs } = await fetchTurnCredentials();

  if (turnServers && turnServers.length > 0) {
    cachedIceServers = sanitizeIceServers([...turnServers, ...FALLBACK_ICE_SERVERS]);
    cacheExpiry = now + ttlMs;
    console.log("[WebRTC Config] Cached", cachedIceServers.length, "ICE servers (ttlMs=", ttlMs, ")");
  } else {
    console.warn("[WebRTC Config] Using fallback ICE servers only");
    cachedIceServers = FALLBACK_ICE_SERVERS;
    cacheExpiry = now + FALLBACK_CACHE_TTL_MS;
  }

  const canRelay = hasTurnServer(cachedIceServers);

  return {
    iceServers: cachedIceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: resolveIceTransportPolicy(options, canRelay),
  };
}

export function clearIceServerCache(): void {
  cachedIceServers = null;
  cacheExpiry = 0;
  turnFetchFailures = 0;
  turnFetchCircuitOpenUntil = 0;
  console.log("[WebRTC Config] ICE server cache cleared");
}

export function initIceCacheAutoInvalidation(): void {
  if (cacheAutoInvalidationInitialized || typeof window === "undefined") return;
  cacheAutoInvalidationInitialized = true;

  const clear = () => clearIceServerCache();
  window.addEventListener("online", clear);
  window.addEventListener("offline", clear);

  const nav = navigator as Navigator & { connection?: { addEventListener?: (type: string, listener: () => void) => void } };
  nav.connection?.addEventListener?.("change", clear);
}

/**
 * Filter ICE candidates to remove private/local IP addresses for privacy.
 * When relay-only mode is active, also removes srflx candidates.
 */
export function filterIceCandidate(
  candidate: RTCIceCandidate,
  p2pMode: P2PMode,
  isContactCall: boolean,
): boolean {
  if (!candidate.candidate) return true; // allow empty candidates (end-of-candidates)

  const candidateStr = candidate.candidate;

  // Always filter host candidates with private IPs (RFC 1918, RFC 4193)
  if (candidate.type === 'host' || candidateStr.includes(' host ')) {
    const ipMatch = candidateStr.match(/(?:\d{1,3}\.){3}\d{1,3}/);
    if (ipMatch) {
      const ip = ipMatch[0];
      const parts = ip.split('.').map(Number);
      const isPrivate =
        parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        parts[0] === 127;
      if (isPrivate) return false; // filter out private IPs
    }

    // IPv6 private (loopback, link-local, ULA)
    const ipv6Match = candidateStr.match(/\b([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}\b/);
    if (ipv6Match) {
      const ip6 = ipv6Match[0].toLowerCase();
      const isPrivateV6 =
        ip6 === '::1' ||
        ip6.startsWith('fe80:') ||   // link-local
        ip6.startsWith('fc') ||      // ULA (fc00::/7)
        ip6.startsWith('fd');        // ULA (fc00::/7)
      if (isPrivateV6) return false;
    }
  }

  // In relay-only mode, only allow relay candidates
  if (p2pMode === 'never' || (p2pMode === 'contacts' && !isContactCall)) {
    return candidateStr.includes(' relay ') || candidate.type === 'relay';
  }

  return true;
}

export function getMediaConstraints(callType: "video" | "audio"): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: callType === "video"
      ? {
          facingMode: "user",
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 30, max: 30 },
        }
      : false,
  };
}

export function isWebRTCSupported(): boolean {
  return !!(
    window.RTCPeerConnection &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}
