/**
 * useLiveHeartbeat — publisher keepalive heartbeat.
 *
 * Sends a heartbeat to the Gateway every 30 seconds while `enabled` is true.
 * Retries once on failure before marking `isAlive = false`.
 * Interval is cleared on unmount or when `enabled` transitions to false.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { sendHeartbeat } from '@/services/livestreamApi';

export interface UseLiveHeartbeatReturn {
  isAlive: boolean;
  lastHeartbeat: Date | null;
}

const INTERVAL_MS = 30_000;
const MAX_RETRY = 1;

/**
 * Sends periodic heartbeats for an active live session.
 * Disable by passing `enabled = false` or `sessionId = null`.
 */
export function useLiveHeartbeat(
  sessionId: number | null,
  enabled: boolean,
): UseLiveHeartbeatReturn {
  const [isAlive, setIsAlive] = useState(true);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryRef = useRef(0);

  const beat = useCallback(async () => {
    if (sessionId == null) return;
    try {
      await sendHeartbeat(sessionId);
      setIsAlive(true);
      setLastHeartbeat(new Date());
      retryRef.current = 0;
    } catch {
      if (retryRef.current < MAX_RETRY) {
        retryRef.current += 1;
        // Immediate retry once
        try {
          await sendHeartbeat(sessionId);
          setIsAlive(true);
          setLastHeartbeat(new Date());
          retryRef.current = 0;
        } catch {
          setIsAlive(false);
        }
      } else {
        setIsAlive(false);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (!enabled || sessionId == null) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Send immediately on enable
    void beat();

    intervalRef.current = setInterval(() => {
      void beat();
    }, INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, sessionId, beat]);

  return { isAlive, lastHeartbeat };
}
