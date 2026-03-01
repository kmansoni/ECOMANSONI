import React from "react";

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[AppErrorBoundary] Runtime error:", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
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
