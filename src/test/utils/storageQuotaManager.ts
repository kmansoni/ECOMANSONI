/**
 * Storage Quota Manager — симулирует и проверяет квоты хранилища
 *
 * Использование:
 *   const quota = new StorageQuotaManager({ maxLocalStorage: 5 * 1024 * 1024 });
 *   quota.setItem('key', 'value'); // автоматически проверяет лимит
 *   const usage = quota.getUsage();
 *
 * Особенности:
 * - Симуляция localStorage/IndexedDB лимитов
 * - LRU cache eviction
 * - Auto-purge старых данных
 * - QuotaExceededError обработка
 */

export interface QuotaConfig {
  /** Максимальный размер localStorage в байтах (default: 5MB) */
  maxLocalStorage?: number;
  /** Максимальный размер IndexedDB в байтах (default: 50MB) */
  maxIndexedDB?: number;
  /** Максимальное количество оффлайн-сообщений (default: 1000) */
  maxOfflineMessages?: number;
  /** Максимальный размер медиа-кеша в байтах (default: 100MB) */
  maxMediaCache?: number;
  /** TTL для медиа-кеша в днях (default: 30) */
  mediaCacheTTL?: number;
}

const DEFAULT_CONFIG: Required<QuotaConfig> = {
  maxLocalStorage: 5 * 1024 * 1024,
  maxIndexedDB: 50 * 1024 * 1024,
  maxOfflineMessages: 1000,
  maxMediaCache: 100 * 1024 * 1024,
  mediaCacheTTL: 30,
};

export interface StorageItem {
  key: string;
  size: number;
  timestamp: number;
  ttl?: number; // в миллисекундах, undefined = бессрочно
}

export class StorageQuotaManager {
  private config: Required<QuotaConfig>;
  private localStorageItems: Map<string, StorageItem> = new Map();
  private indexedDBItems: Map<string, StorageItem> = new Map();
  private mediaCacheItems: Map<string, StorageItem> = new Map();
  private offlineMessageCount: number = 0;

