/**
 * Platform / Device Detection — production-grade, zero-dependency.
 *
 * Security notes:
 *   - UA sniffing is best-effort and never trusted server-side.
 *   - All security-critical decisions (e.g. VoIP push routing) are made server-side
 *     based on the `provider` field of the registered push token, not this module.
 *   - This module provides UI/UX hints only.
 *
 * Detection priority:
 *   1. Capacitor Plugins.Device (native runtime) — authoritative, tamper-resistant.
 *   2. navigator.userAgentData (modern browsers, Chromium family).
 *   3. navigator.userAgent string parsing (fallback, best-effort).
 *   4. viewport heuristics for tablet vs. phone disambiguation.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type OsPlatform =
  | "ios"      // iPhone (native or PWA)
  | "ipados"   // iPad (native or PWA)
  | "android"  // Android phone / tablet (native or PWA)
  | "windows"  // Windows desktop / tablet (PWA or Electron-future)
  | "macos"    // macOS desktop (PWA)
  | "linux"    // Linux desktop
  | "unknown";

export type FormFactor = "phone" | "tablet" | "desktop";

export type RuntimeEnv =
  | "capacitor-native" // Running in Capacitor shell (iOS/Android app)
  | "pwa"              // Installed PWA
  | "browser"          // Regular browser tab
  | "electron";        // Electron shell (future)

export interface DeviceInfo {
  /** Normalised OS identifier. */
  os: OsPlatform;
  /** Form factor heuristic. */
  formFactor: FormFactor;
  /** Runtime environment. */
  runtime: RuntimeEnv;
  /** OS major version string, if determinable. */
  osVersion: string | null;
  /** true if the device has a physical pointer (mouse / stylus). */
  hasPointer: boolean;
  /** true if primary input is touch. */
  hasTouch: boolean;
  /** true if device is in landscape orientation right now. */
  isLandscape: boolean;
  /** Screen logical width in CSS pixels at detection time. */
  screenWidth: number;
  /** Screen logical height in CSS pixels at detection time. */
  screenHeight: number;
  /**
   * Recommended push channel for this device.
   * Drives which FCM / APNS path the app registers for.
   */
  pushChannel: "apns" | "apns-voip" | "fcm" | "webpush";
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isCapacitorNative(): boolean {
  try {
    return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
  } catch {
    return false;
  }
}

function getCapacitorPlatform(): string | null {
  try {
    return (window as any).Capacitor?.getPlatform?.() ?? null;
  } catch {
    return null;
  }
}

function isPwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function parseUserAgentData(): { os: OsPlatform; osVersion: string | null } | null {
  const uaData = (navigator as any).userAgentData;
  if (!uaData) return null;

  // navigator.userAgentData.platform is low-entropy and available without user prompt
  const platform: string = (uaData.platform ?? "").toLowerCase();

  if (platform === "ios") return { os: "ios", osVersion: null };
  if (platform === "ipados") return { os: "ipados", osVersion: null };
  if (platform.includes("android")) return { os: "android", osVersion: null };
  if (platform.includes("win")) return { os: "windows", osVersion: null };
  if (platform.includes("mac")) return { os: "macos", osVersion: null };
  if (platform.includes("linux")) return { os: "linux", osVersion: null };
  return null;
}

function parseUserAgentString(ua: string): { os: OsPlatform; osVersion: string | null } {
  const lower = ua.toLowerCase();

  // iPad first — iPad UA on iOS 13+ reports "iPad" explicitly, but Safari 13+
  // on iPad can spoof as macOS. Check maxTouchPoints workaround.
  if (/ipad/.test(lower) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
    const match = ua.match(/CPU OS ([\d_]+)/i) || ua.match(/OS ([\d_]+) like/i);
    return {
      os: "ipados",
      osVersion: match ? match[1].replace(/_/g, ".") : null,
    };
  }

  if (/iphone/.test(lower) || /ipod/.test(lower)) {
    const match = ua.match(/OS ([\d_]+) like/i);
    return {
      os: "ios",
      osVersion: match ? match[1].replace(/_/g, ".") : null,
    };
  }

  if (/android/.test(lower)) {
    const match = ua.match(/Android ([\d.]+)/i);
    return { os: "android", osVersion: match ? match[1] : null };
  }

  if (/windows/.test(lower)) {
    const match = ua.match(/Windows NT ([\d.]+)/i);
    return { os: "windows", osVersion: match ? match[1] : null };
  }

  if (/macintosh|mac os x/i.test(ua)) {
    const match = ua.match(/OS X ([\d_]+)/i);
    return { os: "macos", osVersion: match ? match[1].replace(/_/g, ".") : null };
  }

  if (/linux/.test(lower)) {
    return { os: "linux", osVersion: null };
  }

  return { os: "unknown", osVersion: null };
}

