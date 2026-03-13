import { useEffect, useRef, useState, useCallback } from 'react';
import { AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

type FailureState = 'failed' | 'retrying' | 'success';

export interface MessageSendFailureOverlayProps {
  /** ID сообщения — для идентификации */
  messageId: string;
  /** Функция повторной отправки — должна резолвить промис при успехе, reject при ошибке */
  onRetry: () => Promise<void>;
  /** Дополнительный CSS класс */
  className?: string;
}

const AUTO_RETRY_DELAY_MS = 5000;

/**
 * MessageSendFailureOverlay — оверлей ошибки отправки Telegram-style.
 *
 * Поведение:
 * - Показывает красный ! (AlertCircle) и кнопку "⟳ Повторить"
 * - При восстановлении сети — auto-retry через AUTO_RETRY_DELAY_MS мс
 * - При нажатии "Повторить" — немедленный retry
 * - Во время retry — спиннер вместо кнопки
 * - После успеха — компонент убирается (вызывающий компонент должен убрать его из DOM)
 */
export function MessageSendFailureOverlay({
  messageId,
  onRetry,
  className,
}: MessageSendFailureOverlayProps) {
  const [state, setState] = useState<FailureState>('failed');
  const { isOnline } = useOfflineStatus();
  const autoRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (autoRetryTimer.current) clearTimeout(autoRetryTimer.current);
    };
  }, []);

  const executeRetry = useCallback(async () => {
    if (state === 'retrying') return;
    setState('retrying');
    try {
      await onRetry();
      if (isMounted.current) setState('success');
    } catch (error) {
      logger.warn('message-send-failure: retry failed', { messageId, error });
      if (isMounted.current) setState('failed');
    }
  }, [state, onRetry, messageId]);

  // Auto-retry при восстановлении сети
  useEffect(() => {
    if (!isOnline || state !== 'failed') return;
    autoRetryTimer.current = setTimeout(() => {
      if (isMounted.current) executeRetry();
    }, AUTO_RETRY_DELAY_MS);
    return () => {
      if (autoRetryTimer.current) clearTimeout(autoRetryTimer.current);
    };
  }, [isOnline, state, executeRetry]);

  // Если успешно отправлено — компонент исчезает
  if (state === 'success') return null;

  return (
    <div
      data-message-id={messageId}
      className={cn(
        'flex items-center gap-1.5 shrink-0',
        className
      )}
    >
      {state === 'retrying' ? (
        <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
      ) : (
        <>
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" aria-label="Ошибка отправки" />
          <button
            onClick={executeRetry}
            className="flex items-center gap-1 text-red-500 text-xs font-medium hover:text-red-400 transition-colors"
            aria-label="Повторить отправку"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Повторить</span>
          </button>
        </>
      )}
    </div>
  );
}
