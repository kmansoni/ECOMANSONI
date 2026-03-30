/**
 * Screen / CPU Wake Lock — prevents device from sleeping during active calls.
 *
 * Strategy per platform:
 *
 *   Android native  → @capacitor-community/keep-awake plugin (uses PowerManager
 *                     PARTIAL_WAKE_LOCK). Falls back to Web WakeLock API.
 *   iOS native      → UIApplication.shared.isIdleTimerDisabled = true via
 *                     @capacitor-community/keep-awake. Falls back to Web WakeLock.
 *   PWA / browser   → Screen Wake Lock API (navigator.wakeLock.request("screen")).
 *                     Reacquired on visibilitychange (browser releases lock when
 *                     tab is hidden). NOT available on iOS Safari < 16.4.
 *   iOS PWA < 16.4  → No reliable API; the caller must show a UI tap-to-keep-alive
 *                     prompt as the only safe degradation path.
 *
 * DoS protection:
 *   - Callers must call releasePlatformWakeLock() in all code paths (including
 *     error/cancel/timeout handlers) to prevent battery drain.
 *   - A hard timeout (default 90 seconds) auto-releases the lock if the caller
 *     fails to release it — prevents battery drain from abandoned calls.
 *
 * Concurrency:
 *   - Only one lock is held at a time. Nested acquire calls are reference-counted.
 *   - Thread-safe because JS is single-threaded; no mutex needed.
 */

import { detectDevice } from "@/lib/platform/device";
import { Capacitor } from "@capacitor/core";
import { logger } from "../logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WakeLockHandle {
  release(): Promise<void>;
}

// ─── Internal state ───────────────────────────────────────────────────────────

let _refCount = 0;
let _nativeLockActive = false;
let _webLockSentinel: WakeLockSentinel | null = null;
let _hardTimeoutId: ReturnType<typeof setTimeout> | null = null;

const HARD_TIMEOUT_MS = 90_000; // 90 s — call ring timeout upper bound

type KeepAwakePlugin = {
  keepAwake?: () => Promise<void>;
  allowSleep?: () => Promise<void>;
};

function getKeepAwakePlugin(): KeepAwakePlugin | null {
  // Access plugin through Capacitor registry to avoid bundling hard dependency.
  const plugins = (Capacitor as { Plugins?: Record<string, unknown> }).Plugins;
  if (!plugins || !plugins.KeepAwake) return null;
  return plugins.KeepAwake as KeepAwakePlugin;
}

// ─── Platform-specific acquire ────────────────────────────────────────────────

async function acquireNativeLock(): Promise<void> {
  if (_nativeLockActive) return;
  try {
    const KeepAwake = getKeepAwakePlugin();
    if (!KeepAwake?.keepAwake) {
      throw new Error("KeepAwake plugin unavailable");
    }
    await KeepAwake.keepAwake();
    _nativeLockActive = true;
  } catch (err) {
    logger.warn("[wakelock] KeepAwake plugin unavailable, falling back to WebLock", { error: err });
    await acquireWebLock();
  }
}

async function releaseNativeLock(): Promise<void> {
  if (!_nativeLockActive) return;
  try {
    const KeepAwake = getKeepAwakePlugin();
    if (KeepAwake?.allowSleep) {
      await KeepAwake.allowSleep();
    }
  } catch {
    // Plugin may have crashed — silent no-op; battery impact minimal.
  } finally {
    _nativeLockActive = false;
  }
}

async function acquireWebLock(): Promise<void> {
  if (!("wakeLock" in navigator)) return; // not supported (iOS < 16.4, Firefox < 126)
  if (_webLockSentinel) return; // already held
  try {
    _webLockSentinel = await (navigator as any).wakeLock.request("screen");

    // Re-acquire when tab becomes visible again (browser auto-releases on hide)
    _webLockSentinel!.addEventListener("release", () => {
      _webLockSentinel = null;
      if (_refCount > 0 && document.visibilityState === "visible") {
        acquireWebLock().catch(() => {/* best-effort */});
      }
    });
  } catch (err) {
    logger.warn("[wakelock] Navigator.wakeLock failed", { error: err });
  }
}

async function releaseWebLock(): Promise<void> {
  if (!_webLockSentinel) return;
  try {
    await _webLockSentinel.release();
  } catch {
    // Sentinel may already be released by browser.
  } finally {
    _webLockSentinel = null;
  }
}

function armHardTimeout(): void {
  clearHardTimeout();
  _hardTimeoutId = setTimeout(async () => {
    logger.warn("[wakelock] Hard timeout reached — force releasing wake lock");
    _refCount = 1; // Force single release
    await releasePlatformWakeLock();
  }, HARD_TIMEOUT_MS);
}

function clearHardTimeout(): void {
  if (_hardTimeoutId !== null) {
    clearTimeout(_hardTimeoutId);
    _hardTimeoutId = null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Acquire a screen / CPU wake lock.
 *
 * Returns a handle with a `release()` method. Always call `handle.release()`
 * in a `finally` block to guarantee battery safety.
 *
 * @example
 * ```ts
 * const lock = await acquirePlatformWakeLock();
 * try {
 *   await handleIncomingCall(callId);
 * } finally {
 *   await lock.release();
 * }
 * ```
 */
export async function acquirePlatformWakeLock(): Promise<WakeLockHandle> {
  _refCount++;

  if (_refCount === 1) {
    // First acquisition — actually acquire the lock.
    armHardTimeout();
    const device = detectDevice();
    if (device.runtime === "capacitor-native") {
      await acquireNativeLock();
    } else {
      await acquireWebLock();
    }
  }

  return {
    async release(): Promise<void> {
      await releasePlatformWakeLock();
    },
  };
}

/**
 * Release the wake lock.
 * Reference-counted: underlying lock only released when all callers release.
 */
export async function releasePlatformWakeLock(): Promise<void> {
  if (_refCount <= 0) return;
  _refCount = Math.max(0, _refCount - 1);

  if (_refCount === 0) {
    clearHardTimeout();
    const device = detectDevice();
    if (device.runtime === "capacitor-native") {
      await releaseNativeLock();
    } else {
      await releaseWebLock();
    }
  }
}
