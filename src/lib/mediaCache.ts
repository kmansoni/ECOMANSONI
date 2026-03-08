/**
 * mediaCache — API для управления медиа-кэшем через Service Worker.
 * Все операции используют MessageChannel для двусторонней связи с SW.
 * Если SW недоступен — операции gracefully деградируют.
 */

export interface CacheStats {
  mediaCount: number;
  staticCount: number;
  estimatedSizeBytes: number;
  quotaBytes: number;
  maxMediaItems: number;
  maxMediaSizeBytes: number;
}

/**
 * Отправить сообщение в активный SW и получить ответ через MessageChannel.
 * Timeout: 5 секунд — после чего промис резолвится с null.
 */
function sendToSW<T>(message: Record<string, unknown>): Promise<T | null> {
  return new Promise((resolve) => {
    const controller = navigator.serviceWorker?.controller;
    if (!controller) {
      resolve(null);
      return;
    }

    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      resolve(null);
    }, 5000);

    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer);
      resolve(event.data?.payload ?? event.data ?? null);
    };

    controller.postMessage(message, [channel.port2]);
  });
}

/**
 * Предзагрузить список URL в медиа-кэш.
 * Безопасно вызывать при отсутствии SW — ничего не произойдёт.
 */
async function preload(urls: string[]): Promise<void> {
  if (!urls.length) return;
  await sendToSW({ type: 'PRELOAD_URLS', urls });
}

/**
 * Получить статистику кэша: количество файлов, размер, квота.
 */
async function getStats(): Promise<CacheStats> {
  const result = await sendToSW<CacheStats>({ type: 'GET_CACHE_STATS' });

  if (!result) {
    // Fallback: попытаться получить данные через StorageEstimate напрямую
    let estimatedSizeBytes = 0;
    let quotaBytes = 0;
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const estimate = await navigator.storage.estimate();
        estimatedSizeBytes = estimate.usage ?? 0;
        quotaBytes = estimate.quota ?? 0;
      } catch {
        // ignore
      }
    }
    return {
      mediaCount: 0,
      staticCount: 0,
      estimatedSizeBytes,
      quotaBytes,
      maxMediaItems: 200,
      maxMediaSizeBytes: 500 * 1024 * 1024,
    };
  }

  return result;
}

/**
 * Очистить всё медиа-кэш (cache name: media-v1).
 */
async function clear(): Promise<void> {
  await sendToSW({ type: 'CLEAR_MEDIA_CACHE' });
}

/**
 * Очистить ВСЕ кэши SW — включая static-v1, где кэшируются статические ресурсы.
 * Должен вызываться при выходе из аккаунта, чтобы персональные данные
 * предыдущего пользователя не оставались в Cache Storage.
 */
async function clearAll(): Promise<void> {
  await sendToSW({ type: 'CLEAR_ALL_CACHES' });
}

/**
 * Очистить медиа-файлы старше N дней.
 */
async function clearOlderThan(days: number): Promise<void> {
  const olderThanMs = days * 24 * 60 * 60 * 1000;
  await sendToSW({ type: 'CLEAR_OLD_MEDIA', olderThanMs });
}

/**
 * Проверить, доступна ли сеть.
 */
function getIsOnline(): boolean {
  return navigator.onLine;
}

/**
 * Получить приближённый размер кэша в байтах через StorageEstimate.
 * Более быстрый вариант без обращения к SW.
 */
async function estimateSize(): Promise<number> {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) return 0;
  try {
    const estimate = await navigator.storage.estimate();
    return estimate.usage ?? 0;
  } catch {
    return 0;
  }
}

export const mediaCache = {
  preload,
  getStats,
  clear,
  clearAll,
  clearOlderThan,
  estimateSize,
  get isOnline(): boolean {
    return getIsOnline();
  },
} as const;
