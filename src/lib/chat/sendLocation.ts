/**
 * src/lib/chat/sendLocation.ts
 *
 * Client-side library for geolocation message attachments.
 *
 * Architecture notes:
 *  - All sends go through sendMessageV1 RPC (zero direct DB writes).
 *  - Coordinates are passed in the JSON body envelope with kind='location'.
 *  - Server validates coordinate ranges, participant membership, and rate limits.
 *  - Live location updates go through update_live_location_v1 RPC.
 *  - Live location state machine:
 *      IDLE → STARTING (requestLocation) → SHARING (startLiveSharing)
 *      SHARING → UPDATING (watchPosition loop every 30s)
 *      SHARING → STOPPED (stopLiveSharing OR TTL expiry)
 *
 * Security:
 *  - navigator.geolocation is browser-native; no third-party library.
 *  - enableHighAccuracy = true for accuracy; timeout = 10s; maxAge 0.
 *  - Location data is sent over TLS to Supabase RPC endpoint.
 *  - No coordinates stored client-side between sends.
 */

import { supabase } from "@/lib/supabase";
import { sendMessageV1, buildChatBodyEnvelope } from "@/lib/chat/sendMessageV1";
import type { SendMessageV1Result } from "@/lib/chat/sendMessageV1";

// ── Types ─────────────────────────────────────────────────────────────────

export interface GeoCoords {
  lat: number;
  lng: number;
  accuracy_m: number;
  heading_deg?: number;
  speed_mps?: number;
}

export interface SendStaticLocationParams {
  conversationId: string;
  clientMsgId: string;
  coords: GeoCoords;
}

export interface SendLiveLocationParams {
  conversationId: string;
  clientMsgId: string;
  coords: GeoCoords;
  /** Live duration in seconds. Min 60, max 28800 (8h). Default: 900 (15 min). */
  liveDurationSeconds?: number;
}

export interface LiveLocationHandle {
  messageId: string;
  /** Call to update position. Returns false if location has stopped/expired. */
  update: (coords: GeoCoords) => Promise<boolean>;
  /** Explicitly stop live sharing. */
  stop: () => Promise<void>;
  /** Currently active. False after stop() or TTL. */
  isActive: () => boolean;
}

// ── Geolocation helpers ───────────────────────────────────────────────────

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10_000,
  maximumAge: 0,
};

/**
 * Request a single position from the device.
 * Throws GeolocationPositionError if denied/unavailable.
 */
export function getCurrentPosition(): Promise<GeoCoords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GEOLOCATION_NOT_SUPPORTED"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: Math.round(pos.coords.accuracy),
          heading_deg:
            pos.coords.heading != null && !Number.isNaN(pos.coords.heading)
              ? Math.round(pos.coords.heading)
              : undefined,
          speed_mps:
            pos.coords.speed != null && !Number.isNaN(pos.coords.speed)
              ? pos.coords.speed
              : undefined,
        });
      },
      reject,
      GEO_OPTIONS,
    );
  });
}

// ── Map static geolocation error codes to user-facing message keys ─────────

export function geoErrorToKey(err: GeolocationPositionError): string {
  switch (err.code) {
    case GeolocationPositionError.PERMISSION_DENIED:
      return "geo_permission_denied";
    case GeolocationPositionError.POSITION_UNAVAILABLE:
      return "geo_position_unavailable";
    case GeolocationPositionError.TIMEOUT:
      return "geo_timeout";
    default:
      return "geo_unknown_error";
  }
}

// ── Send static location ──────────────────────────────────────────────────

/**
 * Send a static (one-time) location message.
 * Body envelope: { kind: 'location', lat, lng, accuracy_m, is_live: false }
 */
export async function sendStaticLocation(
  params: SendStaticLocationParams,
): Promise<SendMessageV1Result> {
  const { conversationId, clientMsgId, coords } = params;

  const body = buildChatBodyEnvelope({
    kind: "location",
    lat: coords.lat,
    lng: coords.lng,
    accuracy_m: coords.accuracy_m,
    is_live: false,
  });

  return sendMessageV1({ conversationId, clientMsgId, body });
}

