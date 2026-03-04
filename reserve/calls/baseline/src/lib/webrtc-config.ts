import { supabase } from "@/integrations/supabase/client";

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
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

// Cache for dynamic TURN credentials
let cachedIceServers: RTCIceServer[] | null = null;
let cacheExpiry: number = 0;
// Max 1 hour (short-lived credentials)
const CACHE_TTL_MS = 25 * 60 * 1000; // 25 minutes (well under 1h cap)
const MAX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour hard cap
const FALLBACK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min cache for fallbacks

function hasTurnServer(iceServers: RTCIceServer[]): boolean {
  return iceServers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((u) => typeof u === "string" && /^turns?:/i.test(u));
  });
}

/**
 * Fetch dynamic TURN credentials from edge function
 */
async function fetchCloudflareCredentials(): Promise<{ servers: RTCIceServer[] | null; ttlMs: number }> {
  try {
    console.log("[WebRTC Config] Fetching TURN credentials...");

    const { data, error } = await supabase.functions.invoke("turn-credentials");

    if (error) {
      console.error("[WebRTC Config] Edge function error:", error);
      return { servers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
    }

    if (data?.iceServers && Array.isArray(data.iceServers)) {
      console.log("[WebRTC Config] Got", data.iceServers.length, "ICE servers");

      const ttlFromServerMs = typeof data.ttlSeconds === "number" && Number.isFinite(data.ttlSeconds)
        ? Math.max(0, data.ttlSeconds) * 1000
        : 0;

      const ttlMs = Math.min(
        MAX_CACHE_TTL_MS,
        ttlFromServerMs > 0
          ? Math.min(ttlFromServerMs / 2, ttlFromServerMs - 60_000)
          : CACHE_TTL_MS,
      );

      return { servers: data.iceServers, ttlMs: Math.max(FALLBACK_CACHE_TTL_MS, ttlMs) };
    }

    if (data?.error) {
      console.warn("[WebRTC Config] TURN error:", data.error);
    }

    return { servers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
  } catch (err) {
    console.error("[WebRTC Config] Failed to fetch TURN credentials:", err);
    return { servers: null, ttlMs: FALLBACK_CACHE_TTL_MS };
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
 * Get ICE servers with dynamic TURN (cached) or fallbacks
 */
export async function getIceServers(
  optionsOrForceRelay: WebRTCConfigOptions | boolean = false,
): Promise<IceServerConfig> {
  const now = Date.now();

  // Back-compat: accept plain boolean
  const options: WebRTCConfigOptions =
    typeof optionsOrForceRelay === "boolean"
      ? { forceRelay: optionsOrForceRelay }
      : optionsOrForceRelay;

  // Check cache
  if (cachedIceServers && cacheExpiry > now) {
    console.log("[WebRTC Config] Using cached ICE servers");
    const canRelay = hasTurnServer(cachedIceServers);
    return {
      iceServers: cachedIceServers,
      iceCandidatePoolSize: 10,
      iceTransportPolicy: resolveIceTransportPolicy(options, canRelay),
    };
  }

  // Fetch fresh credentials
  const { servers: cloudflareServers, ttlMs } = await fetchCloudflareCredentials();

  if (cloudflareServers && cloudflareServers.length > 0) {
    cachedIceServers = [...cloudflareServers, ...FALLBACK_ICE_SERVERS];
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

/**
 * Clear cached ICE servers (force refresh on next call)
 */
export function clearIceServerCache(): void {
  cachedIceServers = null;
  cacheExpiry = 0;
  console.log("[WebRTC Config] ICE server cache cleared");
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
      if (isPrivate) return false;
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
