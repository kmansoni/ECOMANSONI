/**
 * E2EE Key Store
 * Безопасное хранилище ключей на основе IndexedDB.
 * Identity private keys и master keys — non-extractable.
 * Fallback на in-memory Map если IndexedDB недоступна.
 */

import { generateIdentityKeyPair, exportPublicKey } from './crypto';
import { toBase64, fromBase64 } from './utils';
import { authenticateWithBiometric } from './biometricUnlock';

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

export interface SecureKeyStoreConfig {
  dbName?: string;
  keyStoreName?: string;
  metaStoreName?: string;
  autoLockMs?: number;
}

export interface SecureWrappedKeyRecord {
  id: string;
  type: 'identity' | 'session' | 'group' | 'master';
  format: KeyFormat;
  wrappedKey: string;
  createdAt: number;
  updatedAt: number;
}

interface SecureMetaRecord {
  id: string;
  value: string;
}

/**
 * SecureKeyStore - IndexedDB with AES-KW encryption-at-rest.
 *
 * - Master key: PBKDF2(passphrase + device fingerprint, 600k rounds, 32-byte salt)
 * - All keys at rest are wrapped via AES-KW
 * - Auto-lock after inactivity
 * - WebAuthn biometric gate for unlock flow
 */
export class SecureKeyStore {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private masterKey: CryptoKey | null = null;
  private lastActivity = 0;
  private autoLockTimer: ReturnType<typeof setInterval> | null = null;
  private useMemoryFallback = false;
  private readonly memoryWrapped = new Map<string, SecureWrappedKeyRecord>();
  private readonly memoryMeta = new Map<string, string>();

  private readonly dbName: string;
  private readonly keyStoreName: string;
  private readonly metaStoreName: string;
  private readonly autoLockMs: number;

  constructor(config: SecureKeyStoreConfig = {}) {
    this.dbName = config.dbName ?? 'e2ee-secure-keystore-v1';
    this.keyStoreName = config.keyStoreName ?? 'wrapped_keys';
    this.metaStoreName = config.metaStoreName ?? 'meta';
    this.autoLockMs = config.autoLockMs ?? 5 * 60 * 1000;
  }

