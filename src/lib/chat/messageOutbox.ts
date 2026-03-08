/**
 * messageOutbox — IndexedDB-backed offline message outbox.
 *
 * Architecture:
 *   - Messages are written to IndexedDB BEFORE being sent to Supabase.
 *   - A dedicated flush loop retries until the message is ACK'd by the server.
 *   - On successful send, the outbox entry is deleted from IDB.
 *   - The UI reads optimistic state from the outbox while status is "pending"/"failed".
 *
 * Delivery state machine per message:
 *
 *   [pending] ──send──► [sending] ──ack──► DELETED from outbox
 *                           │
 *                         error
 *                           │
 *                        [failed] ──retry after backoff──► [pending]
 *
 * Backoff: exponential, max 30 s. Abandoned after MAX_RETRIES (5).
 *
 * Security:
 *   - IDB is origin-isolated; no cross-origin access.
 *   - Encrypted content is stored as-is if the caller provides ciphertext.
 *   - Plaintext content is never logged.
 *
 * Scale assumptions:
 *   - Outbox per device, not per account (multi-account safe via userId prefix).
 *   - IDB write is synchronous from caller's perspective (returns localId immediately).
 *   - Flush is gated on navigator.onLine to avoid pointless retries.
 */

export type OutboxStatus = "pending" | "sending" | "failed" | "sent";

export interface OutboxEntry {
  /** Stable client-generated UUID — used as optimistic message ID in UI */
  localId: string;
  userId: string;
  conversationId: string;
  content: string;
  /** Optional encrypted payload — if present, content may be placeholder */
  encryptedPayload?: string;
  /** Double-Ratchet header for secret chats */
  drHeader?: string;
  replyToId?: string | null;
  mediaUrls?: string[];
  messageType: "text" | "image" | "video" | "audio" | "document" | "sticker" | "gif" | "voice";
  status: OutboxStatus;
  retries: number;
  createdAt: number;   // Date.now()
  nextRetryAt: number; // Date.now() — when to next attempt
  /** Server-assigned ID after ACK */
  serverId?: string;
  /** Client write-sequence for deduplication */
  clientSeq: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = "mansoni_outbox";
const DB_VERSION = 1;
const STORE_OUTBOX = "outbox";
const MAX_RETRIES = 5;
const FLUSH_INTERVAL_MS = 2_000;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;

// ── IndexedDB helpers ────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
        const store = db.createObjectStore(STORE_OUTBOX, { keyPath: "localId" });
        store.createIndex("byConversation", ["userId", "conversationId"], { unique: false });
        store.createIndex("byStatus", "status", { unique: false });
        store.createIndex("byNextRetry", "nextRetryAt", { unique: false });
      }
    };
    req.onsuccess = (ev) => {
      _db = (ev.target as IDBOpenDBRequest).result;
      resolve(_db!);
    };
    req.onerror = (ev) => {
      reject((ev.target as IDBOpenDBRequest).error);
    };
  });
}

function idbPut(db: IDBDatabase, entry: OutboxEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    const req = tx.objectStore(STORE_OUTBOX).put(entry);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, localId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readwrite");
    const req = tx.objectStore(STORE_OUTBOX).delete(localId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<OutboxEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_OUTBOX, "readonly");
    const req = tx.objectStore(STORE_OUTBOX).getAll();
    req.onsuccess = () => resolve(req.result as OutboxEntry[]);
    req.onerror = () => reject(req.error);
  });
}

// ── Backoff calculation ──────────────────────────────────────────────────────

function computeBackoff(retries: number): number {
  const delay = Math.min(BASE_BACKOFF_MS * Math.pow(2, retries), MAX_BACKOFF_MS);
  // Jitter ±20% to prevent thundering herd on reconnect
  return delay * (0.8 + Math.random() * 0.4);
}

// ── Flush state ──────────────────────────────────────────────────────────────

type SendFn = (entry: OutboxEntry) => Promise<{ serverId: string }>;
let _sendFn: SendFn | null = null;
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _flushing = false;

// Subscribers notified after each flush cycle (React hooks subscribe here)
type OutboxListener = () => void;
const _listeners = new Set<OutboxListener>();

