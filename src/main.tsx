import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./index.css";
import { initTelegramMiniApp } from "@/lib/telegramWebApp";
import { initIceCacheAutoInvalidation } from "@/lib/webrtc-config";

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
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-h", `${viewportHeight}px`);
}

setAppHeight();
window.addEventListener("resize", setAppHeight);
window.visualViewport?.addEventListener("resize", setAppHeight);

initTelegramMiniApp();
initIceCacheAutoInvalidation();

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

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <App />
  </ThemeProvider>
);
