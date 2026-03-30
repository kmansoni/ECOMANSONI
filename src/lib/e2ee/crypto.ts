/**
 * E2EE Crypto Library v2
 * Улучшенная криптографическая библиотека с AAD, safety numbers и anti-replay.
 * Использует ТОЛЬКО Web Crypto API (window.crypto.subtle).
 */

// ─── Типы и интерфейсы ───────────────────────────────────────────────────────

export interface EncryptedPayload {
  v: 2;
  iv: string;       // base64 IV (12 bytes)
  ct: string;       // base64 ciphertext (без auth tag)
  tag: string;      // base64 auth tag (16 bytes)
  epoch: number;    // эпоха ключа для forward secrecy
  kid: string;      // key ID для идентификации ключа
}

export interface KeyContext {
  conversationId: string;
  keyVersion: number;
  senderId: string;
}

export interface SafetyNumber {
  numeric: string;   // 60-digit number
  emoji: string[];   // 8 emoji для визуальной верификации
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ExportedPublicKey {
  raw: string;         // base64 raw public key
  fingerprint: string; // SHA-256 fingerprint
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────

import { toBase64, fromBase64 } from './utils';

function encodeText(text: string): ArrayBuffer {
  const encoded = new TextEncoder().encode(text);
  const buf = new ArrayBuffer(encoded.length);
  new Uint8Array(buf).set(encoded);
  return buf;
}

function secureRandom(size: number): ArrayBuffer {
  const buf = new ArrayBuffer(size);
  crypto.getRandomValues(new Uint8Array(buf));
  return buf;
}

// ─── Генерация ключей ─────────────────────────────────────────────────────────

/**
 * Генерация identity key pair (ECDH P-256)
 */
export async function generateIdentityKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // private key non-extractable
    ['deriveKey', 'deriveBits']
  );
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  };
}

/**
 * Экспорт публичного ключа
 */
export async function exportPublicKey(key: CryptoKey): Promise<ExportedPublicKey> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const rawB64 = toBase64(raw);
  const fingerprint = await computeFingerprint(key);
  return { raw: rawB64, fingerprint };
}

/**
 * Импорт публичного ключа из raw bytes (base64)
 */
export async function importPublicKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    fromBase64(raw),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

/**
 * ECDH key agreement — деривация shared secret
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'HKDF' },
    false,
    ['deriveKey', 'deriveBits']
  );
}

/**
 * HKDF деривация ключа из shared secret
 */
export async function hkdfDerive(
  sharedSecret: CryptoKey,
  salt: ArrayBuffer,
  info: string,
  keyLength = 256
): Promise<CryptoKey> {
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: encodeText(info),
    },
    sharedSecret,
    { name: 'AES-GCM', length: keyLength },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Bundle containing a non-extractable CryptoKey and its raw bytes.
 * rawBytes is required ONLY for wrapKey during key distribution.
 * Caller MUST call zeroRawBytes() after distribution is complete.
 */
export interface MessageKeyBundle {
  /** Non-extractable AES-256-GCM key for encrypt/decrypt operations */
  key: CryptoKey;
  /** Raw key material — needed only for wrapKey(); call zeroRawBytes() after use */
  rawBytes: Uint8Array;
  /** Overwrites rawBytes with zeros. Call after key distribution is complete. */
  zeroRawBytes: () => void;
}

/**
 * Генерация AES-256-GCM ключа для шифрования сообщений.
 *
 * SECURITY: Ключ возвращается как non-extractable CryptoKey.
 * rawBytes нужен ТОЛЬКО для wrapKey-операции при distributeGroupKey.
 * После distribute вызвать bundle.zeroRawBytes() для очистки raw material из памяти.
 *
 * Паттерн из callKeyExchange.ts §14.3.13: ephemeral extractable alias.
 */
export async function generateMessageKey(): Promise<MessageKeyBundle> {
  const rawBytes = new Uint8Array(32);
  crypto.getRandomValues(rawBytes);

  const key = await crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false, // NON-EXTRACTABLE: XSS не может экспортировать ключ
    ['encrypt', 'decrypt'],
  );

  return {
    key,
    rawBytes,
    zeroRawBytes: () => { rawBytes.fill(0); },
  };
}

// ─── Шифрование/Расшифровка ───────────────────────────────────────────────────

