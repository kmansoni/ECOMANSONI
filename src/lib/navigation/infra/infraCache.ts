/**
 * Кэш дорожной инфраструктуры в IndexedDB.
 *
 * Ключ: geohash(bbox.center, precision=6) — даёт ячейки ≈1.2km × 0.6km
 * TTL: настраиваемый, по умолчанию 1 час
 *
 * Структура IndexedDB:
 *   DB: mansoni-road-infra
 *   Store: snapshots (keyPath: 'key')
 *     { key, bbox, fetchedAt, ttlSeconds, payload: RoadInfraSnapshot }
 */

import type { BBox, RoadInfraSnapshot } from '@/types/roadInfra';
import { logger } from '@/lib/logger';

const DB_NAME = 'mansoni-road-infra';
const DB_VERSION = 1;
const STORE = 'snapshots';

interface CacheEntry {
  key: string;
  bbox: BBox;
  fetchedAt: number;
  ttlSeconds: number;
  payload: RoadInfraSnapshot;
}

let _dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (_dbPromise) return _dbPromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  _dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('fetchedAt', 'fetchedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        logger.debug('[infraCache] IndexedDB open failed', req.error);
        resolve(null);
      };
    } catch (err) {
      logger.debug('[infraCache] IndexedDB unavailable', err);
      resolve(null);
    }
  });
  return _dbPromise;
}

/** Geohash precision 6 → ~1.2km ячейка */
function geohashCenter(bbox: BBox, precision = 6): string {
  const lat = (bbox.south + bbox.north) / 2;
  const lng = (bbox.west + bbox.east) / 2;
  return encodeGeohash(lat, lng, precision);
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

function encodeGeohash(lat: number, lng: number, precision: number): string {
  let latRange: [number, number] = [-90, 90];
  let lngRange: [number, number] = [-180, 180];
  let isLng = true;
  let bit = 0;
  let ch = 0;
  let geohash = '';

  while (geohash.length < precision) {
    if (isLng) {
      const mid = (lngRange[0] + lngRange[1]) / 2;
      if (lng >= mid) {
        ch = (ch << 1) | 1;
        lngRange = [mid, lngRange[1]];
      } else {
        ch = ch << 1;
        lngRange = [lngRange[0], mid];
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        latRange = [mid, latRange[1]];
      } else {
        ch = ch << 1;
        latRange = [latRange[0], mid];
      }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

function bboxKey(bbox: BBox): string {
  return geohashCenter(bbox, 6);
}

export async function getInfraFromCache(bbox: BBox, ttlSeconds: number): Promise<RoadInfraSnapshot | null> {
  const db = await openDb();
  if (!db) return null;

  const key = bboxKey(bbox);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => {
        const entry = req.result as CacheEntry | undefined;
        if (!entry) return resolve(null);
        const ageSec = (Date.now() - entry.fetchedAt) / 1000;
        if (ageSec > ttlSeconds) return resolve(null);
        resolve(entry.payload);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function putInfraIntoCache(snapshot: RoadInfraSnapshot): Promise<void> {
  const db = await openDb();
  if (!db) return;

  const entry: CacheEntry = {
    key: bboxKey(snapshot.bbox),
    bbox: snapshot.bbox,
    fetchedAt: snapshot.fetchedAt,
    ttlSeconds: snapshot.ttlSeconds,
    payload: snapshot,
  };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearInfraCache(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** Удалить устаревшие записи (старше maxAgeSeconds) */
export async function pruneExpired(maxAgeSeconds: number): Promise<number> {
  const db = await openDb();
  if (!db) return 0;
  const cutoff = Date.now() - maxAgeSeconds * 1000;

  return new Promise((resolve) => {
    let removed = 0;
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const idx = store.index('fetchedAt');
      const range = IDBKeyRange.upperBound(cutoff);
      const req = idx.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.delete();
          removed++;
          cursor.continue();
        }
      };
      tx.oncomplete = () => resolve(removed);
      tx.onerror = () => resolve(removed);
    } catch {
      resolve(removed);
    }
  });
}
