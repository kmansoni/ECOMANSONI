import React from "react";
import { logger } from "@/lib/logger";
import { clearLastRuntimeError, persistLastRuntimeError, reloadOnChunkFailureOnce, serializeRuntimeError } from "@/lib/runtimeErrorDiagnostics";

type State = {
  hasError: boolean;
  shouldSuggestReload: boolean;
  errorTitle: string | null;
  errorDetails: string | null;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  override state: State = {
    hasError: false,
    shouldSuggestReload: false,
    errorTitle: null,
    errorDetails: null,
  };

  static getDerivedStateFromError(): State {
    return {
      hasError: true,
      shouldSuggestReload: false,
      errorTitle: null,
      errorDetails: null,
    };
  }

  override componentDidCatch(error: unknown) {
    logger.error("app.error_boundary.runtime_error", { error });
    const serialized = serializeRuntimeError(error);
    persistLastRuntimeError(serialized.title, serialized.details ?? error);

    if (reloadOnChunkFailureOnce(error)) {
      return;
    }

    this.setState({
      shouldSuggestReload: true,
      errorTitle: serialized.title,
      errorDetails: serialized.details,
    });
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
              {this.state.errorDetails && (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-300/10 px-3 py-2 text-left">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-100/90">
                    {this.state.errorTitle ?? 'RuntimeError'}
                  </p>
                  <p className="mt-1 break-words text-xs text-amber-50/85">
                    {this.state.errorDetails}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => {
                  clearLastRuntimeError();
                  this.setState({ hasError: false, shouldSuggestReload: false, errorTitle: null, errorDetails: null });
                }}
                className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/15"
              >
                Попробовать снова
              </button>
              {this.state.shouldSuggestReload && (
                <button
                  type="button"
                  onClick={() => {
                    clearLastRuntimeError();
                    window.location.reload();
                  }}
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
