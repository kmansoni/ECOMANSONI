// Content Core — Retry Policy
// Exponential backoff with jitter, error classification, and retry budget

// ============================================================================
// Error Types
// ============================================================================

export type ErrorType =
  | 'transient'      // Network, timeout, 5xx — retryable
  | 'permanent'       // 400, validation, not found — NOT retryable
  | 'rate_limited'    // 429 — special handling
  | 'auth'            // 401, 403 — may be retryable after token refresh
  | 'unknown';        // default assumption

export interface RetryableError {
  type: ErrorType;
  retryable: boolean;
  retryAfterMs?: number;
  statusCode?: number;
  message: string;
}

// ============================================================================
// Error Classification
// ============================================================================

export function classifyError(
  error: unknown,
  statusCode?: number
): RetryableError {
  const message = error instanceof Error ? error.message : String(error);

  // Explicit status code
  if (statusCode !== undefined) {
    if (statusCode === 429) {
      return {
        type: 'rate_limited',
        retryable: true,
        statusCode,
        message,
      };
    }
    if (statusCode >= 500) {
      return {
        type: 'transient',
        retryable: true,
        statusCode,
        message,
      };
    }
    if (statusCode >= 400 && statusCode < 500) {
      return {
        type: 'permanent',
        retryable: false,
        statusCode,
        message,
      };
    }
  }

  // Network errors
  if (error instanceof TypeError && message.includes('fetch')) {
    return {
      type: 'transient',
      retryable: true,
      message,
    };
  }

  if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT') || message.includes('ENOTFOUND')) {
    return {
      type: 'transient',
      retryable: true,
      message,
    };
  }

  // Auth errors
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('token')) {
    return {
      type: 'auth',
      retryable: true,
      message,
    };
  }

  // Rate limiting
  if (message.includes('429') || message.includes('rate limit') || message.includes('too many requests')) {
    return {
      type: 'rate_limited',
      retryable: true,
      message,
    };
  }

  // Default: assume transient
  return {
    type: 'unknown',
    retryable: true,
    message,
  };
}

// ============================================================================
// Backoff Schedule
// ============================================================================

export interface BackoffConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitterFactor: number;
}

export const DEFAULT_BACKOFF_CONFIG: BackoffConfig = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  maxAttempts: 5,
  jitterFactor: 0.1, // ±10% jitter
};

export function calculateBackoffDelay(
  attempt: number,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): number {
  // Exponential backoff: base * 2^(attempt-1)
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt - 1);

  // Cap at max
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  const finalDelay = Math.round(cappedDelay + jitter);

  return Math.max(0, finalDelay);
}

export interface BackoffScheduleItem {
  attempt: number;
  delayMs: number;
  totalElapsedMs: number;
}

export function generateBackoffSchedule(
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): BackoffScheduleItem[] {
  const schedule: BackoffScheduleItem[] = [];
  let totalElapsedMs = 0;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    const delayMs = calculateBackoffDelay(attempt, config);
    totalElapsedMs += delayMs;
    schedule.push({ attempt, delayMs, totalElapsedMs });
  }

  return schedule;
}

// ============================================================================
// Retry Budget
// ============================================================================

export interface RetryBudget {
  remainingAttempts: number;
  totalAttempts: number;
  isExhausted: boolean;
  nextRetryAt: string | null;
}

export function createRetryBudget(maxAttempts: number): RetryBudget {
  return {
    remainingAttempts: maxAttempts,
    totalAttempts: maxAttempts,
    isExhausted: false,
    nextRetryAt: null,
  };
}

export function consumeRetryAttempt(budget: RetryBudget): RetryBudget {
  const remainingAttempts = Math.max(0, budget.remainingAttempts - 1);
  return {
    ...budget,
    remainingAttempts,
    isExhausted: remainingAttempts === 0,
    nextRetryAt: remainingAttempts > 0 ? new Date().toISOString() : null,
  };
}

export function resetRetryBudget(budget: RetryBudget): RetryBudget {
  return {
    ...budget,
    remainingAttempts: budget.totalAttempts,
    isExhausted: false,
    nextRetryAt: null,
  };
}

// ============================================================================
// Retry Decision
// ============================================================================

export interface RetryDecision {
  shouldRetry: boolean;
  reason: string;
  delayMs?: number;
  budget: RetryBudget;
}

export function shouldRetryWithBackoff(
  error: RetryableError,
  attempt: number,
  budget: RetryBudget,
  config: BackoffConfig = DEFAULT_BACKOFF_CONFIG
): RetryDecision {
  // Budget exhausted
  if (budget.isExhausted || attempt >= budget.totalAttempts) {
    return {
      shouldRetry: false,
      reason: 'Retry budget exhausted',
      budget,
    };
  }

  // Non-retryable error
  if (!error.retryable) {
    return {
      shouldRetry: false,
      reason: `Error type '${error.type}' is not retryable`,
      budget,
    };
  }

  // Calculate delay
  const delayMs = error.retryAfterMs ?? calculateBackoffDelay(attempt, config);
  const nextBudget = consumeRetryAttempt(budget);

  return {
    shouldRetry: true,
    reason: `Error type '${error.type}' is retryable, attempt ${attempt + 1}/${budget.totalAttempts}`,
    delayMs,
    budget: nextBudget,
  };
}

// ============================================================================
// Retry Loop Helper
// ============================================================================

export interface RetryLoopOptions<T> {
  maxAttempts: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: RetryLoopOptions<T>
): Promise<T> {
  const config: BackoffConfig = {
    baseDelayMs: options.baseDelayMs ?? DEFAULT_BACKOFF_CONFIG.baseDelayMs,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_BACKOFF_CONFIG.maxDelayMs,
    maxAttempts: options.maxAttempts,
    jitterFactor: DEFAULT_BACKOFF_CONFIG.jitterFactor,
  };

  let lastError: unknown;
  const budget = createRetryBudget(options.maxAttempts);

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if should retry
      if (options.shouldRetry && !options.shouldRetry(error, attempt)) {
        throw error;
      }

      if (attempt === options.maxAttempts) {
        break;
      }

      // Calculate delay
      const delayMs = calculateBackoffDelay(attempt, config);

      // Notify callback
      options.onRetry?.(attempt, error, delayMs);

      // Wait before retry
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Rate Limit Handling
// ============================================================================

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterMs?: number;
}

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo | null {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');
  const retryAfter = headers.get('Retry-After');

  if (!limit || !remaining || !reset) {
    return null;
  }

  const resetAt = new Date(parseInt(reset, 10) * 1000).toISOString();
  const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined;

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    resetAt,
    retryAfterMs,
  };
}

export function handleRateLimit(rateLimitInfo: RateLimitInfo | null): number {
  if (rateLimitInfo?.retryAfterMs) {
    return rateLimitInfo.retryAfterMs;
  }
  if (rateLimitInfo?.resetAt) {
    const resetAt = new Date(rateLimitInfo.resetAt).getTime();
    const now = Date.now();
    return Math.max(0, resetAt - now);
  }
  return 60000; // Default 1 minute
}
