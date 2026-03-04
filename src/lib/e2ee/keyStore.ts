/**
 * E2EE Key Store
 * Безопасное хранилище ключей на основе IndexedDB.
 * Identity private keys и master keys — non-extractable.
 * Fallback на in-memory Map если IndexedDB недоступна.
 */

import { generateIdentityKeyPair, exportPublicKey } from './crypto';
import { toBase64, fromBase64 } from './utils';

// ─── Типы ────────────────────────────────────────────────────────────────────

export interface StoredKeyEntry {
  id: string;
  key: CryptoKey;
  createdAt: number;
  expiresAt?: number;
  type: 'identity' | 'session' | 'group' | 'master';
  metadata?: Record<string, string>;
}

export interface KeyStoreConfig {
  dbName?: string;
  storeName?: string;
  autoCleanup?: boolean;
  cleanupInterval?: number;
}

// Запись для хранения в IndexedDB (без CryptoKey напрямую — используем CryptoKeyPair через IDBKeyVal)
interface IDBKeyEntry {
  id: string;
  key: CryptoKey;
  createdAt: number;
  expiresAt?: number;
  type: 'identity' | 'session' | 'group' | 'master';
  metadata?: Record<string, string>;
}

// ─── E2EEKeyStore ─────────────────────────────────────────────────────────────

export class E2EEKeyStore {
  private db: IDBDatabase | null = null;
  private memoryStore: Map<string, IDBKeyEntry> = new Map();
  private useMemoryFallback = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private readonly dbName: string;
  private readonly storeName: string;
  private readonly autoCleanup: boolean;
  private readonly cleanupInterval: number;
  private readonly legacyDbNames = ['e2ee-keystore'];
  /** Promise that resolves when init() completes (IndexedDB opened or fallback set) */
  private _initPromise: Promise<void> | null = null;
  /** In-flight guard to prevent concurrent identity key pair creation */
  private _identityInFlight: Map<string, Promise<{ publicKey: CryptoKey; privateKey: CryptoKey; fingerprint: string; isNew: boolean }>> = new Map();

  constructor(config: KeyStoreConfig = {}) {
    this.dbName = config.dbName ?? 'e2ee-keystore';
    this.storeName = config.storeName ?? 'keys';
    this.autoCleanup = config.autoCleanup ?? true;
    this.cleanupInterval = config.cleanupInterval ?? 3_600_000; // 1 hour
  }

