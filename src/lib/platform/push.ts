/**
 * Unified Push Registration — production-grade, zero-trust.
 *
 * ┌────────────────┬──────────────────────────────────────────────────────────┐
 * │ Platform       │ Push strategy                                            │
 * ├────────────────┼──────────────────────────────────────────────────────────┤
 * │ iOS native     │ APNS alert token (messages) + PushKit VoIP token (calls) │
 * │ iPadOS native  │ Same as iOS native                                       │
 * │ Android native │ FCM token (both messages and calls via high-priority)    │
 * │ iOS/iPadOS PWA │ APNS Web Push (Safari 16.4+) — alert only               │
 * │ Android PWA    │ Web Push via FCM VAPID — alert only                      │
 * │ Windows PWA    │ Web Push via VAPID (Chrome/Edge Push Service)            │
 * │ Browser (fallback) │ Web Push via VAPID if Notification API available    │
 * └────────────────┴──────────────────────────────────────────────────────────┘
 *
 * Security invariants:
 *   - Push tokens are NEVER stored client-side beyond the registration call.
 *   - All token uploads are authenticated (JWT) and idempotent (upsert with
 *     conflict on (user_id, device_fingerprint, token_type)).
 *   - Old tokens are tombstoned server-side; the notification router ignores
 *     tombstoned tokens and removes them after 2 consecutive delivery failures.
 *   - Rate limit: 1 registration per device per 60 seconds enforced server-side.
 */

import { detectDevice } from "@/lib/platform/device";
import type { DeviceInfo } from "@/lib/platform/device";
import { logger } from "../logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PushTokenType = "fcm" | "apns" | "apns-voip" | "webpush";

export interface RegisteredPushToken {
  token: string;
  type: PushTokenType;
  /** ISO-8601 timestamp of registration. */
  registeredAt: string;
}

export interface PushRegistrationResult {
  /** Primary token used for messages. */
  primary: RegisteredPushToken;
  /**
   * Secondary VoIP token used for call-wake only (iOS native only).
   * null on all other platforms.
   */
  voip: RegisteredPushToken | null;
}

// ─── Internal: Capacitor push ─────────────────────────────────────────────────

async function registerCapacitorPush(
  device: DeviceInfo,
): Promise<PushRegistrationResult> {
  // Dynamic import — avoids bundling Capacitor in non-native builds.
  // @ts-expect-error -- native-only package may be unavailable in web type context
  const { PushNotifications } = await import("@capacitor/push-notifications");

  // Check and request permission atomically — Capacitor handles system dialog.
  const permStatus = await PushNotifications.checkPermissions();
  if (permStatus.receive === "prompt") {
    const reqResult = await PushNotifications.requestPermissions();
    if (reqResult.receive !== "granted") {
      throw new Error("push:permission-denied");
    }
  } else if (permStatus.receive === "denied") {
    throw new Error("push:permission-denied");
  }

  // Register for APNS/FCM token.
  //
  // IMPORTANT: addListener() MUST be called BEFORE register() to eliminate the
  // race condition where the native bridge fires the "registration" event before
  // the JS listener is installed (observed on Android fast-path FCM registration).
  const primary = await new Promise<RegisteredPushToken>((resolve, reject) => {
    // Typed handles allow deterministic removal in all code paths.
    let regHandle: { remove(): Promise<void> } | null = null;
    let errHandle: { remove(): Promise<void> } | null = null;
    // `settled` becomes true the instant the Promise is resolved or rejected.
    // Used to detect if the native event fired synchronously before handles
    // were stored — in that case the .then() block must remove them itself.
    let settled = false;

    function cleanup(): void {
      settled = true;
      regHandle?.remove().catch(() => {/* no-op */});
      errHandle?.remove().catch(() => {/* no-op */});
      regHandle = null;
      errHandle = null;
    }

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("push:registration-timeout"));
    }, 30_000);

    // Install listeners BEFORE calling register() — eliminates race condition.
    Promise.all([
      PushNotifications.addListener("registration", (token: { value: string }) => {
        clearTimeout(timeoutId);
        cleanup();
        const type: PushTokenType =
          device.os === "ios" || device.os === "ipados" ? "apns" : "fcm";
        resolve({
          token: token.value,
          type,
          registeredAt: new Date().toISOString(),
        });
      }),
      PushNotifications.addListener("registrationError", (err: unknown) => {
        clearTimeout(timeoutId);
        cleanup();
        reject(new Error(`push:registration-error:${JSON.stringify(err)}`));
      }),
    ]).then(([rHandle, eHandle]) => {
      if (settled) {
        // Promise already settled (e.g. native event fired synchronously before
        // this .then() ran — handles were never stored, so remove them now).
        rHandle.remove().catch(() => {/* no-op */});
        eHandle.remove().catch(() => {/* no-op */});
      } else {
        // Store handles for cleanup() to remove when the event eventually arrives.
        regHandle = rHandle;
        errHandle = eHandle;
      }
    }).catch((setupErr) => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error(`push:listener-setup-failed:${setupErr}`));
    });

    // Trigger native registration after listeners are queued.
    PushNotifications.register().catch((regErr: unknown) => {
      clearTimeout(timeoutId);
      cleanup();
      reject(new Error(`push:register-call-failed:${regErr}`));
    });
  });

  // iOS only: register for VoIP push token via PushKit.
  let voip: RegisteredPushToken | null = null;
  if (device.os === "ios" || device.os === "ipados") {
    voip = await registerVoipToken();
  }

  return { primary, voip };
}

