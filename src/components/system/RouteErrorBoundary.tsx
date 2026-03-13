import React from "react";
import { logger } from "@/lib/logger";

type State = {
  hasError: boolean;
  errorDetails?: string;
};

export class RouteErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    const details =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : typeof error === "string"
          ? error
          : "Unknown runtime error";

    this.setState({ errorDetails: details });
    logger.error("route.error_boundary.runtime_error", { error });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground space-y-3">
            <h2 className="text-lg font-semibold">Экран временно недоступен</h2>
            <p className="text-sm text-muted-foreground">
              Произошла ошибка загрузки раздела. Попробуйте обновить страницу.
            </p>
            {this.state.errorDetails && (
              <p className="text-xs text-muted-foreground/80 break-words rounded-lg bg-muted/40 px-3 py-2">
                {this.state.errorDetails}
              </p>
            )}
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
