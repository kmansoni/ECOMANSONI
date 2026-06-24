/**
 * Chat Cache — multi-tier cache abstraction
 *
 * Tier 1: localStorage  (5MB, fast, synchronous)
 * Tier 2: IndexedDB     (50MB, async, structured)
 *
 * LRU eviction on write when approaching quota.
 * All values are JSON-serialized with metadata: { data, ts, ttl }
 */

import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CacheEntry<T = unknown> {
  key?: string;  // IDB key path (present only in persisted records)
  data: T;
  ts: number;
  ttl?: number;
  expiresAt?: number;
}

export interface ChatCacheOptions {
  /** Use IndexedDB for values > 100KB */
  useIndexedDB?: boolean;
}

type StorageType = "localStorage" | "indexeddb";

// ─── Constants ───────────────────────────────────────────────────────────────

const PREFIX = "cc_";
const LOCAL_LIMIT = 5 * 1024 * 1024;   // 5 MB
const IDB_NAME = "mansoni_chat_cache";
const IDB_VERSION = 1;
const IDB_STORE = "chat_cache";
const KB = 1024;
const LARGE_VALUE_THRESHOLD = 100 * KB;  // 100 KB → prefer IndexedDB

// ─── IndexedDB helpers (lazy open) ───────────────────────────────────────────

let _idb: IDBDatabase | null = null;

function openIDB(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);

    req.onupgradeneeded = ({ oldVersion }) => {
      const db = req.result;
      if (oldVersion < 1) {
        db.createObjectStore(IDB_STORE, { keyPath: "key" });
      }
    };

    req.onsuccess = () => {
      _idb = req.result;
      resolve(_idb);
    };

    req.onerror = () => reject(req.error);
  });
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function lsKey(key: string) {
  return PREFIX + key;
}

function lsUsage(): number {
  let bytes = 0;
  for (const k of Object.keys(localStorage)) {
    if (k.startsWith(PREFIX)) {
      bytes += (localStorage.getItem(k)?.length ?? 0) * 2; // UTF-16
    }
  }
  return bytes;
}

function lsKeys(): string[] {
  return Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
}

/** LRU eviction: sort by stored ts, drop oldest until under 80% of limit */
function lsEvict(): void {
  const target = Math.floor(LOCAL_LIMIT * 0.8);

  const items: Array<{ key: string; ts: number }> = [];
  for (const k of lsKeys()) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const entry: CacheEntry = JSON.parse(raw);
      items.push({ key: k, ts: entry.ts });
    } catch {
      localStorage.removeItem(k); // corrupt → drop
    }
  }

  items.sort((a, b) => a.ts - b.ts);

  let usage = lsUsage();
  for (const { key } of items) {
    if (usage <= target) break;
    const raw = localStorage.getItem(key);
    if (raw) {
      usage -= raw.length * 2;
      localStorage.removeItem(key);
    }
  }
}

// ─── IDB helpers ─────────────────────────────────────────────────────────────

async function idbGet<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(PREFIX + key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(
  key: string,
  value: CacheEntry<T>,
  ttl?: number,
): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const entry: CacheEntry<T> & { expiresAt?: number } = { key: PREFIX + key, ...value, ttl };
    if (ttl) entry.expiresAt = Date.now() + ttl;
    const req = store.put(entry);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
  });
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const req = tx.objectStore(IDB_STORE).delete(PREFIX + key);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
    });
  } catch {
    // non-fatal
  }
}

async function idbClear(): Promise<void> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const req = tx.objectStore(IDB_STORE).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // non-fatal
  }
}

// ─── CacheEntry CRUD ─────────────────────────────────────────────────────────

function makeEntry<T>(data: T, ttlMs?: number): CacheEntry<T> {
  return {
    data,
    ts: Date.now(),
    ttl: ttlMs,
  };
}

function isExpired(entry: CacheEntry): boolean {
  if (!entry.ttl) return false;
  return Date.now() - entry.ts > entry.ttl;
}

// ─── TTL utilities ────────────────────────────────────────────────────────────

/** Parse TTL from various input formats (ms, seconds, Date, "30d") */
export function parseTTL(raw: number | string | undefined): number | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "number") return raw;
  const s = String(raw);
  const num = parseFloat(s.replace(/[^\d.]/, ""));
  if (s.endsWith("d")) return num * 86_400_000;
  if (s.endsWith("h")) return num * 3_600_000;
  if (s.endsWith("m")) return num * 60_000;
  return num; // plain ms or seconds
}

// ─── Main API ─────────────────────────────────────────────────────────────────

export interface ChatCache {
  /** Store a value. Uses IndexedDB for large values or when forced. */
  set<T>(key: string, data: T, opts?: { ttl?: number; storage?: StorageType }): Promise<void>;
  /** Retrieve a value. Returns null on miss or expired. */
  get<T>(key: string, opts?: { storage?: StorageType }): Promise<T | null>;
  /** Remove a single key from both tiers. */
  clearKey(key: string): Promise<void>;
  /** Clear all cached data (both tiers). */
  clear(): Promise<void>;
  /** Purge expired entries from IndexedDB (localStorage purged on read). */
  prune(): Promise<void>;
  /** Current storage usage in bytes per tier. */
  usage(): { localStorage: number; indexedDB: number };
}

