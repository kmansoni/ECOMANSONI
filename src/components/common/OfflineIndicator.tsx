import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOfflineStatus } from '@/hooks/useOfflineStatus';
import { cn } from '@/lib/utils';

type BannerState = 'hidden' | 'offline' | 'reconnected';

/**
 * OfflineIndicator — тонкая полоска вверху экрана (Telegram-style).
 * Состояния:
 *   hidden      → компонент не отображается
 *   offline     → красная полоска "Нет подключения"
 *   reconnected → зелёная полоска "Подключено", исчезает через 2.5 секунды
 */
export function OfflineIndicator() {
  const { isOnline } = useOfflineStatus();
  const [bannerState, setBannerState] = useState<BannerState>('hidden');
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Отслеживаем предыдущее значение isOnline, чтобы определить момент восстановления
  const prevOnlineRef = useRef<boolean>(isOnline);

  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;

    if (!isOnline) {
      // Сеть пропала
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setBannerState('offline');
    } else if (isOnline && !wasOnline) {
      // Сеть восстановлена (переход offline → online)
      setBannerState('reconnected');
      hideTimer.current = setTimeout(() => {
        setBannerState('hidden');
      }, 2500);
    }

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, [isOnline]);

  if (bannerState === 'hidden') return null;

  const isOffline = bannerState === 'offline';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2',
        'h-8 px-4 text-xs font-medium text-white',
        'transition-all duration-300 ease-in-out',
        // Плавная анимация появления
        'animate-in slide-in-from-top-full',
        isOffline
          ? 'bg-red-600/95 backdrop-blur-sm'
          : 'bg-green-600/95 backdrop-blur-sm'
      )}
    >
      {isOffline ? (
        <>
          <WifiOff className="w-3.5 h-3.5 shrink-0" />
          <span>Нет подключения</span>
        </>
      ) : (
        <>
          <Wifi className="w-3.5 h-3.5 shrink-0" />
          <span>Подключено</span>
        </>
      )}
    </div>
  );
}
