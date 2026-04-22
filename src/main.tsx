import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./index.css";
import { initTelegramMiniApp } from "@/lib/telegramWebApp";
import { initIceCacheAutoInvalidation } from "@/lib/webrtc-config";
import { detectDevice } from "@/lib/platform/device";
import { applyPlatformAttributes } from "@/hooks/usePlatform";
import { ENV } from "@/lib/env";
import { initSessionStore } from "@/auth/sessionStore";
import { initDeviceIdentity } from "@/auth/deviceIdentity";
import { logger } from "@/lib/logger";
import { persistLastRuntimeError, reloadOnChunkFailureOnce } from "@/lib/runtimeErrorDiagnostics";

function setAppHeight() {
  const vvHeight = window.visualViewport?.height;
  const innerHeight = window.innerHeight;
  const docHeight = document.documentElement.clientHeight;

  const candidates = [vvHeight, innerHeight, docHeight].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  const viewportHeight = candidates.length > 0 ? Math.max(...candidates) : 0;
  const safeHeight = Math.max(320, Math.round(viewportHeight));
  document.documentElement.style.setProperty("--app-h", `${safeHeight}px`);
}

setAppHeight();
window.addEventListener("load", setAppHeight);
window.addEventListener("resize", setAppHeight);
window.visualViewport?.addEventListener("resize", setAppHeight);

initTelegramMiniApp();
initIceCacheAutoInvalidation();

// ─── Platform bootstrap ────────────────────────────────────────────────────
// Detect device once on startup and write data-attributes to <html>.
// This enables CSS platform targeting before any React component mounts.
const platformInfo = detectDevice();
applyPlatformAttributes(platformInfo);

window.addEventListener("unhandledrejection", (event) => {
  logger.error("[bootstrap] unhandled promise rejection", { reason: event.reason });
  persistLastRuntimeError("UnhandledPromiseRejection", event.reason);
  reloadOnChunkFailureOnce(event.reason);
});

window.addEventListener("error", (event) => {
  logger.error("[bootstrap] uncaught runtime error", {
    message: event.message,
    error: event.error,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
  persistLastRuntimeError("UncaughtRuntimeError", event.error || event.message);
  reloadOnChunkFailureOnce(event.error || event.message);
});

window.addEventListener("vite:preloadError", (event: Event) => {
  const customEvent = event as CustomEvent;
  const detail = customEvent.detail as { payload?: unknown; error?: unknown } | undefined;
  logger.error("[bootstrap] vite preload error", { detail });
  persistLastRuntimeError("VitePreloadError", detail?.payload || detail?.error || detail);
  reloadOnChunkFailureOnce(detail?.payload || detail?.error || detail);
});

window.__APP_BUILD__ = {
  name: ENV.appName,
  version: ENV.appVersion,
  commit: ENV.appCommitSha,
  buildTime: ENV.appBuildTime,
  mode: ENV.mode,
};

logger.info(
  `[build] ${window.__APP_BUILD__.name} v${window.__APP_BUILD__.version} commit=${window.__APP_BUILD__.commit} built=${window.__APP_BUILD__.buildTime} mode=${window.__APP_BUILD__.mode}`
);

async function bootstrapApp(): Promise<void> {
  try {
    await Promise.all([initSessionStore(), initDeviceIdentity()]);
  } catch (err) {
    logger.error("[bootstrap] Secure auth stores initialization failed", { error: err });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <App />
      </ThemeProvider>
    </StrictMode>
  );
}

void bootstrapApp();
