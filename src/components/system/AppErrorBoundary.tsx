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
    // Vite/webpack chunk load failure after a deploy or HMR rebuild — auto-reload once.
    // Guard with sessionStorage to prevent infinite reload loops.
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
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-card-foreground text-center space-y-4">
            <h1 className="text-lg font-semibold">Произошла ошибка экрана</h1>
            <p className="text-sm text-muted-foreground">
              Обновите страницу. Если ошибка повторится, данные входа сохранены, можно войти снова.
            </p>
            <button
              onClick={this.handleReload}
              className="w-full h-10 rounded-xl bg-primary text-primary-foreground font-medium"
            >
              Обновить
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
