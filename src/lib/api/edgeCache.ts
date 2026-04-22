/**
 * Edge Cache — кэш маршрутных оценок и API-ответов.
 * Двухуровневый: Memory LRU → IndexedDB persistent.
 * Автоматическая инвалидация по TTL и размеру.
 */

import type { LatLng } from '@/types/taxi';
import type { TravelMode } from '@/types/navigation';

// ── Типы ──

export interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  createdAt: number;
  expiresAt: number;
  hitCount: number;
  size: number;
}

export interface CacheStats {
  memoryEntries: number;
  diskEntries: number;
  memoryHits: number;
  diskHits: number;
  misses: number;
  evictions: number;
}

export interface BatchRequest<T = unknown> {
  key: string;
  execute: () => Promise<T>;
  priority?: number;
}

export interface BatchResult<T = unknown> {
  key: string;
  data: T | null;
  fromCache: boolean;
  error?: string;
}

// ── Конфигурация ──

const DEFAULT_TTL_MS = 15 * 60 * 1000;       // 15 min
const ROUTE_TTL_MS = 10 * 60 * 1000;         // 10 min for routes
const WEATHER_TTL_MS = 30 * 60 * 1000;       // 30 min for weather
const TAXI_TTL_MS = 3 * 60 * 1000;           // 3 min for taxi prices
const MAX_MEMORY_ENTRIES = 500;
const MAX_DISK_ENTRIES = 2000;
const IDB_NAME = 'mansoni_edge_cache';
const IDB_STORE = 'cache_entries';

// ── Memory LRU Cache ──

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): CacheEntry<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    entry.hitCount++;
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, data: T, ttlMs: number): void {
    // Evict if full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      key,
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      hitCount: 0,
      size: JSON.stringify(data).length,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ── IndexedDB persistent layer ──

let idbReady = false;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        const store = db.createObjectStore(IDB_STORE, { keyPath: 'key' });
        store.createIndex('expiresAt', 'expiresAt');
      }
    };
    req.onsuccess = () => {
      idbReady = true;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry<T> | undefined;
        if (!entry || Date.now() > entry.expiresAt) {
          resolve(null);
        } else {
          resolve(entry);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(entry: CacheEntry<T>): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* silent */ }
}

async function idbCleanExpired(): Promise<void> {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const index = store.index('expiresAt');
    const range = IDBKeyRange.upperBound(Date.now());
    const req = index.openCursor(range);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  } catch { /* silent */ }
}

// ── Key Generation ──

function routeCacheKey(from: LatLng, to: LatLng, mode: TravelMode): string {
  const f = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}`;
  const t = `${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  return `route:${mode}:${f}:${t}`;
}

function genericKey(prefix: string, params: Record<string, string | number>): string {
  const sorted = Object.entries(params).sort((a, b) => a[0].localeCompare(b[0]));
  return `${prefix}:${sorted.map(([k, v]) => `${k}=${v}`).join(',')}`;
}

// ── Главный класс ──

class EdgeCache {
  private memory = new LRUCache<unknown>(MAX_MEMORY_ENTRIES);
  private stats: CacheStats = {
    memoryEntries: 0,
    diskEntries: 0,
    memoryHits: 0,
    diskHits: 0,
    misses: 0,
    evictions: 0,
  };
  private pendingRequests = new Map<string, Promise<unknown>>();

  constructor() {
    // Clean expired entries periodically
    if (typeof window !== 'undefined') {
      setInterval(() => { idbCleanExpired().catch(() => {}); }, 5 * 60 * 1000);
    }
  }

  /** Получить кэшированный маршрут */
  async getRoute<T>(from: LatLng, to: LatLng, mode: TravelMode): Promise<T | null> {
    const key = routeCacheKey(from, to, mode);
    return this.get<T>(key);
  }

  /** Кэшировать маршрут */
  async setRoute<T>(from: LatLng, to: LatLng, mode: TravelMode, data: T): Promise<void> {
    const key = routeCacheKey(from, to, mode);
    return this.set(key, data, ROUTE_TTL_MS);
  }

  /** Получить любой кэшированный элемент */
  async get<T>(key: string): Promise<T | null> {
    // L1: Memory
    const memEntry = this.memory.get(key);
    if (memEntry) {
      this.stats.memoryHits++;
      return memEntry.data as T;
    }

    // L2: IndexedDB
    const diskEntry = await idbGet<T>(key);
    if (diskEntry) {
      this.stats.diskHits++;
      // Promote to memory
      this.memory.set(key, diskEntry.data, diskEntry.expiresAt - Date.now());
      return diskEntry.data;
    }

    this.stats.misses++;
    return null;
  }

  /** Установить кэшированный элемент */
  async set<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): Promise<void> {
    this.memory.set(key, data, ttlMs);

    const entry: CacheEntry<T> = {
      key,
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      hitCount: 0,
      size: 0,
    };

    await idbSet(entry);
  }

  /**
   * Получить или вычислить (cache-aside pattern).
   * Дедуплицирует параллельные запросы по одному ключу.
   */
  async getOrCompute<T>(
    key: string,
    compute: () => Promise<T>,
    ttlMs = DEFAULT_TTL_MS
  ): Promise<T> {
    // Check cache
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Deduplicate in-flight requests
    const pending = this.pendingRequests.get(key);
    if (pending) return pending as Promise<T>;

    const promise = compute()
      .then(async (result) => {
        await this.set(key, result, ttlMs);
        this.pendingRequests.delete(key);
        return result;
      })
      .catch((err) => {
        this.pendingRequests.delete(key);
        throw err;
      });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  /**
   * Batch API — выполнить несколько запросов, используя кэш.
   * Выполняет параллельно, с дедупликацией.
   */
  async batch<T>(
    requests: BatchRequest<T>[],
    concurrency = 4
  ): Promise<BatchResult<T>[]> {
    const results: BatchResult<T>[] = [];
    const queue = [...requests].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    let active = 0;

    return new Promise((resolve) => {
      const processNext = () => {
        while (active < concurrency && queue.length > 0) {
          const req = queue.shift()!;
          active++;

          this.getOrCompute(req.key, req.execute)
            .then((data) => {
              results.push({ key: req.key, data: data as T, fromCache: false });
            })
            .catch((err) => {
              results.push({ key: req.key, data: null, fromCache: false, error: String(err) });
            })
            .finally(() => {
              active--;
              if (queue.length === 0 && active === 0) {
                resolve(results);
              } else {
                processNext();
              }
            });
        }
      };

      processNext();
      if (requests.length === 0) resolve(results);
    });
  }

  /** Очистить весь кэш */
  async clear(): Promise<void> {
    this.memory.clear();
    try {
      const db = await openIDB();
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
    } catch { /* silent */ }
  }

  /** Инвалидировать по префиксу */
  invalidatePrefix(prefix: string): void {
    // Memory only (IDB will expire naturally)
    // The LRU doesn't support prefix scan, so this is a no-op for memory
    // In practice, TTL handles invalidation
  }

  /** Статистика */
  getStats(): CacheStats {
    return { ...this.stats, memoryEntries: this.memory.size };
  }
}

// ── Singleton ──

export const edgeCache = new EdgeCache();

// ── Convenience TTL constants ──
export { ROUTE_TTL_MS, WEATHER_TTL_MS, TAXI_TTL_MS, DEFAULT_TTL_MS };

// ── Helper key generators ──
export { routeCacheKey, genericKey };
