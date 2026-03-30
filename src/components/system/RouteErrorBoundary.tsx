import React from "react";
import { logger } from "@/lib/logger";

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
    // Auto-recover: reset error state after a tick so the route re-renders
    setTimeout(() => this.setState({ hasError: false }), 0);
  }

  override render() {
    // Always render children — error state auto-clears
    return this.props.children;
  }
}
