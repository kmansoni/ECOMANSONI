/**
 * Call Wake Strategy — orchestrates device wake-up for incoming calls.
 *
 * ─── Platform wake-up matrix ────────────────────────────────────────────────
 *
 * iOS native (locked/sleeping):
 *   Server sends PushKit VoIP push → iOS wakes app in background within ms.
 *   App calls CallKit.reportNewIncomingCall() → system call UI shown.
 *   On user accept → app moves to foreground → WakeLock acquired.
 *
 * Android native (locked/sleeping):
 *   Server sends FCM data message with priority=high, contentAvailable=true.
 *   FCM wakes the device even in Doze Mode (uses high-priority FCM channel).
 *   App receives onMessageReceived() in native background service →
 *   posts ConnectionService.onCreateIncomingConnection() → system call UI shown.
 *   On user accept → WakeLock acquired.
 *
 * iOS PWA (background tab / locked):
 *   Server sends APNS Web Push (alert type, NOT VoIP) → iOS shows
 *   notification banner. User taps → app opens → JS receives push event.
 *   WakeLock acquired in foreground after user interaction.
 *   ⚠ Cannot wake from locked screen without user tap — platform limitation.
 *
 * Windows / desktop browser:
 *   Server sends Web Push (VAPID) → browser shows OS notification.
 *   User clicks → app window focuses → WakeLock irrelevant (desktop).
 *
 * ─── JS-side responsibilities ────────────────────────────────────────────────
 *   This module handles what can be done in JS/WebView after the device is
 *   already awake (i.e., foreground or just-returned-to-foreground).
 *   The actual device wake-up from sleep is always initiated by the native
 *   push layer (PushKit / FCM high-priority / WebPush).
 *
 * ─── Security notes ──────────────────────────────────────────────────────────
 *   - Call IDs in push payloads are validated server-side before the call is
 *     presented to the user. The JS layer never trusts the push payload alone.
 *   - WakeLock is acquired only after a validated incoming call event, never
 *     from arbitrary push data — prevents DoS via crafted push messages.
 *   - Hard timeout (WAKE_LOCK_TIMEOUT_MS) ensures battery safety if the call
 *     signalling path fails after the lock is acquired.
 */

import { detectDevice } from "@/lib/platform/device";
import { acquirePlatformWakeLock } from "@/lib/platform/wakelock";
import type { WakeLockHandle } from "@/lib/platform/wakelock";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CallWakeCapability =
  | "full"        // Can wake device from sleep (PushKit / FCM high-priority)
  | "foreground"  // Can only act when app is in foreground
  | "notification-only"; // User must tap notification to wake app

export interface CallWakeContext {
  callId: string;
  callerName: string;
  hasVideo: boolean;
}

export interface ForegroundCallWakeOptions {
  playSound?: boolean;
  vibrate?: boolean;
}

// ─── Capability detection ─────────────────────────────────────────────────────

/**
 * Returns the wake capability for the current device/platform combination.
 * Used by the UI to explain limitations to the user and by the server to
 * route the correct push type.
 */
export function getCallWakeCapability(): CallWakeCapability {
  const device = detectDevice();

  if (device.runtime === "capacitor-native") {
    // Both iOS (PushKit) and Android (FCM high-priority) can wake from sleep.
    return "full";
  }

  // PWA on iOS — APNS Web Push cannot reliably wake from locked screen.
  if (device.os === "ios" || device.os === "ipados") {
    return "notification-only";
  }

  // Android PWA — FCM Web Push can show notification, limited background wake.
  if (device.os === "android") {
    return "notification-only";
  }

  // Desktop (Windows / macOS / Linux) — desktop OS notification.
  return "foreground";
}

// ─── CallKit bridge (iOS native) ──────────────────────────────────────────────

/**
 * Report incoming call to iOS CallKit via the native bridge.
 * This is called from the Capacitor plugin's push handler when a VoIP push
 * is received while the app is in the background.
 *
 * The native Swift code must call `emitCallKitAction({ type: "incoming", ... })`
 * which is then handled by the React call UI.
 */
export function reportIncomingCallToCallKit(ctx: CallWakeContext): void {
  if (typeof window === "undefined") return;
  // Dispatch to native bridge via custom event (handled by Capacitor plugin).
  window.dispatchEvent(
    new CustomEvent("mansoni:callkit-report-incoming", {
      detail: {
        callId: ctx.callId,
        callerName: ctx.callerName,
        hasVideo: ctx.hasVideo,
      },
    }),
  );
}

// ─── Android ConnectionService bridge ────────────────────────────────────────

/**
 * Report incoming call to Android Telecom ConnectionService via native bridge.
 * Triggered when FCM high-priority data message is received in background.
 */
export function reportIncomingCallToTelecom(ctx: CallWakeContext): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("mansoni:telecom-report-incoming", {
      detail: {
        callId: ctx.callId,
        callerName: ctx.callerName,
        hasVideo: ctx.hasVideo,
      },
    }),
  );
}

// ─── Foreground wake orchestration ───────────────────────────────────────────

/**
 * Called when the app is in the foreground and receives an incoming call event.
 * Acquires wake lock, plays ringtone, returns handle for cleanup.
 *
 * Must be called from user-interaction context or native push callback to
 * comply with browser autoplay policies for ringtone audio.
 *
 * @returns WakeLockHandle — call `handle.release()` when call is answered/declined/missed.
 */
export async function activateForegroundCallWake(
  _ctx: CallWakeContext,
  options: ForegroundCallWakeOptions = {},
): Promise<WakeLockHandle> {
  // Acquire wake lock first to prevent screen dimming during ring.
  const lockHandle = await acquirePlatformWakeLock();

  // Attempt to play ringtone via the existing Audio API.
  // Autoplay restrictions: this only works if the tab has had prior user interaction.
  // On native (Capacitor) the system call UI handles ringtone independently.
  const device = detectDevice();
  const shouldPlaySound = options.playSound !== false;
  if (shouldPlaySound && device.runtime !== "capacitor-native") {
    playRingtone().catch(() => {
      // Autoplay blocked — native/web notification sound is the fallback.
    });
  }

  if (options.vibrate && typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate([250, 120, 250]);
    } catch {
      // ignore vibration errors
    }
  }

  return lockHandle;
}

// ─── Ringtone helper ──────────────────────────────────────────────────────────

let _ringtoneAudio: HTMLAudioElement | null = null;

function playRingtone(): Promise<void> {
  if (_ringtoneAudio) return Promise.resolve(); // already playing
  _ringtoneAudio = new Audio("/ringtone.wav");
  _ringtoneAudio.loop = true;
  return _ringtoneAudio.play();
}

export function stopRingtone(): void {
  if (!_ringtoneAudio) return;
  _ringtoneAudio.pause();
  _ringtoneAudio.currentTime = 0;
  _ringtoneAudio = null;
}