  /**
   * Инициализация IndexedDB
   */
  async init(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = this._doInit();
    }
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    try {
      this.db = await this._openDB();
      await this._migrateLegacyIfNeeded();
      if (this.autoCleanup) {
        this.cleanupTimer = setInterval(() => {
          this.cleanupExpired().catch(console.warn);
        }, this.cleanupInterval);
      }
    } catch (err) {
      console.warn('[E2EEKeyStore] IndexedDB unavailable, falling back to in-memory store:', err);
      this.useMemoryFallback = true;
    }
  }

  /** Wait for init() to complete before performing operations.
   *  Automatically calls init() if it was never invoked (guards against
   *  callers that skip explicit initialisation — prevents silent in-memory
   *  fallback and key loss on page reload).
   */
  async ensureReady(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = this._doInit();
    }
    return this._initPromise;
  }

  private _openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }

  private _countEntriesIn(db: IDBDatabase, storeName: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.count();
      req.onsuccess = () => resolve(req.result ?? 0);
      req.onerror = () => reject(req.error);
    });
  }

  private _getAllEntriesFrom(db: IDBDatabase, storeName: string): Promise<IDBKeyEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as IDBKeyEntry[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  private async _openExistingDatabase(name: string): Promise<IDBDatabase | null> {
    const listFn = (indexedDB as { databases?: () => Promise<Array<{ name?: string }>> }).databases;
    if (typeof listFn !== 'function') {
      console.warn('[E2EEKeyStore] IndexedDB.databases() unsupported; skipping legacy keystore detection.');
      return null;
    }

    const knownDbs = await listFn.call(indexedDB);
    if (!knownDbs.some((db) => db.name === name)) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error(`IndexedDB blocked: ${name}`));
    });
  }

  private async _migrateLegacyIfNeeded(): Promise<void> {
    if (!this.db || this.useMemoryFallback) return;
    if (this.dbName !== 'e2ee-keystore-v2') return;

    const currentCount = await this._countEntriesIn(this.db, this.storeName);
    if (currentCount > 0) return;

    for (const legacyDbName of this.legacyDbNames) {
      let legacyDb: IDBDatabase | null = null;
      try {
        legacyDb = await this._openExistingDatabase(legacyDbName);
        if (!legacyDb) continue;
        if (!legacyDb.objectStoreNames.contains(this.storeName)) continue;

        const legacyEntries = await this._getAllEntriesFrom(legacyDb, this.storeName);
        if (legacyEntries.length === 0) continue;

        for (const entry of legacyEntries) {
          await this.storeKey({
            id: entry.id,
            key: entry.key,
            createdAt: entry.createdAt,
            expiresAt: entry.expiresAt,
            type: entry.type,
            metadata: entry.metadata,
          });
        }

        console.warn(
          `[E2EEKeyStore] Migrated ${legacyEntries.length} keys from legacy DB "${legacyDbName}" to "${this.dbName}".`,
        );
        return;
      } catch (err) {
        console.warn(`[E2EEKeyStore] Legacy keystore migration failed for ${legacyDbName}:`, err);
      } finally {
        legacyDb?.close();
      }
    }
  }

  /**
   * Сохранение ключа
   */
  async storeKey(entry: StoredKeyEntry): Promise<void> {
    await this.ensureReady();
    const record: IDBKeyEntry = {
      id: entry.id,
      key: entry.key,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
      type: entry.type,
      metadata: entry.metadata,
    };

    if (this.useMemoryFallback || !this.db) {
      this.memoryStore.set(entry.id, record);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Получение ключа по ID
   */
  async getKey(id: string): Promise<CryptoKey | null> {
    await this.ensureReady();
    if (this.useMemoryFallback || !this.db) {
      const entry = this.memoryStore.get(id);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        this.memoryStore.delete(id); // lazy eviction — matches IDB behaviour
        return null;
      }
      return entry.key;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.get(id);
      req.onsuccess = () => {
        const entry = req.result as IDBKeyEntry | undefined;
        if (!entry) { resolve(null); return; }
        // Проверяем срок действия
        if (entry.expiresAt && entry.expiresAt < Date.now()) {
          resolve(null);
          return;
        }
        resolve(entry.key);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Получение или создание identity key pair.
   * Uses an in-flight guard to prevent race conditions when called concurrently.
   */
  async getOrCreateIdentityKeyPair(userId: string): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    fingerprint: string;
    isNew: boolean;
  }> {
    const inflight = this._identityInFlight.get(userId);
    if (inflight) return inflight;

    const p = this._doGetOrCreateIdentityKeyPair(userId);
    this._identityInFlight.set(userId, p);
    p.finally(() => this._identityInFlight.delete(userId));
    return p;
  }

  private async _doGetOrCreateIdentityKeyPair(userId: string): Promise<{
    publicKey: CryptoKey;
    privateKey: CryptoKey;
    fingerprint: string;
    isNew: boolean;
  }> {
    const privateId = `identity:${userId}:private`;
    const publicId = `identity:${userId}:public`;

    const existingPrivate = await this.getKey(privateId);
    const existingPublic = await this.getKey(publicId);

    if (existingPrivate && existingPublic) {
      const { fingerprint } = await exportPublicKey(existingPublic);
      return { publicKey: existingPublic, privateKey: existingPrivate, fingerprint, isNew: false };
    }

    // Генерируем новую пару — private key NON-EXTRACTABLE
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false, // non-extractable private key
      ['deriveKey', 'deriveBits']
    );

    const now = Date.now();

    await this.storeKey({
      id: privateId,
      key: keyPair.privateKey,
      createdAt: now,
      type: 'identity',
      metadata: { userId },
    });

    await this.storeKey({
      id: publicId,
      key: keyPair.publicKey,
      createdAt: now,
      type: 'identity',
      metadata: { userId },
    });

    const { fingerprint } = await exportPublicKey(keyPair.publicKey);

    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      fingerprint,
      isNew: true,
    };
  }

  /**
   * Деривация мастер-ключа из пароля (PBKDF2, 600000 итераций)
   */
  async deriveMasterKey(passphrase: string, salt?: ArrayBuffer): Promise<{
    key: CryptoKey;
    salt: string;
  }> {
    const saltBuf = salt ?? (() => {
      const buf = new ArrayBuffer(32);
      crypto.getRandomValues(new Uint8Array(buf));
      return buf;
    })();

    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const masterKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuf,
        iterations: 600_000,
        hash: 'SHA-256',
      },
      passphraseKey,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );

    return { key: masterKey, salt: toBase64(saltBuf) };
  }

  /**
   * Удаление ключа по ID
   */
  async deleteKey(id: string): Promise<void> {
    await this.ensureReady();
    if (this.useMemoryFallback || !this.db) {
      this.memoryStore.delete(id);
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Удаление всех ключей
   */
  async clearAll(): Promise<void> {
    await this.ensureReady();
    if (this.useMemoryFallback || !this.db) {
      this.memoryStore.clear();
      return;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Очистка просроченных ключей. Возвращает количество удалённых записей.
   */
  async cleanupExpired(): Promise<number> {
    await this.ensureReady();
    const now = Date.now();
    let count = 0;

    if (this.useMemoryFallback || !this.db) {
      for (const [id, entry] of this.memoryStore) {
        if (entry.expiresAt && entry.expiresAt < now) {
          this.memoryStore.delete(id);
          count++;
        }
      }
      return count;
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) { resolve(count); return; }
        const entry = cursor.value as IDBKeyEntry;
        if (entry.expiresAt && entry.expiresAt < now) {
          cursor.delete();
          count++;
        }
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Проверка существования ключа
   */
  async hasKey(id: string): Promise<boolean> {
    // Delegate to getKey so that expiresAt is checked consistently
    // (IDB store.count returns > 0 for expired entries; getKey returns null)
    return (await this.getKey(id)) !== null;
  }

  /**
   * Закрытие соединения с БД и таймера
   */
  close(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