export function subscribeOutbox(fn: OutboxListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function notifyListeners(): void {
  for (const fn of _listeners) {
    try { fn(); } catch { /* ignore renderer errors */ }
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Register the function that actually sends a message to Supabase.
 * Must be called before any outbox operations.
 * Typically called once from ChatConversation or useChat on mount.
 */
export function registerSendFn(fn: SendFn): void {
  _sendFn = fn;
}

/**
 * Enqueue a message to the outbox.
 * Returns localId immediately — caller should show it optimistically in UI.
 */
export async function enqueueMessage(
  params: Omit<OutboxEntry, "status" | "retries" | "createdAt" | "nextRetryAt">
): Promise<string> {
  const db = await openDb();
  const entry: OutboxEntry = {
    ...params,
    status: "pending",
    retries: 0,
    createdAt: Date.now(),
    nextRetryAt: Date.now(), // Attempt immediately
  };
  await idbPut(db, entry);
  notifyListeners();
  // Trigger flush immediately if online
  if (navigator.onLine) {
    void flushOutbox();
  }
  return entry.localId;
}

/**
 * Get all pending/failed entries for a specific conversation.
 * Used by UI to show optimistic messages before server ACK.
 */
export async function getOutboxForConversation(
  userId: string,
  conversationId: string
): Promise<OutboxEntry[]> {
  const db = await openDb();
  const all = await idbGetAll(db);
  return all
    .filter((e) => e.userId === userId && e.conversationId === conversationId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get all outbox entries for a user (all conversations).
 * Used for total undelivered count indicator.
 */
export async function getOutboxForUser(userId: string): Promise<OutboxEntry[]> {
  const db = await openDb();
  const all = await idbGetAll(db);
  return all.filter((e) => e.userId === userId);
}

/**
 * Mark a specific message as failed (e.g., user tapped "Delete failed message").
 */
export async function deleteOutboxEntry(localId: string): Promise<void> {
  const db = await openDb();
  await idbDelete(db, localId);
  notifyListeners();
}

/**
 * Retry a specific failed message immediately.
 */
export async function retryOutboxEntry(localId: string): Promise<void> {
  const db = await openDb();
  const all = await idbGetAll(db);
  const entry = all.find((e) => e.localId === localId);
  if (!entry || entry.status !== "failed") return;
  await idbPut(db, {
    ...entry,
    status: "pending",
    retries: entry.retries, // Keep retry count; backoff resets
    nextRetryAt: Date.now(),
  });
  notifyListeners();
  void flushOutbox();
}

// ── Flush loop ───────────────────────────────────────────────────────────────

/**
 * One flush pass: pick all entries with nextRetryAt <= now and status === "pending",
 * then attempt to send each one serially (to preserve message order per conversation).
 */
async function flushOutbox(): Promise<void> {
  if (_flushing) return;
  if (!_sendFn) return;
  if (!navigator.onLine) return;

  _flushing = true;
  try {
    const db = await openDb();
    const all = await idbGetAll(db);
    const now = Date.now();

    // Only pending entries that are due
    const due = all
      .filter((e) => e.status === "pending" && e.nextRetryAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt); // FIFO ordering

    // Group by conversationId to preserve per-conversation ordering
    const byConv = new Map<string, OutboxEntry[]>();
    for (const e of due) {
      const key = `${e.userId}:${e.conversationId}`;
      const list = byConv.get(key) ?? [];
      list.push(e);
      byConv.set(key, list);
    }

    // Process each conversation's queue serially; conversations parallel
    const convPromises = Array.from(byConv.values()).map(async (entries) => {
      for (const entry of entries) {
        // Mark as sending
        await idbPut(db, { ...entry, status: "sending" });
        notifyListeners();

        try {
          const { serverId } = await _sendFn!(entry);
          // ACK: remove from outbox
          await idbDelete(db, entry.localId);
          // Notify caller that serverId is now available (for reconciliation)
          outboxAckCallbacks.get(entry.localId)?.(serverId);
        } catch (err) {
          const nextRetries = entry.retries + 1;
          if (nextRetries >= MAX_RETRIES) {
            await idbPut(db, {
              ...entry,
              status: "failed",
              retries: nextRetries,
              nextRetryAt: Number.MAX_SAFE_INTEGER,
            });
          } else {
            await idbPut(db, {
              ...entry,
              status: "pending",
              retries: nextRetries,
              nextRetryAt: Date.now() + computeBackoff(nextRetries),
            });
          }
          // Stop processing this conversation's queue on error to preserve ordering
          break;
        }
      }
    });

    await Promise.allSettled(convPromises);
  } finally {
    _flushing = false;
    notifyListeners();
  }
}

// ACK callbacks for localId → serverId reconciliation
const outboxAckCallbacks = new Map<string, (serverId: string) => void>();

/**
 * Register a callback to be notified when a specific localId is ACK'd by server.
 * Returns deregistration function.
 */
export function onOutboxAck(
  localId: string,
  cb: (serverId: string) => void
): () => void {
  outboxAckCallbacks.set(localId, cb);
  return () => outboxAckCallbacks.delete(localId);
}

// ── Auto-flush on reconnect ──────────────────────────────────────────────────

let _onlineHandler: (() => void) | null = null;

/**
 * Initialize the outbox flush loop and online-reconnect listener.
 *
 * Must be called ONCE from the app root (e.g. App.tsx) after mount.
 * Idempotent — safe to call multiple times (subsequent calls are no-ops).
 *
 * By deferring initialization to an explicit call we avoid:
 *   - Timer leaks in SSR / Vitest environments where `window` may exist
 *     but tests do not expect background timers.
 *   - Double-registration on Vite HMR module reload (the old module
 *     instance is cleared by destroyOutbox() in the module's hot-dispose
 *     callback, then initOutbox() re-registers cleanly).
 *
 * Production usage:
 *   import { initOutbox } from "@/lib/chat/messageOutbox";
 *   // in App.tsx useEffect(() => { initOutbox(); }, []);
 *
 * Test usage:
 *   // Simply do NOT call initOutbox() — no timers, no listeners.
 *   // Call destroyOutbox() in afterEach only if initOutbox() was called.
 */
export function initOutbox(): void {
  if (typeof window === "undefined") return;
  if (_flushTimer !== null) return; // already initialized

  _onlineHandler = () => { void flushOutbox(); };
  window.addEventListener("online", _onlineHandler);

  // Periodic flush for retry backoffs
  _flushTimer = setInterval(() => {
    if (navigator.onLine) {
      void flushOutbox();
    }
  }, FLUSH_INTERVAL_MS);
}

/**
 * Tear down the module-level timer and event listener.
 * Call this in test teardown (afterEach/afterAll) to prevent timer leaks
 * and "act() warning" noise in Vitest/Jest.
 *
 * Not intended for production use — the outbox is expected to live for
 * the full app lifetime.
 */
export function destroyOutbox(): void {
  if (_flushTimer !== null) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  if (_onlineHandler !== null && typeof window !== "undefined") {
    window.removeEventListener("online", _onlineHandler);
    _onlineHandler = null;
  }
  _db = null;
  _sendFn = null;
  _flushing = false;
  _listeners.clear();
  outboxAckCallbacks.clear();
}
