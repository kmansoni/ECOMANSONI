/**
 * R2: Debounce hook for preventing double-clicks
 */

import { useCallback, useRef } from 'react';

/**
 * Creates a debounced version of a callback
 * Prevents rapid successive calls (e.g., double-click on Like)
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 300
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCallRef = useRef<number>(0);

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      
      // If called within the delay period, ignore
      if (now - lastCallRef.current < delay) {
        return;
      }

      lastCallRef.current = now;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      return callback(...args);
    }) as T,
    [callback, delay]
  );
}

/**
 * Creates a throttled version of a callback
 * Ensures at most one call per interval
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  interval: number = 300
): T {
  const lastCallRef = useRef<number>(0);
  const pendingRef = useRef<boolean>(false);

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();
      const elapsed = now - lastCallRef.current;

      if (elapsed >= interval && !pendingRef.current) {
        lastCallRef.current = now;
        pendingRef.current = true;
        
        const result = callback(...args);
        
        // If it's a promise, wait for it
        if (result instanceof Promise) {
          result.finally(() => {
            pendingRef.current = false;
          });
        } else {
          pendingRef.current = false;
        }
        
        return result;
      }
    }) as T,
    [callback, interval]
  );
}

/**
 * Hook for optimistic UI updates with rollback
 */
export function useOptimisticAction<T>(
  initialValue: T,
  asyncAction: () => Promise<void>,
  rollbackValue: T
): [T, () => void, boolean] {
  const [value, setValue] = useState(initialValue);
  const [isPending, setIsPending] = useState(false);

  const execute = useCallback(async () => {
    if (isPending) return;
    
    setIsPending(true);
    setValue(rollbackValue); // Optimistic update
    
    try {
      await asyncAction();
    } catch (error) {
      setValue(initialValue); // Rollback on error
    } finally {
      setIsPending(false);
    }
  }, [asyncAction, initialValue, rollbackValue, isPending]);

  return [value, execute, isPending];
}

// Need to import useState for useOptimisticAction
import { useState } from 'react';
