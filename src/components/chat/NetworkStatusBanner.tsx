import { useEffect, useRef, useState } from 'react';
import { Loader2, WifiOff, CheckCircle2 } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';

type BannerPhase = 'idle' | 'waiting' | 'updating' | 'done';

/**
 * NetworkStatusBanner — внутричатовый баннер состояния сети.
 *
 * Фазы:
 *   idle     → не отображается
 *   waiting  → "Ожидание сети..." (серый) — когда offline
 *   updating → "Обновление..." (синий) — анимированный спиннер, 1.5 сек после восстановления
 *   done     → "Подключено" (зелёный) → исчезает через 1.5 сек
 */
export function NetworkStatusBanner() {
  const { isOnline } = useOfflineStatus();
  const [phase, setPhase] = useState<BannerPhase>('idle');
  const prevOnline = useRef(isOnline);
  const timer1 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timer2 = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  if (phase === 'idle') return null;

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
      )}
    >
      {phase === 'waiting' && (
        <>
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Ожидание сети...</span>
        </>
      )}
      {phase === 'updating' && (
        <>
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          <span>Обновление...</span>
        </>
      )}
      {phase === 'done' && (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Подключено</span>
        </>
      )}
    </div>
  );
}
