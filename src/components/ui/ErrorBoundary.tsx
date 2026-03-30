/**
 * @file src/components/ui/ErrorBoundary.tsx
 * @description React Error Boundary для изоляции ошибок в секциях приложения.
 *
 * Архитектура:
 * - Класс-компонент (единственный способ реализовать Error Boundary в React)
 * - Поддерживает кастомный fallback через prop
 * - Логирует ошибки через logger.error
 * - Кнопка "Попробовать снова" сбрасывает состояние ошибки
 *
 * Использование:
 *   <ErrorBoundary section="Feed">
 *     <FeedPage />
 *   </ErrorBoundary>
 */

import React, { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { logger } from "@/lib/logger";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Название секции для отображения в сообщении об ошибке */
  section?: string;
  /** Кастомный fallback-компонент */
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logger.error(
      `[ErrorBoundary] Uncaught error in section "${this.props.section ?? "unknown"}"`,
      { error, componentStack: info.componentStack },
    );
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] p-6 gap-4 text-center">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <div>
          <p className="font-semibold text-foreground">
            {this.props.section ? `Ошибка в разделе «${this.props.section}»` : "Что-то пошло не так"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Попробуйте обновить страницу или повторить позже
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
}
