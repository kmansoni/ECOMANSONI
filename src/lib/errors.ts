/**
 * @file src/lib/errors.ts
 * @description Единая система обработки ошибок для всего проекта.
 *
 * Архитектура:
 * - AppError: базовый класс ошибок с типизированными кодами
 * - handleApiError: нормализует любое брошенное значение → AppError
 * - showErrorToast: отображает уведомление пользователю через sonner
 * - useErrorHandler: hook для функциональных компонентов
 * - OperationMutex: предотвращает параллельные мутирующие операции
 *
 * Использование во всём проекте вместо разрозненных catch-toast/catch-console.
 */

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Типы ошибок
// ---------------------------------------------------------------------------

export type ErrorCode = 
  | 'NETWORK_ERROR'
  | 'AUTH_ERROR'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export interface AppErrorData {
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Класс ошибки
// ---------------------------------------------------------------------------

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly timestamp: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Сохраняем stack trace в dev mode
    if (import.meta.env.DEV) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): AppErrorData {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }

  override toString(): string {
    return `[${this.code}] ${this.message}`;
  }
}

// ---------------------------------------------------------------------------
// Фабрики ошибок
// ---------------------------------------------------------------------------

export const errors = {
  network(message = 'Ошибка сети'): AppError {
    return new AppError('NETWORK_ERROR', message, 0);
  },

  auth(message = 'Требуется авторизация'): AppError {
    return new AppError('AUTH_ERROR', message, 401);
  },

  notFound(message = 'Ресурс не найден'): AppError {
    return new AppError('NOT_FOUND', message, 404);
  },

  validation(message = 'Ошибка валидации'): AppError {
    return new AppError('VALIDATION_ERROR', message, 400);
  },

  rateLimit(message = 'Слишком много запросов'): AppError {
    return new AppError('RATE_LIMIT_ERROR', message, 429);
  },

  server(message = 'Ошибка сервера'): AppError {
    return new AppError('SERVER_ERROR', message, 500);
  },

  unknown(message = 'Неизвестная ошибка'): AppError {
    return new AppError('UNKNOWN_ERROR', message, 500);
  },
};

// ---------------------------------------------------------------------------
// Универсальный обработчик
// ---------------------------------------------------------------------------

export function handleApiError(err: unknown): AppError {
  // Уже AppError
  if (err instanceof AppError) {
    return err;
  }

  // Supabase ошибка
  if (err && typeof err === 'object' && 'code' in err) {
    const errObj = err as Record<string, unknown>;
    const code = String(errObj.code ?? '');
    const message = String(errObj.message ?? '');
    
    if (code === 'PGRST116' || message.includes('not found')) {
      return errors.notFound(message);
    }
    
    if (code === '42501' || message.includes('row-level security')) {
      return errors.auth('Доступ запрещён');
    }
    
    if (code === '23505' || message.includes('unique')) {
      return errors.validation('Уже существует');
    }
    
    if (code.startsWith('22') || message.includes('syntax')) {
      return errors.server('Ошибка базы данных');
    }
  }

  // Network error
  if (err && typeof err === 'object' && 'name' in err) {
    const name = String((err as Record<string, unknown>).name ?? '');
    if (name === 'TypeError' && String(err).includes('fetch')) {
      return errors.network('Нет подключения к интернету');
    }
  }

  // Проверяем статус код из response
  if (err && typeof err === 'object' && 'status' in err) {
    const errObj = err as Record<string, unknown>;
    const status = Number(errObj.status ?? 0);
    const message = String(errObj.message ?? 'Ошибка');
    
    if (status === 401) return errors.auth(message);
    if (status === 403) return errors.auth('Доступ запрещён');
    if (status === 404) return errors.notFound(message);
    if (status === 429) return errors.rateLimit(message);
    if (status >= 500) return errors.server(message);
  }

  // Default: unknown
  return errors.unknown(err instanceof Error ? err.message : String(err));
}

// ---------------------------------------------------------------------------
// Форматирование для пользователя
// ---------------------------------------------------------------------------

export function getUserMessage(error: AppError): string {
  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Проверьте подключение к интернету';
    case 'AUTH_ERROR':
      return 'Войдите в аккаунт';
    case 'NOT_FOUND':
      return 'Контент не найден';
    case 'VALIDATION_ERROR':
      return error.message;
    case 'RATE_LIMIT_ERROR':
      return 'Попробуйте позже';
    case 'SERVER_ERROR':
      return 'Что-то пошло не так';
    default:
      return 'Произошла ошибка';
  }
}

// ---------------------------------------------------------------------------
// Toast уведомления
// ---------------------------------------------------------------------------

export function showErrorToast(err: unknown, customMessage?: string): void {
  const error = handleApiError(err);
  const message = customMessage || getUserMessage(error);
  
  // В dev mode показываем больше деталей
  if (import.meta.env.DEV) {
    logger.error('[Error] ' + error.toString(), { error, details: error.details });
  }
  
  toast.error(message, {
    duration: 4000,
    id: `error-${error.timestamp}`,
  });
}

export function showSuccessToast(message: string): void {
  toast.success(message, {
    duration: 2000,
  });
}

// ---------------------------------------------------------------------------
// Debounce для предотвращения race conditions
// ---------------------------------------------------------------------------

export function createDebouncedFunction<T extends (...args: never[]) => unknown>(
  fn: T,
  delayMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastCallTime = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    lastCallTime = now;

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      // Проверяем, что это всё ещё последний вызов
      if (lastCallTime === now) {
        fn(...args);
      }
    }, delayMs);
  };
}

// ---------------------------------------------------------------------------
// Mutex для предотвращения параллельных операций
// ---------------------------------------------------------------------------

export class OperationMutex {
  private inProgress = false;
  private queue: Array<() => void> = [];

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.inProgress) {
      this.inProgress = true;
      try {
        return await operation();
      } finally {
        this.inProgress = false;
        this.processQueue();
      }
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await operation());
        } catch (e) {
          reject(e);
        } finally {
          this.inProgress = false;
          this.processQueue();
        }
      });
    });
  }

  private processQueue(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.inProgress = true;
        next();
      }
    }
  }

  isLocked(): boolean {
    return this.inProgress;
  }
}

// ---------------------------------------------------------------------------
// Хук для использования в компонентах
// ---------------------------------------------------------------------------

export function useErrorHandler() {
  const [error, setError] = useState<AppError | null>(null);

  const handleError = useCallback((err: unknown) => {
    const appError = handleApiError(err);
    setError(appError);
    showErrorToast(appError);
    return appError;
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return { error, handleError, clearError };
}

export function assertDefined<T>(value: T | null | undefined, message = 'Value is required'): asserts value is T {
  if (value === null || value === undefined) {
    throw errors.validation(message);
  }
}

export function assertString(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw errors.validation(`${fieldName} must be a non-empty string`);
  }
}

export function assertUuid(value: unknown, fieldName: string): asserts value is string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof value !== 'string' || !uuidRegex.test(value)) {
    throw errors.validation(`${fieldName} must be a valid UUID`);
  }
}

// ---------------------------------------------------------------------------
// Экспорт
// ---------------------------------------------------------------------------

export default {
  AppError,
  errors,
  handleApiError,
  getUserMessage,
  showErrorToast,
  showSuccessToast,
  createDebouncedFunction,
  OperationMutex,
  useErrorHandler,
  assertDefined,
  assertString,
  assertUuid,
};