  async init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.openDb().catch(() => {
        this.useMemoryFallback = true;
      });
    }
    return this.initPromise;
  }

  async unlockWithPassphrase(passphrase: string, deviceFingerprint = 'web-default-device'): Promise<void> {
    await this.init();

    let saltB64 = await this.getMeta('salt');
    if (!saltB64) {
      const salt = new Uint8Array(32);
      crypto.getRandomValues(salt);
      saltB64 = toBase64(salt.buffer as ArrayBuffer);
      await this.setMeta('salt', saltB64);
    }

    const derived = await this.deriveMasterKey(passphrase, deviceFingerprint, fromBase64(saltB64));
    this.masterKey = derived;
    this.touchActivity();
    this.ensureAutoLockTimer();
  }

  async unlockWithBiometric(
    getPassphrase: () => Promise<string>,
    deviceFingerprint = 'web-default-device',
    timeoutMs = 30_000,
  ): Promise<boolean> {
    await this.init();

    const credIdB64 = await this.getMeta('webauthn_credential_id');
    const credId = credIdB64 ? fromBase64(credIdB64) : undefined;
    const auth = await authenticateWithBiometric(credId, { timeoutMs, userVerification: 'required' });
    if (!auth.ok) return false;

    const passphrase = await getPassphrase();
    await this.unlockWithPassphrase(passphrase, deviceFingerprint);
    return true;
  }

  async registerBiometricCredential(userId: string): Promise<boolean> {
    await this.init();
    if (typeof navigator === 'undefined' || !navigator.credentials || typeof PublicKeyCredential === 'undefined') {
      return false;
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const userBytes = new TextEncoder().encode(userId);
    const publicKey: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: { name: 'Mansoni E2EE' },
      user: {
        id: userBytes,
        name: userId,
        displayName: userId,
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 30_000,
      authenticatorSelection: {
        userVerification: 'required',
        residentKey: 'preferred',
      },
    };

    const created = await navigator.credentials.create({ publicKey }).catch(() => null);
    if (!created) return false;

    const credential = created as PublicKeyCredential;
    await this.setMeta('webauthn_credential_id', toBase64(credential.rawId));
    return true;
  }

  lock(): void {
    this.masterKey = null;
    this.lastActivity = 0;
  }

  isLocked(): boolean {
    return this.masterKey === null;
  }

  async storeWrappedKey(
    id: string,
    key: CryptoKey,
    format: KeyFormat,
    type: SecureWrappedKeyRecord['type'],
  ): Promise<void> {
    await this.ensureUnlocked();

    const wrapped = await crypto.subtle.wrapKey(
      format,
      key,
      this.masterKey!,
      'AES-KW',
    );

    const now = Date.now();
    const record: SecureWrappedKeyRecord = {
      id,
      type,
      format,
      wrappedKey: toBase64(wrapped),
      createdAt: now,
      updatedAt: now,
    };

    if (this.useMemoryFallback) {
      this.memoryWrapped.set(id, record);
      this.touchActivity();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(this.keyStoreName, 'readwrite');
      const store = tx.objectStore(this.keyStoreName);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    this.touchActivity();
  }

  async unwrapKey(
    id: string,
    algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | AesKeyAlgorithm,
    extractable: boolean,
    keyUsages: KeyUsage[],
  ): Promise<CryptoKey | null> {
    await this.ensureUnlocked();

    const record = await this.getWrappedKeyRecord(id);
    if (!record) return null;

    const key = await crypto.subtle.unwrapKey(
      record.format,
      fromBase64(record.wrappedKey),
      this.masterKey!,
      'AES-KW',
      algorithm,
      extractable,
      keyUsages,
    );

    this.touchActivity();
    return key;
  }

  async deleteWrappedKey(id: string): Promise<void> {
    await this.init();
    if (this.useMemoryFallback) {
      this.memoryWrapped.delete(id);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(this.keyStoreName, 'readwrite');
      const store = tx.objectStore(this.keyStoreName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clearAll(): Promise<void> {
    await this.init();
    if (this.useMemoryFallback) {
      this.memoryWrapped.clear();
      this.memoryMeta.clear();
      this.lock();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction([this.keyStoreName, this.metaStoreName], 'readwrite');
      const keyStore = tx.objectStore(this.keyStoreName);
      const metaStore = tx.objectStore(this.metaStoreName);
      keyStore.clear();
      metaStore.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.lock();
  }

  close(): void {
    if (this.autoLockTimer !== null) {
      clearInterval(this.autoLockTimer);
      this.autoLockTimer = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.masterKey = null;
    this.initPromise = null;
  }

  private async deriveMasterKey(passphrase: string, deviceFingerprint: string, salt: ArrayBuffer): Promise<CryptoKey> {
    const material = new TextEncoder().encode(`${passphrase}:${deviceFingerprint}`);
    // Normalize to local TypedArray to avoid cross-realm BufferSource failures in Node/WebCrypto CI.
    const saltBytes = new Uint8Array(salt.slice(0));
    const passphraseKey = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveKey']);

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 600_000,
        hash: 'SHA-256',
      },
      passphraseKey,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey'],
    );
  }

  private touchActivity(): void {
    this.lastActivity = Date.now();
  }

  private ensureAutoLockTimer(): void {
    if (this.autoLockTimer !== null) return;
    this.autoLockTimer = setInterval(() => {
      if (this.masterKey && Date.now() - this.lastActivity >= this.autoLockMs) {
        this.lock();
      }
    }, 5_000);
  }

  private async ensureUnlocked(): Promise<void> {
    await this.init();
    if (!this.masterKey) {
      throw new Error('SecureKeyStore is locked');
    }
    if (Date.now() - this.lastActivity >= this.autoLockMs) {
      this.lock();
      throw new Error('SecureKeyStore auto-locked due to inactivity');
    }
    this.touchActivity();
  }

  private async getWrappedKeyRecord(id: string): Promise<SecureWrappedKeyRecord | null> {
    await this.init();
    if (this.useMemoryFallback) {
      return this.memoryWrapped.get(id) ?? null;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.keyStoreName, 'readonly');
      const store = tx.objectStore(this.keyStoreName);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as SecureWrappedKeyRecord | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  private async getMeta(id: string): Promise<string | null> {
    await this.init();
    if (this.useMemoryFallback) {
      return this.memoryMeta.get(id) ?? null;
    }
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(this.metaStoreName, 'readonly');
      const store = tx.objectStore(this.metaStoreName);
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result as SecureMetaRecord | undefined;
        resolve(row?.value ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  }

  private async setMeta(id: string, value: string): Promise<void> {
    await this.init();
    if (this.useMemoryFallback) {
      this.memoryMeta.set(id, value);
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(this.metaStoreName, 'readwrite');
      const store = tx.objectStore(this.metaStoreName);
      const req = store.put({ id, value } as SecureMetaRecord);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private openDb(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('IndexedDB unavailable'));
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.keyStoreName)) {
          db.createObjectStore(this.keyStoreName, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(this.metaStoreName)) {
          db.createObjectStore(this.metaStoreName, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }
}