/**
 * Register for PushKit VoIP token.
 * Requires native Swift/ObjC code to bridge the token via a custom Capacitor plugin
 * or the @capacitor-community/fcm plugin with VoIP support.
 *
 * This function waits for the native side to post the token via
 * the custom event `mansoni:voip-token` on window.
 */
async function registerVoipToken(): Promise<RegisteredPushToken | null> {
  return new Promise((resolve) => {
    function handler(event: Event) {
      clearTimeout(timeoutId);
      // { once: true } already removes the listener on first fire.
      // Explicit removeEventListener here is a belt-and-suspenders guard.
      window.removeEventListener("mansoni:voip-token", handler);
      const token = (event as CustomEvent<{ token: string }>).detail?.token;
      resolve(
        token
          ? { token, type: "apns-voip", registeredAt: new Date().toISOString() }
          : null,
      );
    }

    window.addEventListener("mansoni:voip-token", handler, { once: true });

    const timeoutId = setTimeout(() => {
      // Remove the handler if not yet fired — prevents a stale listener from
      // resolving a future, unrelated VoIP registration call.
      window.removeEventListener("mansoni:voip-token", handler);
      // VoIP token unavailable — not fatal; call wakeup degrades gracefully
      // to APNS alert push (higher latency, lower priority, but functional).
      resolve(null);
    }, 10_000);

    // Trigger native VoIP registration via custom Capacitor plugin bridge.
    window.dispatchEvent(new CustomEvent("mansoni:request-voip-token"));
  });
}

// ─── Internal: Web Push (VAPID) ───────────────────────────────────────────────

const WEBPUSH_VAPID_PUBLIC_KEY =
  (import.meta.env as Record<string, string>).VITE_WEBPUSH_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function registerWebPush(): Promise<PushRegistrationResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("push:webpush-not-supported");
  }

  if (!WEBPUSH_VAPID_PUBLIC_KEY) {
    throw new Error("push:vapid-key-missing — set VITE_WEBPUSH_VAPID_PUBLIC_KEY");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("push:permission-denied");
  }

  // Wait for the service worker to be ready (registered by Vite PWA plugin).
  const registration = await navigator.serviceWorker.ready;

  // Subscribe or retrieve existing subscription — PushManager handles dedup.
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(WEBPUSH_VAPID_PUBLIC_KEY) as unknown as BufferSource,
    });
  }

  const token = JSON.stringify(subscription.toJSON());
  return {
    primary: {
      token,
      type: "webpush",
      registeredAt: new Date().toISOString(),
    },
    voip: null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register for push notifications on the current platform.
 *
 * The caller is responsible for uploading the returned tokens to the server
 * (notification-router service) associated with the authenticated user session.
 *
 * This function is idempotent — re-calling it returns fresh tokens suitable
 * for silent re-registration after token rotation.
 *
 * @throws Error with message beginning with "push:" on permission denial or failure.
 */
export async function registerPushForPlatform(): Promise<PushRegistrationResult> {
  const device = detectDevice();

  if (device.runtime === "capacitor-native") {
    return registerCapacitorPush(device);
  }

  // PWA or browser — use Web Push API.
  return registerWebPush();
}

/**
 * Upload push tokens to the notification-router service.
 * Must be called after registration and after every token refresh event.
 *
 * @param supabaseAccessToken — current session JWT.
 * @param result — tokens from registerPushForPlatform().
 * @param deviceFingerprint — stable device identifier (from @capacitor/device or localStorage UUID).
 */
export async function uploadPushTokens(
  supabaseAccessToken: string,
  result: PushRegistrationResult,
  deviceFingerprint: string,
): Promise<void> {
  const device = detectDevice();

  const body = {
    deviceFingerprint,
    os: device.os,
    formFactor: device.formFactor,
    runtime: device.runtime,
    primary: result.primary,
    voip: result.voip,
  };

  const notificationRouterUrl =
    (import.meta.env as Record<string, string>).VITE_NOTIFICATION_ROUTER_URL ?? "";

  if (!notificationRouterUrl) {
    logger.warn("[push] VITE_NOTIFICATION_ROUTER_URL not set — token upload skipped");
    return;
  }

  const response = await fetch(`${notificationRouterUrl}/v1/push-tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAccessToken}`,
      // Idempotency key prevents duplicate token rows on retry.
      "Idempotency-Key": `${deviceFingerprint}:${result.primary.type}:${result.primary.token.slice(-16)}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "(no body)");
    throw new Error(`push:upload-failed:${response.status}:${text}`);
  }
}
