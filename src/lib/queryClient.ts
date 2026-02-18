/**
 * A2 & A5: TanStack Query client with Circuit Breaker pattern
 * 
 * Features:
 * - Exponential backoff retry
 * - Circuit breaker to prevent cascading failures
 * - Global error handling
 */

import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { captureException } from './sentry';

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

const CIRCUIT_BREAKER_THRESHOLD = 5; // failures before opening circuit
const CIRCUIT_BREAKER_RESET_TIME = 30000; // 30 seconds

/**
 * Check if circuit is open for a given key
 */
function isCircuitOpen(key: string): boolean {
  const state = circuitBreakers.get(key);
  if (!state) return false;
  
  if (state.isOpen) {
    // Check if enough time has passed to try again
    if (Date.now() - state.lastFailure > CIRCUIT_BREAKER_RESET_TIME) {
      // Half-open state - allow one request through
      state.isOpen = false;
      state.failures = 0;
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Record a failure for circuit breaker
 */
function recordFailure(key: string): void {
  const state = circuitBreakers.get(key) || { failures: 0, lastFailure: 0, isOpen: false };
  state.failures++;
  state.lastFailure = Date.now();
  
  if (state.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    state.isOpen = true;
    console.warn(`[Circuit Breaker] Circuit opened for: ${key}`);
  }
  
  circuitBreakers.set(key, state);
}

/**
 * Record a success (reset failures)
 */
function recordSuccess(key: string): void {
  circuitBreakers.delete(key);
}

/**
 * Custom retry function with exponential backoff
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  // Don't retry on 4xx errors (client errors)
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('401') || message.includes('403') || message.includes('404')) {
      return false;
    }
  }
  
  // Max 3 retries
  return failureCount < 3;
}

/**
 * Calculate retry delay with exponential backoff
 */
function getRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 30000);
}

/**
 * Create the query client with optimized settings
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60, // 1 minute
        gcTime: 1000 * 60 * 5, // 5 minutes (formerly cacheTime)
        retry: shouldRetry,
        retryDelay: getRetryDelay,
        refetchOnWindowFocus: false,
        refetchOnReconnect: 'always',
      },
      mutations: {
        retry: 1,
        retryDelay: 1000,
      },
    },
    queryCache: new QueryCache({
      onError: (error, query) => {
        const queryKey = JSON.stringify(query.queryKey);
        recordFailure(queryKey);
        
        // Log to error tracking
        captureException(error, {
          tags: { type: 'query_error' },
          extra: { queryKey: query.queryKey },
        });
        
        console.error('[Query Error]', queryKey, error);
      },
      onSuccess: (_, query) => {
        const queryKey = JSON.stringify(query.queryKey);
        recordSuccess(queryKey);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, variables, context, mutation) => {
        captureException(error, {
          tags: { type: 'mutation_error' },
          extra: { mutationKey: mutation.options.mutationKey },
        });
        
        console.error('[Mutation Error]', error);
      },
    }),
  });
}

/**
 * Export circuit breaker utilities for manual use
 */
export const circuitBreaker = {
  isOpen: isCircuitOpen,
  recordFailure,
  recordSuccess,
};