/**
 * Шифрование с AAD (Additional Authenticated Data)
 */
/**
 * Derive a stable key-id (kid) from a CryptoKey — first 8 bytes of SHA-256
 * over the exported raw key material.  Non-extractable keys export as empty
 * the raw format is unavailable; in that case we fall back to a zero kid so
 * the field stays well-defined (decryption never relies on kid for lookup —
 * epoch is the authoritative version discriminator).
 */
// SECURITY FIX: deriveKid now accepts optional epoch for non-extractable keys.
// When key is non-extractable (e.g. after unwrapKey with extractable:false),
// we derive a stable kid from epoch to maintain per-version uniqueness
// without ever exposing raw key material.
async function deriveKid(key: CryptoKey, epoch?: number): Promise<string> {
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    const hash = await crypto.subtle.digest('SHA-256', raw);
    return toBase64(hash.slice(0, 8));
  } catch {
    // Non-extractable key — derive kid from epoch to maintain uniqueness
    if (epoch !== undefined) {
      const buf = new TextEncoder().encode(`kid:epoch:${epoch}`);
      const hash = await crypto.subtle.digest('SHA-256', buf);
      return toBase64(hash.slice(0, 8));
    }
    return toBase64(new ArrayBuffer(8));
  }
}

export async function encryptWithAAD(
  key: CryptoKey,
  plaintext: string,
  context: KeyContext
): Promise<EncryptedPayload> {
  const iv = secureRandom(12);
  const aad = encodeText(`${context.conversationId}:${context.keyVersion}:${context.senderId}`);
  const plaintextBuf = encodeText(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
      tagLength: 128,
    },
    key,
    plaintextBuf
  );

  // Последние 16 байт — auth tag
  const encryptedBytes = new Uint8Array(encrypted);
  const ctBuf = new ArrayBuffer(encryptedBytes.length - 16);
  const tagBuf = new ArrayBuffer(16);
  new Uint8Array(ctBuf).set(encryptedBytes.slice(0, encryptedBytes.length - 16));
  new Uint8Array(tagBuf).set(encryptedBytes.slice(encryptedBytes.length - 16));

  return {
    v: 2,
    iv: toBase64(iv),
    ct: toBase64(ctBuf),
    tag: toBase64(tagBuf),
    epoch: context.keyVersion,
    kid: await deriveKid(key, context.keyVersion),
  };
}

/**
 * Расшифровка с проверкой AAD
 */
export async function decryptWithAAD(
  key: CryptoKey,
  payload: EncryptedPayload,
  context: KeyContext
): Promise<string> {
  if (payload.v !== 2) {
    throw new Error(`Unsupported payload version: ${payload.v}`);
  }

  const iv = fromBase64(payload.iv);
  const ciphertextBytes = new Uint8Array(fromBase64(payload.ct));
  const tagBytes = new Uint8Array(fromBase64(payload.tag));
  const aad = encodeText(`${context.conversationId}:${context.keyVersion}:${context.senderId}`);

  // WebCrypto ожидает ciphertext + tag вместе
  const combinedBuf = new ArrayBuffer(ciphertextBytes.length + tagBytes.length);
  const combined = new Uint8Array(combinedBuf);
  combined.set(ciphertextBytes);
  combined.set(tagBytes, ciphertextBytes.length);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: aad,
      tagLength: 128,
    },
    key,
    combinedBuf
  );

  return new TextDecoder().decode(decrypted);
}

// ─── Key Wrapping ─────────────────────────────────────────────────────────────

/**
 * Оборачивание ключа (AES-KW) для передачи групповых ключей
 */
export async function wrapKey(
  keyToWrap: CryptoKey,
  wrappingKey: CryptoKey
): Promise<string> {
  const wrapped = await crypto.subtle.wrapKey('raw', keyToWrap, wrappingKey, 'AES-KW');
  return toBase64(wrapped);
}

/**
 * Разворачивание ключа
 */
