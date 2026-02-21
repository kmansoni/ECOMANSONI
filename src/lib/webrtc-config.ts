import { supabase } from "@/integrations/supabase/client";

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

// Public TURN fallback should stay dev-only.
const DEV_PUBLIC_TURN_FALLBACK: RTCIceServer[] = [
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

const FALLBACK_ICE_SERVERS: RTCIceServer[] = import.meta.env.DEV
  ? [...STUN_FALLBACK_ICE_SERVERS, ...DEV_PUBLIC_TURN_FALLBACK]
  : STUN_FALLBACK_ICE_SERVERS;

// Cache for dynamic TURN credentials
let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiry = 0;

// Default cache aims to stay comfortably below typical 1h shared-secret TTLs.
const DEFAULT_CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes
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

    const { data, error } = await supabase.functions.invoke("turn-credentials");

    if (error) {
      console.error("[WebRTC Config] Edge function error:", error);
      return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
    }

    const parsed = (data ?? {}) as TurnCredentialsResponse;
    if (parsed.error) {
      console.warn("[WebRTC Config] TURN error:", parsed.error);
    }

    const ttlFromServerMs = typeof parsed.ttlSeconds === "number" && Number.isFinite(parsed.ttlSeconds)
      ? Math.max(0, parsed.ttlSeconds) * 1000
      : 0;

    // Refresh ahead of expiry by 5 minutes when we have a server-provided TTL.
    const ttlMs = Math.max(
      MIN_CACHE_TTL_MS,
      Math.min(
        DEFAULT_CACHE_TTL_MS,
        ttlFromServerMs > 0 ? Math.max(0, ttlFromServerMs - 5 * 60 * 1000) : DEFAULT_CACHE_TTL_MS,
      ),
    );

    if (Array.isArray(parsed.iceServers) && parsed.iceServers.length > 0) {
      console.log("[WebRTC Config] Got", parsed.iceServers.length, "ICE servers");
      return { iceServers: parsed.iceServers, ttlMs };
    }

    return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
  } catch (err) {
    console.error("[WebRTC Config] Failed to fetch TURN credentials:", err);
    return { iceServers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
  }
}

/**
 * Get ICE servers with dynamic TURN (cached) or fallbacks.
 *
 * NOTE: `forceRelay` is best-effort; if TURN is unavailable we must downgrade to `all`
 * or the peer connection will fail to gather viable candidates.
 */
export async function getIceServers(forceRelay = false): Promise<IceServerConfig> {
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
import { supabase } from "@/integrations/supabase/client";

export interface IceServerConfig {
  iceServers: RTCIceServer[];
  iceCandidatePoolSize: number;
  iceTransportPolicy: RTCIceTransportPolicy;
}

// Fallback STUN/TURN servers
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // OpenRelay free TURN (backup)
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// Cache for dynamic TURN credentials
let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiry: number = 0;
const CACHE_TTL_MS = 20 * 60 * 60 * 1000; // 20 hours (credentials valid for 24h)

/**
 * Fetch dynamic TURN credentials
 */
async function fetchTurnCredentials(): Promise<RTCIceServer[] | null> {
  try {
    console.log("[WebRTC Config] Fetching TURN credentials...");
    
    const { data, error } = await supabase.functions.invoke("turn-credentials");
    
    if (error) {
      console.error("[WebRTC Config] Edge function error:", error);
      return null;
    }
    
    if (data?.iceServers && Array.isArray(data.iceServers)) {
      console.log("[WebRTC Config] Got", data.iceServers.length, "ICE servers");
      return data.iceServers;
    }
    
    if (data?.error) console.warn("[WebRTC Config] TURN error:", data.error);
    
    return null;
  } catch (err) {
    console.error("[WebRTC Config] Failed to fetch TURN credentials:", err);
    return null;
  }
}

/**
 * Get ICE servers with dynamic TURN (cached) or fallbacks
 */
export async function getIceServers(forceRelay = false): Promise<IceServerConfig> {
  const now = Date.now();
  
  // Check cache
  if (cachedIceServers && cacheExpiry > now) {
    console.log("[WebRTC Config] Using cached ICE servers");
    return {
      iceServers: cachedIceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: forceRelay ? "relay" : "all",
    };
  }
  
  // Fetch fresh credentials
  const turnServers = await fetchTurnCredentials();
  
  if (turnServers && turnServers.length > 0) {
    // Merge dynamic TURN servers with fallbacks
    cachedIceServers = [...turnServers, ...FALLBACK_ICE_SERVERS];
    cacheExpiry = now + CACHE_TTL_MS;
    
    console.log("[WebRTC Config] Cached", cachedIceServers.length, "ICE servers");
  } else {
    // Use fallbacks only
    console.warn("[WebRTC Config] Using fallback ICE servers only");
    cachedIceServers = FALLBACK_ICE_SERVERS;
    cacheExpiry = now + 5 * 60 * 1000; // 5 min cache for fallbacks
  }
  
  return {
    iceServers: cachedIceServers,
    iceCandidatePoolSize: 10,
    iceTransportPolicy: forceRelay ? "relay" : "all",
  };
}

/**
 * Clear cached ICE servers (force refresh on next call)
 */
export function clearIceServerCache(): void {
  cachedIceServers = null;
  cacheExpiry = 0;
  console.log("[WebRTC Config] ICE server cache cleared");
}

/**
 * Get media constraints for calls
 */
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

/**
 * Check if WebRTC is supported
 */
export function isWebRTCSupported(): boolean {
  return !!(
    window.RTCPeerConnection &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}
