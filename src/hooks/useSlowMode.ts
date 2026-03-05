/**
 * useSlowMode — управление slow mode в групповых чатах.
 *
 * Slow mode ограничивает частоту отправки сообщений участниками группы.
 * Администраторы не ограничены.
 *
 * Storage: Supabase `group_settings.slow_mode_seconds` + localStorage fallback.
 * UI: таймер обратного отсчёта на textarea, блокировка кнопки Send.
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface SlowModeConfig {
  /** Delay in seconds between messages. 0 = disabled. */
  delaySeconds: number;
  /** Whether current user is exempt (admin/owner). */
  isExempt: boolean;
}

export interface UseSlowModeReturn {
  /** Seconds remaining until user can send next message. 0 = can send. */
  remainingSeconds: number;
  /** Whether slow mode is active and user is restricted right now. */
  isRestricted: boolean;
  /** Whether slow mode is enabled for this group at all. */
  isEnabled: boolean;
  /** Call after successfully sending a message to start cooldown. */
  recordSend: () => void;
  /** The configured delay in seconds. */
  delaySeconds: number;
}

const LS_KEY = (groupId: string, userId: string) => `slow_mode_last_send_${groupId}_${userId}`;

export function useSlowMode(
  groupId: string | null,
  userId: string | null,
  config: SlowModeConfig
): UseSlowModeReturn {
  const { delaySeconds, isExempt } = config;
  const isEnabled = delaySeconds > 0;

  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load last send time from localStorage
  const getLastSendTime = useCallback((): number => {
    if (!groupId || !userId) return 0;
    try {
      const raw = localStorage.getItem(LS_KEY(groupId, userId));
      return raw ? parseInt(raw, 10) : 0;
    } catch {
      return 0;
    }
  }, [groupId, userId]);

  // Calculate remaining seconds
  const calcRemaining = useCallback((): number => {
    if (!isEnabled || isExempt || !groupId || !userId) return 0;
    const lastSend = getLastSendTime();
    if (!lastSend) return 0;
    const elapsed = Math.floor((Date.now() - lastSend) / 1000);
    return Math.max(0, delaySeconds - elapsed);
  }, [isEnabled, isExempt, delaySeconds, getLastSendTime, groupId, userId]);

  // Start/update countdown timer
  useEffect(() => {
    if (!isEnabled || isExempt) {
      setRemainingSeconds(0);
      return;
    }

    const update = () => setRemainingSeconds(calcRemaining());
    update();

    intervalRef.current = setInterval(update, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isEnabled, isExempt, calcRemaining]);

  const recordSend = useCallback(() => {
    if (!groupId || !userId || !isEnabled || isExempt) return;
    try {
      localStorage.setItem(LS_KEY(groupId, userId), String(Date.now()));
    } catch {}
    setRemainingSeconds(delaySeconds);
  }, [groupId, userId, isEnabled, isExempt, delaySeconds]);

  return {
    remainingSeconds,
    isRestricted: remainingSeconds > 0,
    isEnabled,
    recordSend,
    delaySeconds,
  };
}