  constructor(config: QuotaConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** === LocalStorage simulation === */

  setItem(key: string, value: string, ttl?: number): void {
    const size = new Blob([value]).size;
    this.ensureLocalStorageCapacity(size);

    const item: StorageItem = {
      key,
      size,
      timestamp: Date.now(),
      ttl,
    };

    this.localStorageItems.set(key, item);
    this.evictLRU('localStorage');
  }

  getItem(key: string): string | null {
    const item = this.localStorageItems.get(key);
    if (!item) return null;

    // TTL check
    if (item.ttl && Date.now() - item.timestamp > item.ttl) {
      this.localStorageItems.delete(key);
      return null;
    }

    // Mock: в реальном localStorage значение хранится как string
    return 'mock-value'; // в тестах мы не храним реальные данные, только мета
  }

  removeItem(key: string): void {
    this.localStorageItems.delete(key);
  }

  clear(): void {
    this.localStorageItems.clear();
  }

  getLocalStorageUsage(): number {
    return Array.from(this.localStorageItems.values()).reduce((sum, item) => sum + item.size, 0);
  }

  getLocalStorageItemCount(): number {
    return this.localStorageItems.size;
  }

  /** === IndexedDB simulation === */

  putIndexedDB(store: string, key: string, value: any, ttl?: number): void {
    const size = new Blob([JSON.stringify(value)]).size;
    this.ensureIndexedDBCapacity(size);

    const fullKey = `${store}:${key}`;
    const item: StorageItem = {
      key: fullKey,
      size,
      timestamp: Date.now(),
      ttl,
    };

    this.indexedDBItems.set(fullKey, item);
    this.evictLRU('indexedDB');
  }

  getIndexedDB(store: string, key: string): any {
    const fullKey = `${store}:${key}`;
    const item = this.indexedDBItems.get(fullKey);
    if (!item) return null;

    if (item.ttl && Date.now() - item.timestamp > item.ttl) {
      this.indexedDBItems.delete(fullKey);
      return null;
    }

    return { data: 'mock-indexeddb-data' };
  }

  getIndexedDBUsage(): number {
    return Array.from(this.indexedDBItems.values()).reduce((sum, item) => sum + item.size, 0);
  }

  /** === Media Cache simulation === */

  addMediaCache(key: string, blob: Blob): void {
    const size = blob.size;
    this.ensureMediaCacheCapacity(size);

    const item: StorageItem = {
      key,
      size,
      timestamp: Date.now(),
      ttl: this.config.mediaCacheTTL * 24 * 60 * 60 * 1000, // days → ms
    };

    this.mediaCacheItems.set(key, item);
    this.evictLRU('mediaCache');
    this.purgeExpiredMedia();
  }

  getMediaCache(key: string): Blob | null {
    const item = this.mediaCacheItems.get(key);
    if (!item) return null;

    if (item.ttl && Date.now() - item.timestamp > item.ttl) {
      this.mediaCacheItems.delete(key);
      return null;
    }

    return new Blob(['mock-media']); // mock
  }

  getMediaCacheItems(): Map<string, StorageItem> {
    return this.mediaCacheItems;
  }

  getMediaCacheUsage(): number {
    return Array.from(this.mediaCacheItems.values()).reduce((sum, item) => sum + item.size, 0);
  }

  /** === Offline Message Queue === */

  incrementOfflineMessageCount(): void {
    this.offlineMessageCount++;
    this.enforceOfflineMessageLimit();
  }

  getOfflineMessageCount(): number {
    return this.offlineMessageCount;
  }

  clearOfflineMessages(): void {
    this.offlineMessageCount = 0;
  }

  /** === Capacity enforcement === */

  private ensureLocalStorageCapacity(additionalSize: number): void {
    const current = this.getLocalStorageUsage();
    const projected = current + additionalSize;
    if (projected > this.config.maxLocalStorage) {
      throw new Error(`StorageQuotaManager: localStorage limit exceeded (${this.config.maxLocalStorage}B)`);
    }
  }

  private ensureIndexedDBCapacity(additionalSize: number): void {
    const current = this.getIndexedDBUsage();
    const projected = current + additionalSize;
    if (projected > this.config.maxIndexedDB) {
      throw new Error(`StorageQuotaManager: IndexedDB limit exceeded (${this.config.maxIndexedDB}B)`);
    }
  }

  private ensureMediaCacheCapacity(additionalSize: number): void {
    const current = this.getMediaCacheUsage();
    const projected = current + additionalSize;
    if (projected > this.config.maxMediaCache) {
      throw new Error(`StorageQuotaManager: mediaCache limit exceeded (${this.config.maxMediaCache}B)`);
    }
  }

  private enforceOfflineMessageLimit(): void {
    if (this.offlineMessageCount > this.config.maxOfflineMessages) {
      // Auto-purge: удаляем старые сообщения (FIFO)
      this.offlineMessageCount = this.config.maxOfflineMessages;
      // В реальности тут бы удаляли из outbox queue
    }
  }

  /** === LRU eviction === */

  private evictLRU(store: 'localStorage' | 'indexedDB' | 'mediaCache'): void {
    const map = this.getStoreMap(store);
    const limit = this.getStoreLimit(store);

    while (this.getStoreUsage(store) > limit && map.size > 0) {
      // Find LRU (least recently used)
      let lruKey: string | null = null;
      let lruTime = Infinity;
      for (const [key, item] of map.entries()) {
        if (item.timestamp < lruTime) {
          lruTime = item.timestamp;
          lruKey = key;
        }
      }
      if (lruKey) {
        map.delete(lruKey);
      }
    }
  }

  private purgeExpiredMedia(): void {
    const now = Date.now();
    for (const [key, item] of this.mediaCacheItems.entries()) {
      if (item.ttl && now - item.timestamp > item.ttl) {
        this.mediaCacheItems.delete(key);
      }
    }
  }

  /** === Helpers === */

  private getStoreMap(store: 'localStorage' | 'indexedDB' | 'mediaCache'): Map<string, StorageItem> {
    switch (store) {
      case 'localStorage': return this.localStorageItems;
      case 'indexedDB': return this.indexedDBItems;
      case 'mediaCache': return this.mediaCacheItems;
    }
  }

  private getStoreUsage(store: 'localStorage' | 'indexedDB' | 'mediaCache'): number {
    switch (store) {
      case 'localStorage': return this.getLocalStorageUsage();
      case 'indexedDB': return this.getIndexedDBUsage();
      case 'mediaCache': return this.getMediaCacheUsage();
    }
  }

  private getStoreLimit(store: 'localStorage' | 'indexedDB' | 'mediaCache'): number {
    switch (store) {
      case 'localStorage': return this.config.maxLocalStorage;
      case 'indexedDB': return this.config.maxIndexedDB;
      case 'mediaCache': return this.config.maxMediaCache;
    }
  }

  /** === Reset (between tests) === */

  reset(): void {
    this.localStorageItems.clear();
    this.indexedDBItems.clear();
    this.mediaCacheItems.clear();
    this.offlineMessageCount = 0;
  }
}

/** Convenience factory */
export function createStorageQuotaManager(config?: QuotaConfig): StorageQuotaManager {
  return new StorageQuotaManager(config);
}
