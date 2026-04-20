import React from "react";
import { logger } from "@/lib/logger";

type State = {
  hasError: boolean;
  shouldSuggestReload: boolean;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  override state: State = { hasError: false, shouldSuggestReload: false };

  static getDerivedStateFromError(): State {
    return { hasError: true, shouldSuggestReload: false };
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

    this.setState({ shouldSuggestReload: true });
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-6 text-center text-white">
          <div className="max-w-md space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="space-y-2">
              <h1 className="text-lg font-semibold">Приложение столкнулось с ошибкой</h1>
              <p className="text-sm text-gray-300">
                Ошибка зафиксирована в логах. Автоматический hard reload отключен, чтобы не маскировать причину и не ломать сценарий пользователя.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, shouldSuggestReload: false })}
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
              >
                Попробовать снова
              </button>
              {this.state.shouldSuggestReload && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-2xl border border-cyan-300/25 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-50 transition-colors hover:bg-cyan-400/20"
                >
                  Перезагрузить приложение
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
