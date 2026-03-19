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

const CHUNK_RELOAD_ONCE_KEY = "app.chunk_reload_once";

function shouldRecoverLoadError(reason: unknown): boolean {
  const text =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
      ? reason.message
      : String((reason as any)?.message || reason || "");
  return /load failed|loading chunk|chunkloaderror|failed to fetch dynamically imported module|vite:preloaderror/i.test(text);
}

function reloadOnChunkFailureOnce(reason: unknown) {
  if (!shouldRecoverLoadError(reason)) return;
  try {
    const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_ONCE_KEY) === "1";
    if (alreadyReloaded) return;
    sessionStorage.setItem(CHUNK_RELOAD_ONCE_KEY, "1");
  } catch {
    // no-op
  }
  window.location.reload();
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

initTelegramMiniApp();
initIceCacheAutoInvalidation();

// ─── Platform bootstrap ────────────────────────────────────────────────────
// Detect device once on startup and write data-attributes to <html>.
// This enables CSS platform targeting before any React component mounts.
const platformInfo = detectDevice();
applyPlatformAttributes(platformInfo);

window.addEventListener("unhandledrejection", (event) => {
  reloadOnChunkFailureOnce(event.reason);
});

window.addEventListener("error", (event) => {
  reloadOnChunkFailureOnce(event.error || event.message);
});

window.addEventListener("vite:preloadError", (event: Event) => {
  const customEvent = event as CustomEvent;
  const detail = customEvent.detail as { payload?: unknown; error?: unknown } | undefined;
  reloadOnChunkFailureOnce(detail?.payload || detail?.error || detail);
});

window.__APP_BUILD__ = {
  name: ENV.appName,
  version: ENV.appVersion,
  commit: ENV.appCommitSha,
  buildTime: ENV.appBuildTime,
  mode: ENV.mode,
};

console.info(
  "[build]",
  `${window.__APP_BUILD__.name} v${window.__APP_BUILD__.version}`,
  `commit=${window.__APP_BUILD__.commit}`,
  `built=${window.__APP_BUILD__.buildTime}`,
  `mode=${window.__APP_BUILD__.mode}`
);

async function bootstrapApp(): Promise<void> {
  try {
    await Promise.all([initSessionStore(), initDeviceIdentity()]);
  } catch (err) {
    console.error("[bootstrap] Secure auth stores initialization failed", err);
  }

  createRoot(document.getElementById("root")!).render(
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <App />
    </ThemeProvider>
  );
}

void bootstrapApp();
