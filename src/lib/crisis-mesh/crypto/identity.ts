/**
 * Crisis Mesh — Ed25519 identity management.
 * Генерация и хранение identity keypair, peerId как fingerprint публичного ключа.
 *
 * Web Crypto API: Ed25519 поддерживается Chrome 135+, Safari 17+, Firefox 139+.
 * Для старых окружений — fallback через @noble/ed25519 (см. noble-fallback.ts).
 */

import { toBase64, fromBase64 } from '@/lib/e2ee/utils';
import { type LocalIdentity, type PeerId, asPeerId } from '../types';

const IDENTITY_STORAGE_KEY = 'crisis-mesh:identity-v1';

export interface IdentityKeyPair {
  publicKey: Uint8Array;   // 32 bytes raw Ed25519
  privateKey: CryptoKey;   // non-extractable
}

/**
 * Проверка поддержки Ed25519 в текущем окружении.
 */
export async function isEd25519Supported(): Promise<boolean> {
  try {
    await crypto.subtle.generateKey(
      { name: 'Ed25519' } as EcKeyGenParams,
      false,
      ['sign', 'verify'],
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Генерация нового identity keypair.
 * Приватный ключ non-extractable — не может быть экспортирован из CryptoKey.
 */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const keyPair = (await crypto.subtle.generateKey(
    { name: 'Ed25519' } as EcKeyGenParams,
    false,
    ['sign', 'verify'],
  )) as CryptoKeyPair;

  const publicKeyBuf = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  return {
    publicKey: new Uint8Array(publicKeyBuf),
    privateKey: keyPair.privateKey,
  };
}

/**
 * Вычисление peerId как Base58(SHA-256(publicKey))[:16].
 * Детерминированный, стабильный, короткий для UX.
 */
export async function computePeerId(publicKey: Uint8Array): Promise<PeerId> {
  const hashBuf = await crypto.subtle.digest('SHA-256', publicKey);
  const hash = new Uint8Array(hashBuf);
  // Первые 12 байт → base58 для удобного отображения
  const fingerprint = base58Encode(hash.subarray(0, 12));
  return asPeerId(fingerprint);
}

/**
 * Импорт публичного ключа в CryptoKey для verify.
 */
export async function importPublicKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    raw as unknown as ArrayBuffer,
    { name: 'Ed25519' } as EcKeyImportParams,
    true,
    ['verify'],
  );
}

/**
 * Persist identity metadata (без приватного ключа) в localStorage.
 * Приватный ключ хранится CryptoKey в памяти + отдельно в hardwareKeyStorage (опц.)
 */
export function storeIdentityMetadata(identity: LocalIdentity): void {
  const payload = {
    peerId: identity.peerId,
    displayName: identity.displayName,
    publicKey: toBase64(identity.publicKey),
    createdAt: identity.createdAt,
  };
  localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(payload));
}

export function loadIdentityMetadata(): LocalIdentity | null {
  try {
    const raw = localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      peerId: string;
      displayName: string;
      publicKey: string;
      createdAt: number;
    };
    return {
      peerId: asPeerId(parsed.peerId),
      displayName: parsed.displayName,
      publicKey: new Uint8Array(fromBase64(parsed.publicKey)),
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Bootstrap identity: загружает существующую или создаёт новую.
 * Возвращает identity + приватный ключ (для этой сессии).
 */
export async function bootstrapIdentity(
  displayName: string,
): Promise<{ identity: LocalIdentity; privateKey: CryptoKey }> {
  const existing = loadIdentityMetadata();
  if (existing) {
    // Приватный ключ должен быть восстановлен из hardwareKeyStorage
    // (в P0 — перегенерация при первом запуске без восстановления)
    throw new Error(
      'identity exists but privateKey recovery not implemented yet — requires hardwareKeyStorage integration',
    );
  }

  const { publicKey, privateKey } = await generateIdentityKeyPair();
  const peerId = await computePeerId(publicKey);

  const identity: LocalIdentity = {
    peerId,
    displayName,
    publicKey,
    createdAt: Date.now(),
  };

  storeIdentityMetadata(identity);
  return { identity, privateKey };
}

// ─── Base58 (Bitcoin alphabet) ───────────────────────────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';

  // Count leading zeros
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  // Convert to base58 digits via BigInt
  let num = 0n;
  for (const b of bytes) num = num * 256n + BigInt(b);

  let result = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    result = BASE58_ALPHABET[rem] + result;
    num = num / 58n;
  }

  // Prepend '1' for each leading zero byte
  for (let i = 0; i < zeros; i++) result = '1' + result;

  return result;
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array(0);

  let zeros = 0;
  while (zeros < str.length && str[zeros] === '1') zeros++;

  let num = 0n;
  for (const ch of str) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base58 char: ${ch}`);
    num = num * 58n + BigInt(idx);
  }

  // Convert BigInt back to bytes
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.unshift(Number(num & 0xffn));
    num = num >> 8n;
  }

  const result = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) result[zeros + i] = bytes[i];
  return result;
}
