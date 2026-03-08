import { useState, useEffect, useCallback } from 'react';
import { mediaCache } from '@/lib/mediaCache';

type ConnectionType = '2g' | '3g' | '4g' | 'slow-2g' | 'wifi' | 'bluetooth' | 'ethernet' | 'none' | 'other' | 'unknown';

interface NetworkInformation extends EventTarget {
  effectiveType?: ConnectionType;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener(type: 'change', listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: 'change', listener: EventListenerOrEventListenerObject): void;
}

declare global {
  interface Navigator {
    connection?: NetworkInformation;
  }
}

export interface OfflineStatus {
  /** Текущее состояние сети (navigator.onLine) */
  isOnline: boolean;
  /** Медленное соединение: effectiveType === '2g' | 'slow-2g' | '3g' */
  isSlowConnection: boolean;
  /** Количество медиа-файлов в кэше */
  cachedMediaCount: number;
  /** Размер медиа-кэша в МБ */
  cachedMediaSizeMB: number;
  /** Принудительно очистить медиа-кэш */
  clearCache: () => Promise<void>;
}

function getIsSlowConnection(): boolean {
  const nav = navigator as Navigator;
  const conn = nav.connection;
  if (!conn) return false;
  return conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g' || conn.effectiveType === '3g';
}

export function useOfflineStatus(): OfflineStatus {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSlowConnection, setIsSlowConnection] = useState<boolean>(getIsSlowConnection);
  const [cachedMediaCount, setCachedMediaCount] = useState<number>(0);
  const [cachedMediaSizeMB, setCachedMediaSizeMB] = useState<number>(0);

  // Загружаем статистику кэша при монтировании и при восстановлении сети
  const refreshStats = useCallback(async () => {
    try {
      const stats = await mediaCache.getStats();
      setCachedMediaCount(stats.mediaCount);
      setCachedMediaSizeMB(
        parseFloat((stats.estimatedSizeBytes / (1024 * 1024)).toFixed(1))
      );
    } catch {
      // SW может быть недоступен — игнорируем
    }
  }, []);

  useEffect(() => {
    refreshStats();

    const handleOnline = () => {
      setIsOnline(true);
      refreshStats();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Отслеживаем изменения скорости соединения
    const conn = (navigator as Navigator).connection;
    const handleConnectionChange = () => {
      setIsSlowConnection(getIsSlowConnection());
    };

    conn?.addEventListener('change', handleConnectionChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      conn?.removeEventListener('change', handleConnectionChange);
    };
  }, [refreshStats]);

  const clearCache = useCallback(async () => {
    await mediaCache.clear();
    await refreshStats();
  }, [refreshStats]);

  return {
    isOnline,
    isSlowConnection,
    cachedMediaCount,
    cachedMediaSizeMB,
    clearCache,
  };
}