export async function unwrapKey(
  wrappedKey: string,
  unwrappingKey: CryptoKey
): Promise<CryptoKey> {
  // SECURITY FIX: extractable:false prevents XSS from exfiltrating raw key material
  // via crypto.subtle.exportKey. Key is usable for encrypt/decrypt but cannot be extracted.
  return crypto.subtle.unwrapKey(
    'raw',
    fromBase64(wrappedKey),
    unwrappingKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Safety Numbers ───────────────────────────────────────────────────────────

const SAFETY_EMOJI = [
  '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼',
  '🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔',
  '🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗',
  '🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜',
  '🦟','🦗','🕷','🦂','🐢','🐍','🦎','🦖',
  '🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠',
  '🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆',
  '🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒',
];

/**
 * Вычисление safety numbers для верификации ключей
 */
export async function computeSafetyNumber(
  localIdentityKey: CryptoKey,
  remoteIdentityKey: CryptoKey,
  localUserId: string,
  remoteUserId: string
): Promise<SafetyNumber> {
  const [firstKey, secondKey, firstId, secondId] =
    localUserId < remoteUserId
      ? [localIdentityKey, remoteIdentityKey, localUserId, remoteUserId]
      : [remoteIdentityKey, localIdentityKey, remoteUserId, localUserId];

  const firstRaw = await crypto.subtle.exportKey('raw', firstKey);
  const secondRaw = await crypto.subtle.exportKey('raw', secondKey);

  const firstIdBuf = encodeText(firstId);
  const secondIdBuf = encodeText(secondId);

  const firstIdBytes = new Uint8Array(firstIdBuf);
  const secondIdBytes = new Uint8Array(secondIdBuf);
  const firstRawBytes = new Uint8Array(firstRaw);
  const secondRawBytes = new Uint8Array(secondRaw);

  const totalLen = firstIdBytes.length + firstRawBytes.length +
    secondIdBytes.length + secondRawBytes.length;
  const combinedBuf = new ArrayBuffer(totalLen);
  const combined = new Uint8Array(combinedBuf);
  let offset = 0;
  combined.set(firstIdBytes, offset); offset += firstIdBytes.length;
  combined.set(firstRawBytes, offset); offset += firstRawBytes.length;
  combined.set(secondIdBytes, offset); offset += secondIdBytes.length;
  combined.set(secondRawBytes, offset);

  const hashBuf = await crypto.subtle.digest('SHA-256', combinedBuf);
  const hash = new Uint8Array(hashBuf);
  const numericSeedBuf = await crypto.subtle.digest('SHA-512', combinedBuf);
  const numericSeed = new Uint8Array(numericSeedBuf);

  // 60-digit number: 12 групп по 5 цифр
  let numeric = '';
  // SECURITY FIX: Use non-overlapping 3-byte windows from SHA-512 output
  // to avoid byte overlap correlation between adjacent groups.
  for (let i = 0; i < 12; i++) {
    const byteIdx = i * 3;
    const val =
      ((numericSeed[byteIdx] << 16) | (numericSeed[byteIdx + 1] << 8) | numericSeed[byteIdx + 2]) %
      100000;
    numeric += val.toString().padStart(5, '0');
  }

  const emoji: string[] = [];
  for (let i = 0; i < 8; i++) {
    emoji.push(SAFETY_EMOJI[hash[i] % 64]);
  }

  return { numeric, emoji };
}

/**
 * SHA-256 fingerprint ключа (hex с разделителями)
 */
export async function computeFingerprint(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  const hashBuf = await crypto.subtle.digest('SHA-256', raw);
  return Array.from(new Uint8Array(hashBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(':');
}

// ─── Nonce Manager (anti-replay) ──────────────────────────────────────────────

export class NonceManager {
  private seen: Set<string>;
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.seen = new Set();
    this.maxSize = maxSize;
  }

  /** Возвращает true если nonce НОВЫЙ (не встречался ранее) */
  check(nonce: string): boolean {
    return !this.seen.has(nonce);
  }

  add(nonce: string): void {
    if (this.seen.size >= this.maxSize) {
      const first = this.seen.values().next().value;
      if (first !== undefined) this.seen.delete(first);
    }
    this.seen.add(nonce);
  }

  // SECURITY FIX: Atomic check-and-add prevents TOCTOU races in concurrent decrypt paths.
  /** Атомарная проверка и добавление. Возвращает true если nonce НОВЫЙ (не повтор). */
  checkAndAdd(nonce: string): boolean {
    if (this.seen.has(nonce)) return false;
    this.add(nonce);
    return true;
  }

  /** Генерация криптографически случайного nonce (12 байт, base64) */
  generateNonce(): string {
    return toBase64(secureRandom(12));
  }

  clear(): void {
    this.seen.clear();
  }
}
