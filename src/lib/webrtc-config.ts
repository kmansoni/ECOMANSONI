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