// ── Send + manage live location ───────────────────────────────────────────

/**
 * Send the initial live location message and return a handle for ongoing updates.
 *
 * Live location lifecycle:
 *  1. Client calls sendLiveLocation() → message created with location_is_live=true
 *  2. Client calls handle.update(coords) every ~30s via watchPosition
 *  3. Client calls handle.stop() when user taps "Stop sharing"
 *  4. Server TTL expires_ via pg_cron (expire_live_locations_v1)
 *
 * The returned handle internally tracks active state to prevent zombie updates.
 */
export async function sendLiveLocation(
  params: SendLiveLocationParams,
): Promise<LiveLocationHandle> {
  const { conversationId, clientMsgId, coords, liveDurationSeconds = 900 } = params;

  const body = buildChatBodyEnvelope({
    kind: "location",
    lat: coords.lat,
    lng: coords.lng,
    accuracy_m: coords.accuracy_m,
    is_live: true,
    live_duration_seconds: liveDurationSeconds,
  });

  const result = await sendMessageV1({ conversationId, clientMsgId, body });
  const messageId = result.messageId;

  let active = true;

  return {
    messageId,

    isActive: () => active,

    async update(newCoords: GeoCoords): Promise<boolean> {
      if (!active) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("update_live_location_v1", {
        p_message_id: messageId,
        p_lat: newCoords.lat,
        p_lng: newCoords.lng,
        p_accuracy_m: newCoords.accuracy_m ?? null,
        p_heading_deg: newCoords.heading_deg ?? null,
        p_speed_mps: newCoords.speed_mps ?? null,
      });

      if (error) {
        // live_location_expired or live_location_stopped → mark inactive
        if (
          error.message?.includes("expired") ||
          error.message?.includes("stopped")
        ) {
          active = false;
          return false;
        }
        // Transient error — remain active, caller can retry
        throw error;
      }

      return true;
    },

    async stop(): Promise<void> {
      if (!active) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("stop_live_location_v1", {
        p_message_id: messageId,
      });

      active = false;

      if (error && !error.message?.includes("live_location_not_found")) {
        throw error;
      }
    },
  };
}

// ── Live location watcher ─────────────────────────────────────────────────

/**
 * Starts a GPS watchPosition loop and feeds updates into a LiveLocationHandle.
 * Returns a cleanup function to stop both GPS watching and live location sharing.
 *
 * Usage:
 *   const stop = startLiveLocationWatcher(handle, { onError: console.error });
 *   // Later:
 *   await stop();
 */
export function startLiveLocationWatcher(
  handle: LiveLocationHandle,
  options?: {
    onError?: (err: GeolocationPositionError | Error) => void;
    updateIntervalMs?: number;
  },
): () => Promise<void> {
  if (!navigator.geolocation) {
    throw new Error("GEOLOCATION_NOT_SUPPORTED");
  }

  const updateInterval = options?.updateIntervalMs ?? 30_000; // 30s default
  let watchId: number | null = null;
  let lastUpdateAt = 0;

  watchId = navigator.geolocation.watchPosition(
    async (pos) => {
      const now = Date.now();
      // Throttle: respect updateInterval to avoid hammering server
      if (now - lastUpdateAt < updateInterval - 1000) return;
      if (!handle.isActive()) {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        return;
      }

      lastUpdateAt = now;

      try {
        const coords: GeoCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: Math.round(pos.coords.accuracy),
          heading_deg:
            pos.coords.heading != null && !Number.isNaN(pos.coords.heading)
              ? Math.round(pos.coords.heading)
              : undefined,
          speed_mps:
            pos.coords.speed != null && !Number.isNaN(pos.coords.speed)
              ? pos.coords.speed
              : undefined,
        };

        const stillActive = await handle.update(coords);
        if (!stillActive && watchId !== null) {
          navigator.geolocation.clearWatch(watchId);
        }
      } catch (err) {
        options?.onError?.(err as Error);
      }
    },
    (err) => {
      options?.onError?.(err);
    },
    { ...GEO_OPTIONS, maximumAge: updateInterval / 2 },
  );

  return async () => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (handle.isActive()) {
      await handle.stop();
    }
  };
}
