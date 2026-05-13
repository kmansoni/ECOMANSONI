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
    // Auto-recover once after a tick — only if the component stopped throwing
    setTimeout(() => this.setState({ hasError: false }), 1000);
  }

  override render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}
