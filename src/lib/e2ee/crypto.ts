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

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Возвращает Uint8Array с гарантированным ArrayBuffer буфером */
function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** TextEncoder с гарантированным ArrayBuffer буфером */
function encodeText(text: string): Uint8Array {
  const encoded = new TextEncoder().encode(text);
  const buf = new ArrayBuffer(encoded.length);
  const bytes = new Uint8Array(buf);
  bytes.set(encoded);
  return bytes;
}

/** Создаёт Uint8Array с гарантированным ArrayBuffer */
function secureRandom(size: number): Uint8Array {
  const buf = new ArrayBuffer(size);
  const arr = new Uint8Array(buf);
  crypto.getRandomValues(arr);
  return arr;
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
  const bytes = fromBase64(raw);
  return crypto.subtle.importKey(
    'raw',
    bytes,
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
  salt: Uint8Array,
  info: string,
  keyLength = 256
): Promise<CryptoKey> {
  const infoBytes = encodeText(info);
  // Обеспечиваем корректный ArrayBuffer для salt
  const saltBuf = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuf).set(salt);

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: saltBuf,
      info: infoBytes,
    },
    sharedSecret,
    { name: 'AES-GCM', length: keyLength },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Генерация AES-256-GCM ключа для шифрования сообщений
 */
export async function generateMessageKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable для wrapping
    ['encrypt', 'decrypt']
  );
}

// ─── Шифрование/Расшифровка ───────────────────────────────────────────────────

/**
 * Шифрование с AAD (Additional Authenticated Data)
 */
export async function encryptWithAAD(
  key: CryptoKey,
  plaintext: string,
  context: KeyContext
): Promise<EncryptedPayload> {
  const iv = secureRandom(12);
  const aad = encodeText(`${context.conversationId}:${context.keyVersion}:${context.senderId}`);
  const plaintextBytes = encodeText(plaintext);

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
      additionalData: aad,
      tagLength: 128,
    },
    key,
    plaintextBytes
  );

  // Последние 16 байт — auth tag
  const encryptedBytes = new Uint8Array(encrypted);
  const ciphertext = encryptedBytes.slice(0, encryptedBytes.length - 16);
  const authTag = encryptedBytes.slice(encryptedBytes.length - 16);

  const kidBytes = secureRandom(8);

  return {
    v: 2,
    iv: toBase64(iv),
    ct: toBase64(ciphertext),
    tag: toBase64(authTag),
    epoch: context.keyVersion,
    kid: toBase64(kidBytes),
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
  const ciphertext = fromBase64(payload.ct);
  const authTag = fromBase64(payload.tag);
  const aad = encodeText(`${context.conversationId}:${context.keyVersion}:${context.senderId}`);

  // Объединяем ciphertext + tag (WebCrypto ожидает их вместе)
  const combinedBuf = new ArrayBuffer(ciphertext.length + authTag.length);
  const combined = new Uint8Array(combinedBuf);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
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
  const wrappedBytes = fromBase64(wrappedKey);
  return crypto.subtle.unwrapKey(
    'raw',
    wrappedBytes,
    unwrappingKey,
    'AES-KW',
    { name: 'AES-GCM', length: 256 },
    true,
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
  // Сортируем по userId для детерминированности
  const [firstKey, secondKey, firstId, secondId] =
    localUserId < remoteUserId
      ? [localIdentityKey, remoteIdentityKey, localUserId, remoteUserId]
      : [remoteIdentityKey, localIdentityKey, remoteUserId, localUserId];

  const firstRaw = await crypto.subtle.exportKey('raw', firstKey);
  const secondRaw = await crypto.subtle.exportKey('raw', secondKey);

  const firstIdBytes = encodeText(firstId);
  const secondIdBytes = encodeText(secondId);

  // Конкатенация: firstId || firstKey || secondId || secondKey
  const totalLen = firstIdBytes.length + firstRaw.byteLength +
    secondIdBytes.length + secondRaw.byteLength;
  const combinedBuf = new ArrayBuffer(totalLen);
  const combined = new Uint8Array(combinedBuf);
  let offset = 0;
  combined.set(firstIdBytes, offset); offset += firstIdBytes.length;
  combined.set(new Uint8Array(firstRaw), offset); offset += firstRaw.byteLength;
  combined.set(secondIdBytes, offset); offset += secondIdBytes.length;
  combined.set(new Uint8Array(secondRaw), offset);

  const hashBuf = await crypto.subtle.digest('SHA-256', combinedBuf);
  const hash = new Uint8Array(hashBuf);

  // 60-digit number: 12 групп по 5 цифр
  let numeric = '';
  for (let i = 0; i < 12; i++) {
    const byteIdx = Math.floor(i * 2.5);
    const val = ((hash[byteIdx] << 8) | hash[byteIdx + 1]) % 100000;
    numeric += val.toString().padStart(5, '0');
  }

  // Emoji: первые 8 байт → индекс в массиве из 64 emoji
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
  const hash = new Uint8Array(hashBuf);
  return Array.from(hash)
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

  /**
   * Возвращает true если nonce НОВЫЙ (не встречался ранее)
   */
  check(nonce: string): boolean {
    return !this.seen.has(nonce);
  }

  add(nonce: string): void {
    if (this.seen.size >= this.maxSize) {
      // Удаляем первый элемент (FIFO)
      const first = this.seen.values().next().value;
      if (first !== undefined) {
        this.seen.delete(first);
      }
    }
    this.seen.add(nonce);
  }

  /**
   * Генерация криптографически случайного nonce (12 байт, base64)
   */
  generateNonce(): string {
    return toBase64(secureRandom(12));
  }

  clear(): void {
    this.seen.clear();
  }
}
