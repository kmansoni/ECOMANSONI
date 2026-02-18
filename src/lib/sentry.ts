/**
 * A3: Centralized Error Tracking
 * 
 * Lightweight error tracking module that can be replaced with Sentry SDK
 * when you're ready to integrate with their service.
 * 
 * Usage:
 * - import { captureException, captureMessage } from '@/lib/sentry';
 * - captureException(error);
 * - captureMessage('Something happened', 'warning');
 */

type LogLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

interface ErrorContext {
  user?: { id: string; email?: string };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

// Error queue for batch reporting
const errorQueue: Array<{
  error: Error;
  context: ErrorContext;
  timestamp: Date;
}> = [];

// Check if we're in production
const isProduction = import.meta.env.PROD;

/**
 * Capture an exception and report it
 */
export function captureException(error: Error | unknown, context: ErrorContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));
  
  // Always log to console in development
  if (!isProduction) {
    console.error('[Error Tracking]', err, context);
    return;
  }

  // Queue for batch reporting
  errorQueue.push({
    error: err,
    context,
    timestamp: new Date(),
  });

  // In production, this is where you'd send to Sentry
  // Example with Sentry SDK:
  // Sentry.captureException(err, { extra: context.extra, tags: context.tags });
  
  console.error('[Sentry Stub]', err.message, context);
}

/**
 * Capture a message with a log level
 */
export function captureMessage(message: string, level: LogLevel = 'info', context: ErrorContext = {}): void {
  if (!isProduction) {
    console.log(`[${level.toUpperCase()}]`, message, context);
    return;
  }

  // In production, send to Sentry
  // Sentry.captureMessage(message, level);
  console.log(`[Sentry Stub] ${level}:`, message);
}

/**
 * Set user context for error tracking
 */
export function setUser(user: { id: string; email?: string } | null): void {
  if (!isProduction) {
    console.log('[Error Tracking] User set:', user?.id);
    return;
  }
  
  // Sentry.setUser(user);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  if (!isProduction) {
    console.debug(`[Breadcrumb] ${category}:`, message, data);
    return;
  }
  
  // Sentry.addBreadcrumb({ category, message, data, level: 'info' });
}

/**
 * Initialize error tracking (call in main.tsx)
 * 
 * To use Sentry:
 * 1. npm install @sentry/react
 * 2. Uncomment Sentry.init in this function
 * 3. Add VITE_SENTRY_DSN to your environment
 */
export function initErrorTracking(): void {
  if (!isProduction) {
    console.log('[Error Tracking] Running in development mode - errors logged to console');
    return;
  }

  // Uncomment when ready to use Sentry:
  /*
  import * as Sentry from '@sentry/react';
  
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
  */
  
  console.log('[Error Tracking] Initialized (stub mode)');
}

// Global error handler
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    captureException(event.error, {
      tags: { type: 'uncaught' },
      extra: { filename: event.filename, lineno: event.lineno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureException(event.reason, {
      tags: { type: 'unhandled_promise' },
    });
  });
}
