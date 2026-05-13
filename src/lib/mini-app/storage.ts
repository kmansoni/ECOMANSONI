/**
 * Mansoni Mini App — Storage Engine
 *
 * Встроенное хранилище: IndexedDB через idb-keyval (или fallback).
 * Secure Storage: AES-256-GCM через Web Crypto API.
 *
 * Не зависит от Telegram — использует только Web API.
 */

import { getDeviceInfo } from './device';

interface StorageItem {
  key: string;
  value: string;
}

// ── Simple key-value store (IndexedDB-backed) ───────────

const STORE_NAME = 'mansoni-mini-app';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORE_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(key: string): Promise<string | null> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('kv', 'readonly');
    const req = tx.objectStore('kv').get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

async function dbSet(key: string, value: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const cloudStorage = {
  /** Get multiple keys */
  get: async (keys: string[]): Promise<StorageItem[]> => {
    const results: StorageItem[] = [];
    for (const key of keys) {
      const value = await dbGet(key);
      if (value !== null) results.push({ key, value });
    }
    return results;
  },
  /** Get single key */
  getOne: async (key: string): Promise<string | null> => dbGet(key),
  /** Set multiple items */
  set: async (items: StorageItem[]): Promise<void> => {
    for (const item of items) await dbSet(item.key, item.value);
  },
  /** Delete multiple keys */
  delete: async (keys: string[]): Promise<void> => {
    for (const key of keys) await dbDelete(key);
  },
};

// ── Secure Storage (AES-256-GCM) ────────────────────────

const SECURE_PREFIX = 'ss_';
const SALT_KEY = 'secure_storage_salt';

async function getOrCreateSalt(): Promise<CryptoKey> {
  let rawSalt = await dbGet(SALT_KEY);
  if (!rawSalt) {
    rawSalt = crypto.getRandomValues(new Uint8Array(16)).join(',');
    await dbSet(SALT_KEY, rawSalt);
  }
  const salt = Uint8Array.from(rawSalt.split(','), Number);
  return crypto.subtle.importKey('raw', salt, { name: 'PBKDF2' }, false, ['deriveKey']);
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const saltKey = await getOrCreateSalt();
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(passphrase), iterations: 100000, hash: 'SHA-256' },
    saltKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export const secureStorage = {
  /** Store encrypted value */
  set: async (key: string, value: string): Promise<void> => {
    const passphrase = getDeviceInfo().isIOS ? 'ios-secure' : 'android-secure';
    const derivedKey = await deriveKey(passphrase);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      derivedKey,
      encoder.encode(value)
    );
    const payload = JSON.stringify({ iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) });
    await dbSet(SECURE_PREFIX + key, payload);
  },

  /** Retrieve and decrypt value */
  get: async (key: string): Promise<string | null> => {
    const payload = await dbGet(SECURE_PREFIX + key);
    if (!payload) return null;
    try {
      const { iv, data } = JSON.parse(payload);
      const passphrase = getDeviceInfo().isIOS ? 'ios-secure' : 'android-secure';
      const derivedKey = await deriveKey(passphrase);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        derivedKey,
        new Uint8Array(data)
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      return null;
    }
  },
};

// ── Session Storage (in-memory, cleared on app close) ───

const _sessionCache = new Map<string, string>();

export const sessionStorage = {
  get: (key: string): string | null => _sessionCache.get(key) ?? null,
  set: (key: string, value: string): void => { _sessionCache.set(key, value); },
  delete: (key: string): void => { _sessionCache.delete(key); },
  clear: (): void => _sessionCache.clear(),
};