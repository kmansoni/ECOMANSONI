/**
 * Media Key Backup — зашифрованное облачное резервирование медиа-ключей
 *
 * Позволяет пользователю зашифровать набор медиа-ключей паролем (PBKDF2)
 * и сохранить как blob в Supabase Storage.
 * На новом устройстве пользователь вводит пароль → ключи расшифровываются.
 *
 * Формат backup envelope:
 * {
 *   v: 1,
 *   salt: string,        // base64 32-byte PBKDF2 salt
 *   iv: string,          // base64 12-byte AES-GCM nonce
 *   ciphertext: string,  // base64 AES-GCM(masterKey, JSON(keyMap))
 *   keyIds: string[],    // plaintext index of backed-up key IDs
 *   createdAt: number,
 *   expiresAt?: number
 * }
 */

import { toBase64, fromBase64 } from './utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaKeyBackupEnvelope {
  v: 1;
  salt: string;
  iv: string;
  ciphertext: string;
  keyIds: string[];
  createdAt: number;
  expiresAt?: number;
}

/** Map of keyId → base64-encoded raw key bytes */
type KeyMap = Record<string, string>;

// ─── PBKDF2 key derivation ────────────────────────────────────────────────────

async function deriveBackupKey(
  password: string,
  salt: ArrayBuffer,
): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Create backup ─────────────────────────────────────────────────────────────

/**
 * Создаёт зашифрованный backup из набора медиа-ключей.
 *
 * @param mediaKeys  Map keyId → CryptoKey (AES-GCM, extractable)
 * @param password   Пользовательский пароль
 * @param expiresIn  Опциональный TTL backup в миллисекундах
 */
export async function createMediaKeyBackup(
  mediaKeys: Map<string, CryptoKey>,
  password: string,
  expiresIn?: number,
): Promise<MediaKeyBackupEnvelope> {
  if (password.length < 12) {
    throw new Error('Backup password must be at least 12 characters.');
  }

  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  // Export each key to raw bytes
  const keyMap: KeyMap = {};
  for (const [keyId, key] of mediaKeys) {
    const raw = await crypto.subtle.exportKey('raw', key).catch(() => {
      throw new Error(
        `Key "${keyId}" is non-extractable. Create media keys with extractable: true.`,
      );
    });
    keyMap[keyId] = toBase64(raw);
  }

  const masterKey = await deriveBackupKey(password, salt.buffer as ArrayBuffer);
  const plaintext = new TextEncoder().encode(JSON.stringify(keyMap));
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, plaintext);

  const now = Date.now();
  return {
    v: 1,
    salt: toBase64(salt.buffer as ArrayBuffer),
    iv: toBase64(iv.buffer as ArrayBuffer),
    ciphertext: toBase64(ciphertextBuf),
    keyIds: Object.keys(keyMap),
    createdAt: now,
    expiresAt: expiresIn ? now + expiresIn : undefined,
  };
}

// ─── Restore backup ────────────────────────────────────────────────────────────

/**
 * Восстанавливает медиа-ключи из зашифрованного backup.
 *
 * @param envelope  Backup envelope (from Supabase Storage)
 * @param password  Пользовательский пароль
 * @returns Map keyId → CryptoKey (AES-GCM, non-extractable after restore)
 */
export async function restoreMediaKeyBackup(
  envelope: MediaKeyBackupEnvelope,
  password: string,
): Promise<Map<string, CryptoKey>> {
  if (envelope.v !== 1) {
    throw new Error(`Unsupported backup version: ${(envelope as { v: number }).v}`);
  }
  if (envelope.expiresAt && Date.now() > envelope.expiresAt) {
    throw new Error('Backup has expired and cannot be restored.');
  }

  const masterKey = await deriveBackupKey(password, fromBase64(envelope.salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
    masterKey,
    fromBase64(envelope.ciphertext),
  ).catch(() => {
    throw new Error('Backup decryption failed — wrong password or corrupted backup.');
  });

  const keyMap: KeyMap = JSON.parse(new TextDecoder().decode(plaintext));
  const restored = new Map<string, CryptoKey>();

  for (const [keyId, rawB64] of Object.entries(keyMap)) {
    const key = await crypto.subtle.importKey(
      'raw',
      fromBase64(rawB64),
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable after restore — intentional
      ['encrypt', 'decrypt'],
    );
    restored.set(keyId, key);
  }

  return restored;
}

// ─── Update backup (add new keys) ─────────────────────────────────────────────

/**
 * Обновляет существующий backup, добавляя новые медиа-ключи.
 * Требует оригинальный пароль для расшифровки старого backup.
 */
export async function updateMediaKeyBackup(
  oldEnvelope: MediaKeyBackupEnvelope,
  newKeys: Map<string, CryptoKey>,
  password: string,
  expiresIn?: number,
): Promise<MediaKeyBackupEnvelope> {
  // Restore old keys
  const existing = await restoreMediaKeyBackup(oldEnvelope, password);

  // Merge new keys (new keys take precedence)
  for (const [id, key] of newKeys) {
    existing.set(id, key);
  }

  // Re-encrypt entire set
  return createMediaKeyBackup(existing, password, expiresIn);
}

// ─── Serialization helpers ────────────────────────────────────────────────────

export function serializeEnvelope(envelope: MediaKeyBackupEnvelope): string {
  return JSON.stringify(envelope);
}

export function deserializeEnvelope(json: string): MediaKeyBackupEnvelope {
  const parsed: unknown = JSON.parse(json);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    (parsed as { v?: unknown }).v !== 1
  ) {
    throw new Error('Invalid backup envelope format.');
  }
  return parsed as MediaKeyBackupEnvelope;
}
