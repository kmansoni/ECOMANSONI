import React from "react";
import { logger } from "@/lib/logger";

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    logger.error("app.error_boundary.runtime_error", { error });
    // Chunk load failure — auto-reload with debounce
    if (
      error instanceof Error &&
      (error.message.includes("Loading chunk") ||
        error.message.includes("Failed to fetch dynamically imported module") ||
        error.message.includes("Importing a module script failed") ||
        (error as { name?: string }).name === "ChunkLoadError")
    ) {
      const key = "app_chunk_reload_ts";
      const last = Number(sessionStorage.getItem(key) ?? 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
        return;
      }
    }
    // Auto-reload for any critical error (with guard)
    const key = "app_error_reload_ts";
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last > 15_000) {
      sessionStorage.setItem(key, String(Date.now()));
      window.location.reload();
    }
  }

  override render() {
    if (this.state.hasError) {
      // Auto-reload handles recovery; this is a fallback if reload was debounced
      return this.props.children;
    }
    return this.props.children;
  }
}
