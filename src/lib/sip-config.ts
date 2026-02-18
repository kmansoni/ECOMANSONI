/**
 * SIP.js Configuration
 * Used when external SIP provider is configured
 */

export interface SIPConfig {
  wssUrl: string;
  domain: string;
  username: string;
  password: string;
  displayName?: string;
}

/**
 * Get SIP configuration from environment/secrets
 * Returns null if SIP is not configured
 */
export function getSIPConfig(): SIPConfig | null {
  // These would come from Supabase secrets via edge function
  // For now, return null to indicate SIP is not configured
  return null;
}

/**
 * Media constraints for SIP calls
 */
export const SIP_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    facingMode: "user",
    width: { ideal: 640, max: 1280 },
    height: { ideal: 480, max: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
};

/**
 * SIP session options
 */
export const SIP_SESSION_OPTIONS = {
  sessionDescriptionHandlerOptions: {
    constraints: SIP_MEDIA_CONSTRAINTS,
    iceGatheringTimeout: 5000,
  },
  // Renegotiation is enabled by default
  earlyMedia: true,
};

/**
 * Check if SIP is available
 */
export function isSIPConfigured(): boolean {
  return getSIPConfig() !== null;
}
