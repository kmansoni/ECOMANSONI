import { supabase } from "@/integrations/supabase/client";

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

// Default cache aims to stay comfortably below typical 1h shared-secret TTLs.
const DEFAULT_CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes
const FALLBACK_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
const MIN_CACHE_TTL_MS = 2 * 60 * 1000;

interface TurnCredentialsResponse {
  iceServers?: RTCIceServer[];
  ttlSeconds?: number;
  error?: string;
}

function hasTurnServer(iceServers: RTCIceServer[]): boolean {
  return iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((u) => typeof u === "string" && /^turns?:/i.test(u));
  });
}

async function fetchTurnCredentials(): Promise<{ iceServers: RTCIceServer[] | null; ttlMs: number }> {
  try {
    console.log("[WebRTC Config] Fetching TURN credentials...");

    if (TURN_CREDENTIALS_URL) {
      const { data, error } = await fetchTurnCredentialsFromUrl();
      if (error) {
        console.error("[WebRTC Config] TURN endpoint error:", error);
        return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
      }
      const parsed = (data ?? {}) as TurnCredentialsResponse;
      return parseTurnResponse(parsed);
    }

    const { data, error } = await supabase.functions.invoke("turn-credentials");

    if (error) {
      console.error("[WebRTC Config] Edge function error:", error);
      return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
    }

    const parsed = (data ?? {}) as TurnCredentialsResponse;
    return parseTurnResponse(parsed);
  } catch (err) {
    console.error("[WebRTC Config] Failed to fetch TURN credentials:", err);
    return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
  }
}

function parseTurnResponse(parsed: TurnCredentialsResponse): { iceServers: RTCIceServer[] | null; ttlMs: number } {
    if (parsed.error) {
      console.warn("[WebRTC Config] TURN error:", parsed.error);
    }

    const ttlFromServerMs = typeof parsed.ttlSeconds === "number" && Number.isFinite(parsed.ttlSeconds)
      ? Math.max(0, parsed.ttlSeconds) * 1000
      : 0;

    // Keep cache below half of server TTL and still refresh a bit ahead of expiry.
    const ttlMs = Math.max(
      MIN_CACHE_TTL_MS,
      Math.min(
        DEFAULT_CACHE_TTL_MS,
        ttlFromServerMs > 0
          ? Math.max(0, Math.min(ttlFromServerMs / 2, ttlFromServerMs - 60 * 1000))
          : DEFAULT_CACHE_TTL_MS,
      ),
    );

    if (Array.isArray(parsed.iceServers) && parsed.iceServers.length > 0) {
      console.log("[WebRTC Config] Got", parsed.iceServers.length, "ICE servers");
      return { iceServers: parsed.iceServers, ttlMs };
    }

    return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
  }

async function fetchTurnCredentialsFromUrl(): Promise<{ data: unknown | null; error: Error | null }> {
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token ?? "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (TURN_CREDENTIALS_API_KEY) headers.apikey = TURN_CREDENTIALS_API_KEY;

    const response = await fetch(TURN_CREDENTIALS_URL, {
      method: "POST",
      headers,
      body: "{}",
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
 * Get ICE servers with dynamic TURN (cached) or fallbacks.
 *
 * NOTE: `forceRelay` is best-effort; if TURN is unavailable we must downgrade to `all`
 * or the peer connection will fail to gather viable candidates.
 */
export async function getIceServers(forceRelay = false): Promise<IceServerConfig> {
  initIceCacheAutoInvalidation();
  const now = Date.now();

  if (cachedIceServers && cacheExpiry > now) {
    console.log("[WebRTC Config] Using cached ICE servers");
    const canRelay = hasTurnServer(cachedIceServers);
    const policy: RTCIceTransportPolicy = forceRelay && canRelay ? "relay" : "all";
    if (forceRelay && !canRelay) {
      console.warn("[WebRTC Config] forceRelay requested but TURN is unavailable; downgrading to policy=all");
    }
    return {
      iceServers: cachedIceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: policy,
    };
  }

  const { iceServers: turnServers, ttlMs } = await fetchTurnCredentials();

  if (turnServers && turnServers.length > 0) {
    cachedIceServers = [...turnServers, ...FALLBACK_ICE_SERVERS];
    cacheExpiry = now + ttlMs;
    console.log("[WebRTC Config] Cached", cachedIceServers.length, "ICE servers (ttlMs=", ttlMs, ")");
  } else {
    console.warn("[WebRTC Config] Using fallback ICE servers only");
    cachedIceServers = FALLBACK_ICE_SERVERS;
    cacheExpiry = now + FALLBACK_CACHE_TTL_MS;
  }

  const canRelay = hasTurnServer(cachedIceServers);
  const policy: RTCIceTransportPolicy = forceRelay && canRelay ? "relay" : "all";
  if (forceRelay && !canRelay) {
    console.warn("[WebRTC Config] forceRelay requested but TURN is unavailable; downgrading to policy=all");
  }

  return {
    iceServers: cachedIceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: policy,
  };
}

export function clearIceServerCache(): void {
  cachedIceServers = null;
  cacheExpiry = 0;
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
