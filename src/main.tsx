import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/contexts/ThemeContext";
import App from "./App.tsx";
import "./index.css";
import { initIceCacheAutoInvalidation } from "@/lib/webrtc-config";
import { detectDevice } from "@/lib/platform/device";
import { applyPlatformAttributes } from "@/hooks/usePlatform";
import { ENV } from "@/lib/env";
import { initSessionStore } from "@/auth/sessionStore";
import { initDeviceIdentity } from "@/auth/deviceIdentity";
import { logger } from "@/lib/logger";
import { persistLastRuntimeError, reloadOnChunkFailureOnce } from "@/lib/runtimeErrorDiagnostics";

function isTransientNetworkRuntimeError(reason: unknown): boolean {
  const text =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : String((reason as { message?: unknown; name?: unknown } | null | undefined)?.message ?? reason ?? "");

  return /abort|aborted|failed to fetch|networkerror|err_aborted|websocket is closed before the connection is established/i.test(text);
}

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

initIceCacheAutoInvalidation();

// ─── Platform bootstrap ────────────────────────────────────────────────────
// Detect device once on startup and write data-attributes to <html>.
// This enables CSS platform targeting before any React component mounts.
const platformInfo = detectDevice();
applyPlatformAttributes(platformInfo);

window.addEventListener("unhandledrejection", (event) => {
  if (isTransientNetworkRuntimeError(event.reason)) {
    logger.warn("[bootstrap] transient unhandled promise rejection", { reason: event.reason });
    event.preventDefault();
    return;
  }
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

// Synchronously apply saved theme before React hydrates to prevent resize flicker
const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.classList.remove("light", "dark");
document.documentElement.classList.add(savedTheme);
document.documentElement.style.colorScheme = savedTheme;

async function bootstrapApp(): Promise<void> {
  try {
    await Promise.all([initSessionStore(), initDeviceIdentity()]);
  } catch (err) {
    logger.error("[bootstrap] Secure auth stores initialization failed", { error: err });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </StrictMode>
  );
}

void bootstrapApp();
