import React from "react";
import { logger } from "@/lib/logger";
import { AlertTriangle, RefreshCw } from "lucide-react";

type State = {
  hasError: boolean;
};

export class RouteErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown) {
    logger.error("route.error_boundary.runtime_error", { error });
  }

  handleReset = (): void => {
    this.setState({ hasError: false });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] p-6 gap-3 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <div>
            <p className="font-semibold text-foreground">Ошибка загрузки раздела</p>
            <p className="text-sm text-muted-foreground mt-1">
              Что-то пошло не так. Попробуйте перезагрузить страницу.
            </p>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
