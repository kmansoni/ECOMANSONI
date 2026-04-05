import { useEffect, useRef, useState } from 'react';
import { Loader2, WifiOff, CheckCircle2, Clock } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';
import { getOutboxForUser, subscribeOutbox } from '@/lib/chat/messageOutbox';

type BannerPhase = 'idle' | 'waiting' | 'updating' | 'done';

/**
 * NetworkStatusBanner — внутричатовый баннер состояния сети.
 *
 * Фазы:
 *   idle     → не отображается (если нет pending-сообщений)
 *   waiting  → "Ожидание сети..." (серый) — когда offline
 *   updating → "Обновление..." (синий) — анимированный спиннер, 1.5 сек после восстановления
 *   done     → "Подключено" (зелёный) → исчезает через 1.5 сек
 *
 * Дополнение: показывает счётчик pending/failed сообщений в очереди offline
 * outbox (store-and-forward концепция из Crisis Mesh Messenger / Columba).
 *
 * Props:
 *   userId — для фильтрации outbox конкретного пользователя
 */
export function NetworkStatusBanner({ userId }: { userId?: string } = {}) {
  const { isOnline } = useOfflineStatus();
  const [phase, setPhase] = useState<BannerPhase>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const prevOnline = useRef(isOnline);
  const timer1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe to outbox changes to show pending message count
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = () => {
      getOutboxForUser(userId).then((entries) => {
        if (!cancelled) {
          const count = entries.filter(
            (e) => e.status === 'pending' || e.status === 'sending' || e.status === 'failed'
          ).length;
          setPendingCount(count);
        }
      }).catch(() => {/* outbox count fetch failed, will use stale value */});
    };

    load();
    const unsub = subscribeOutbox(load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [userId]);

  useEffect(() => {
    const was = prevOnline.current;
    prevOnline.current = isOnline;

    if (!isOnline && was) {
      // Стало offline
      [timer1, timer2].forEach((r) => r.current && clearTimeout(r.current));
      setPhase('waiting');
    } else if (isOnline && !was) {
      // Восстановилось
      setPhase('updating');
      timer1.current = setTimeout(() => {
        setPhase('done');
        timer2.current = setTimeout(() => {
          setPhase('idle');
        }, 1500);
      }, 1500);
    }

    return () => {
      [timer1, timer2].forEach((r) => r.current && clearTimeout(r.current));
    };
  }, [isOnline]);

  // Show pending-queue banner even when online (store-and-forward indicator)
  const showPendingBadge = phase === 'idle' && pendingCount > 0;

  if (phase === 'idle' && !showPendingBadge) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center justify-center gap-2 py-1.5 px-4 text-xs font-medium',
        'transition-all duration-300',
        phase === 'waiting' && 'bg-zinc-700/80 text-white/70',
        phase === 'updating' && 'bg-blue-700/80 text-white',
        phase === 'done' && 'bg-green-700/80 text-white',
        showPendingBadge && 'bg-amber-700/80 text-white',
      )}
    >
      {phase === 'waiting' && (
        <>
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Ожидание сети...</span>
          {pendingCount > 0 && (
            <span className="ml-1 opacity-70">
              ({pendingCount} в очереди)
            </span>
          )}
        </>
      )}
      {phase === 'updating' && (
        <>
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          <span>Обновление...</span>
          {pendingCount > 0 && (
            <span className="ml-1 opacity-70">
              отправляем {pendingCount} сообщ.
            </span>
          )}
        </>
      )}
      {phase === 'done' && (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Подключено</span>
        </>
      )}
      {showPendingBadge && (
        <>
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>{pendingCount} сообщ. в очереди отправки</span>
        </>
      )}
    </div>
  );
}