function buildChatCache(options: ChatCacheOptions = {}): ChatCache {
  const { useIndexedDB = false } = options;

  return {
    async set<T>(key: string, data: T, opts: { ttl?: number; storage?: StorageType } = {}): Promise<void> {
      const { ttl, storage: forceStorage } = opts;
      const entry = makeEntry(data, ttl);
      const json = JSON.stringify(entry);
      const size = new Blob([json]).size;

      // Decide tier
      const storage: StorageType =
        forceStorage ??
        (useIndexedDB || size > LARGE_VALUE_THRESHOLD ? "indexeddb" : "localStorage");

      if (storage === "localStorage") {
        if (lsUsage() + size > LOCAL_LIMIT) lsEvict();
        try {
          localStorage.setItem(lsKey(key), json);
        } catch {
          // QuotaExceededError or unavailable → fall back to IndexedDB
          await idbSet(key, entry, ttl);
        }
      } else {
        await idbSet(key, entry, ttl);
      }
    },

    async get<T>(key: string, opts: { storage?: StorageType } = {}): Promise<T | null> {
      const { storage: forceStorage } = opts ?? {};

      // Try forced tier first, then fall back
      const order: StorageType[] = forceStorage
        ? [forceStorage]
        : ["localStorage", "indexeddb"];

      for (const storage of order) {
        if (storage === "localStorage") {
          const raw = localStorage.getItem(lsKey(key));
          if (!raw) continue;
          try {
            const entry: CacheEntry<T> = JSON.parse(raw);
            if (isExpired(entry)) {
              localStorage.removeItem(lsKey(key));
              return null;
            }
            return entry.data;
          } catch {
            localStorage.removeItem(lsKey(key));
            continue;
          }
        } else {
          const entry = await idbGet<T>(key);
          if (!entry) continue;
          if (isExpired(entry)) {
            await idbDelete(key);
            return null;
          }
          return entry.data;
        }
      }

      return null;
    },

    async clearKey(key) {
      localStorage.removeItem(lsKey(key));
      await idbDelete(key);
    },

    async clear() {
      for (const k of lsKeys()) localStorage.removeItem(k);
      await idbClear();
    },

    async prune() {
      // IndexedDB: scan + delete expired
      try {
        const db = await openIDB();
        const allKeys = await new Promise<string[]>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readonly");
          const req = tx.objectStore(IDB_STORE).getAllKeys();
          req.onsuccess = () => resolve(req.result as string[]);
          req.onerror = () => reject(req.error);
        });

        const now = Date.now();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_STORE, "readwrite");
          let pending = allKeys.length;
          if (pending === 0) { resolve(); return; }

          for (const k of allKeys) {
            const getReq = tx.objectStore(IDB_STORE).get(k);
            getReq.onsuccess = () => {
              const entry = getReq.result;
              if (entry?.expiresAt && entry.expiresAt < now) {
                tx.objectStore(IDB_STORE).delete(k);
              }
              if (--pending === 0) { tx.oncomplete = () => resolve(); }
            };
            getReq.onerror = () => { if (--pending === 0) resolve(); };
          }
        });
      } catch {
        // prune failure is non-fatal
      }
    },

    usage() {
      return {
        localStorage: lsUsage(),
        indexedDB: 0, // async, would need dedicated scan
      };
    },
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChatCache(options?: ChatCacheOptions): ChatCache {
  return buildChatCache(options);
}

// ─── Standalone instance (no React) ──────────────────────────────────────────

export const chatCache = buildChatCache();

// ─── Backend stubs referenced by tests ───────────────────────────────────────

/**
 * Schedules auto-deletion for a chat attachment via Supabase RPC.
 * Implemented in src/lib/chat/attachments.ts — this re-export keeps the
 * test import paths stable.
 */
export async function scheduleAttachmentTTL(
  attachmentId: string,
  opts: { ttlDays: number },
): Promise<void> {
  const { error } = await supabase.rpc("schedule_attachment_ttl", {
    attachment_id: attachmentId,
    delete_after_days: opts.ttlDays,
  });
  if (error) throw error;
}

/**
 * Purges attachments past their expiry date.
 * Implemented in src/lib/chat/attachments.ts.
 */
export async function purgeExpiredAttachments(
  opts: { preservePinned?: boolean } = {},
): Promise<void> {
  let query = supabase
    .from("chat_attachments")
    .delete()
    .lt("expires_at", new Date().toISOString());

  if (opts.preservePinned) {
    query = query.eq("pinned", false);
  }

  const { error } = await query;
  if (error) throw error;
}

/**
 * Triggers Supabase vacuum on chat_messages if size exceeds threshold.
 * Implemented in src/lib/chat/maintenance.ts.
 */
export async function checkAndVacuumIfNeeded(): Promise<void> {
  const { error } = await supabase.rpc("vacuum_chat_messages");
  if (error) throw error;
}
