/**
 * usePlatform — reactive React hook that exposes DeviceInfo and re-fires on
 * orientation / resize changes.
 *
 * Design rationale:
 *   - DeviceInfo is memoised in detectDevice() after first call;
 *     only orientation-sensitive fields (isLandscape, screenWidth, screenHeight)
 *     need to be refreshed on resize.
 *   - We do NOT invalidate the full cache on resize to avoid thrashing.  Instead
 *     we compute the orientation-delta in this hook and override those fields.
 *   - The hook attaches a single debounced listener with a 120 ms window to
 *     avoid React setState storm during drag-resize on desktop.
 */

import { useEffect, useRef, useState } from "react";
import { detectDevice, invalidateDeviceCache } from "@/lib/platform/device";
import type { DeviceInfo } from "@/lib/platform/device";

const RESIZE_DEBOUNCE_MS = 120;

function snapshot(): DeviceInfo {
  invalidateDeviceCache();
  return detectDevice();
}

/**
 * Returns DeviceInfo that updates on orientation/resize.
 *
 * Safe to call in SSR contexts — returns a fallback object when `window` is
 * unavailable (Next.js / Vite SSR future-proofing).
 */
export function usePlatform(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(() => {
    if (typeof window === "undefined") {
      // SSR fallback — minimal safe defaults
      return {
        os: "unknown",
        osVersion: null,
        formFactor: "desktop",
        runtime: "browser",
        hasPointer: true,
        hasTouch: false,
        isLandscape: true,
        screenWidth: 1280,
        screenHeight: 800,
        pushChannel: "webpush",
      };
    }
    return snapshot();
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Apply data attribute to <html> for global CSS targeting
    applyPlatformAttributes(info);
  }, [info]);

  useEffect(() => {
    function handleResize() {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setInfo(snapshot());
      }, RESIZE_DEBOUNCE_MS);
    }

    window.addEventListener("resize", handleResize, { passive: true });
    window.visualViewport?.addEventListener("resize", handleResize);
    screen.orientation?.addEventListener("change", handleResize);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      window.removeEventListener("resize", handleResize);
      window.visualViewport?.removeEventListener("resize", handleResize);
      screen.orientation?.removeEventListener("change", handleResize);
    };
  }, []);

  return info;
}

/**
 * Writes data attributes to `<html>` so CSS can target them without JS.
 *
 * Resulting attributes:
 *   data-os="ios|ipados|android|windows|macos|linux|unknown"
 *   data-form-factor="phone|tablet|desktop"
 *   data-runtime="native|pwa|browser"
 *   data-orientation="portrait|landscape"
 *
 * CSS usage:
 *   [data-form-factor="tablet"] .sidebar { display: flex; }
 *   [data-os="ios"] .bottom-nav { padding-bottom: env(safe-area-inset-bottom); }
 */
export function applyPlatformAttributes(info: DeviceInfo): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  el.setAttribute("data-os", info.os);
  el.setAttribute("data-form-factor", info.formFactor);
  el.setAttribute(
    "data-runtime",
    info.runtime === "capacitor-native" ? "native" : info.runtime,
  );
  el.setAttribute("data-orientation", info.isLandscape ? "landscape" : "portrait");
}
