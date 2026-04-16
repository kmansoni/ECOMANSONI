/**
 * Тонкая обёртка над IndexedDB без внешних зависимостей.
 * Только промис-ориентированный API для нужных нам операций.
 */

const DB_NAME = 'crisis-mesh-v1';
const DB_VERSION = 1;

export type StoreName =
  | 'identities'
  | 'messages'
  | 'outbox'
  | 'sos'
  | 'sessions';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains('identities')) {
        const store = db.createObjectStore('identities', { keyPath: 'peerId' });
        store.createIndex('by_lastSeen', 'lastSeenAt');
        store.createIndex('by_status', 'status');
      }

      if (!db.objectStoreNames.contains('messages')) {
        const store = db.createObjectStore('messages', { keyPath: 'id' });
        store.createIndex('by_sender', 'senderId');
        store.createIndex('by_recipient', 'recipientId');
        store.createIndex('by_timestamp', 'timestamp');
        store.createIndex('by_kind', 'kind');
      }

      if (!db.objectStoreNames.contains('outbox')) {
        const store = db.createObjectStore('outbox', { keyPath: 'messageId' });
        store.createIndex('by_nextAttempt', 'nextAttemptAt');
        store.createIndex('by_createdAt', 'createdAt');
      }

      if (!db.objectStoreNames.contains('sos')) {
        const store = db.createObjectStore('sos', { keyPath: 'id' });
        store.createIndex('by_status', 'status');
        store.createIndex('by_timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'peerId' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  return dbPromise;
}

function tx<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result: T | undefined;
        let ready = false;

        const handleReq = (req: IDBRequest<T>) => {
          req.onsuccess = () => {
            result = req.result;
            ready = true;
          };
          req.onerror = () => reject(req.error);
        };

        const maybeReq = run(store);
        if (maybeReq instanceof IDBRequest) {
          handleReq(maybeReq);
        } else {
          maybeReq.then((v) => {
            result = v;
            ready = true;
          }).catch(reject);
        }

        transaction.oncomplete = () => {
          if (ready) resolve(result as T);
          else resolve(undefined as T);
        };
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('tx aborted'));
      }),
  );
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  await tx(store, 'readwrite', (s) => s.put(value as unknown as Record<string, unknown>));
}

export async function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | null> {
  const v = await tx<T | undefined>(store, 'readonly', (s) => s.get(key) as unknown as IDBRequest<T | undefined>);
  return v ?? null;
}

export async function idbDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  await tx(store, 'readwrite', (s) => s.delete(key));
}

export async function idbGetAll<T>(
  store: StoreName,
  opts: { indexName?: string; query?: IDBKeyRange | null; limit?: number } = {},
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    openDb().then((db) => {
      const transaction = db.transaction(store, 'readonly');
      const s = transaction.objectStore(store);
      const source = opts.indexName ? s.index(opts.indexName) : s;
      const req = source.getAll(opts.query ?? null, opts.limit);
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    }).catch(reject);
  });
}

export async function idbClear(store: StoreName): Promise<void> {
  await tx(store, 'readwrite', (s) => s.clear());
}

export async function idbCloseAndDelete(): Promise<void> {
  const db = await openDb();
  db.close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('deleteDatabase blocked'));
  });
}