function resolveFormFactor(os: OsPlatform, width: number, height: number): FormFactor {
  if (os === "ipados") return "tablet";

  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  if (os === "android") {
    // Android tablets typically have short side >= 600dp
    return minDim >= 600 ? "tablet" : "phone";
  }

  if (os === "ios") return "phone";

  // Windows / macOS / Linux — always desktop
  if (os === "windows" || os === "macos" || os === "linux") return "desktop";

  // Unknown — use viewport heuristic
  if (maxDim >= 1024 && minDim >= 600) return "desktop";
  if (minDim >= 600) return "tablet";
  return "phone";
}

function resolvePushChannel(
  os: OsPlatform,
  runtime: RuntimeEnv,
): DeviceInfo["pushChannel"] {
  if (runtime === "capacitor-native") {
    // Native iOS app uses PushKit (VoIP) for call-wakeup + regular APNS for messages.
    // The push.ts registration layer handles dual-token registration.
    if (os === "ios" || os === "ipados") return "apns-voip";
    // Native Android uses FCM high-priority data messages.
    return "fcm";
  }
  // PWA/browser on Apple devices can use APNS Web Push (iOS 16.4+).
  if (os === "ios" || os === "ipados") return "apns";
  // Everything else uses Web Push / FCM.
  return "webpush";
}

// ─── Public API ───────────────────────────────────────────────────────────────

let _cached: DeviceInfo | null = null;

/**
 * Detect device capabilities. Result is memoised after first call.
 * Call `invalidateDeviceCache()` only after orientation/resize events if needed.
 */
export function detectDevice(): DeviceInfo {
  if (_cached) return _cached;

  const isNative = isCapacitorNative();
  const capPlatform = isNative ? getCapacitorPlatform() : null;

  // Runtime
  let runtime: RuntimeEnv = "browser";
  if (isNative) runtime = "capacitor-native";
  else if (isPwa()) runtime = "pwa";

  // OS
  let os: OsPlatform;
  let osVersion: string | null = null;

  if (isNative && capPlatform) {
    // Capacitor platform strings: "ios" | "android" | "web"
    if (capPlatform === "ios") {
      // Distinguish iPhone vs iPad via screen size (Capacitor native)
      const w = window.screen?.width ?? 0;
      const h = window.screen?.height ?? 0;
      const minDim = Math.min(w, h);
      os = minDim >= 768 ? "ipados" : "ios";
    } else if (capPlatform === "android") {
      os = "android";
    } else {
      // "web" — fall through to UA
      const parsed = parseUserAgentData() ?? parseUserAgentString(navigator.userAgent);
      os = parsed.os;
      osVersion = parsed.osVersion;
    }
  } else {
    const parsed = parseUserAgentData() ?? parseUserAgentString(navigator.userAgent);
    os = parsed.os;
    osVersion = parsed.osVersion;
  }

  const screenWidth = window.screen?.width ?? window.innerWidth ?? 0;
  const screenHeight = window.screen?.height ?? window.innerHeight ?? 0;

  const formFactor = resolveFormFactor(os, screenWidth, screenHeight);
  const isLandscape = screenWidth > screenHeight;

  const hasTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const hasPointer = window.matchMedia("(pointer: fine)").matches;

  const pushChannel = resolvePushChannel(os, runtime);

  _cached = {
    os,
    osVersion,
    formFactor,
    runtime,
    hasPointer,
    hasTouch,
    isLandscape,
    screenWidth,
    screenHeight,
    pushChannel,
  };

  return _cached;
}

/** Force re-detection (e.g. after orientation change). */
export function invalidateDeviceCache(): void {
  _cached = null;
}

/**
 * Returns a stable string key suitable for CSS data attributes and analytics.
 * Format: `{os}-{formFactor}-{runtime}`
 * Example: "ios-phone-capacitor-native" | "android-tablet-pwa" | "windows-desktop-browser"
 */
export function deviceKey(info: DeviceInfo = detectDevice()): string {
  return `${info.os}-${info.formFactor}-${info.runtime.replace("capacitor-native", "native")}`;
}

/**
 * Stable per-device random UUID stored in localStorage.
 * Single canonical implementation — used by VideoCallContext and useVideoCallSfu.
 * Key: "mansoni_calls_v2_device_id" (must not be changed without migration).
 *
 * Security note: stored in localStorage (JS-accessible) — sufficient for device
 * identity in SFU signaling. Not secret; used as peerId component only.
 */
export function getStableCallsDeviceId(): string {
  const STORAGE_KEY = "mansoni_calls_v2_device_id";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created =
      globalThis.crypto?.randomUUID?.() ??
      `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // localStorage blocked (private browsing, storage quota) — return ephemeral ID
    return globalThis.crypto?.randomUUID?.() ?? `dev_ephemeral_${Date.now()}`;
  }
}
