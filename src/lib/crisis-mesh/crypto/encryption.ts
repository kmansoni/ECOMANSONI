/**
 * Crisis Mesh — encryption wrapper.
 *
 * P0: AES-GCM с общим session key per-peer.
 * P1: переключение на Double Ratchet (src/lib/e2ee/doubleRatchet.ts)
 *     когда X3DH handshake завершён между пирами.
 *
 * Session key lifecycle:
 *   1. first-contact: X3DH обмен prekey bundles → derived shared secret
 *   2. HKDF из shared secret → AES-GCM 256-bit ключ
 *   3. Каждое сообщение: новый IV (12 байт random)
 *   4. P1: ratcheting — новый ключ каждое сообщение (forward secrecy)
 */

import { toBase64, fromBase64 } from '@/lib/e2ee/utils';
import { CrisisMeshError } from '../types';

export interface SessionKey {
  key: CryptoKey;
  peerId: string;
  establishedAt: number;
}

/**
 * Импорт raw session key в CryptoKey.
 */
export async function importSessionKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== 32) {
    throw new CrisisMeshError(
      'NOT_INITIALIZED',
      `session key must be 32 bytes, got ${rawKey.length}`,
    );
  }
  return crypto.subtle.importKey(
    'raw',
    rawKey as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );
}

/**
 * Derive session key из shared secret через HKDF-SHA256.
 */
export async function deriveSessionKey(
  sharedSecret: Uint8Array,
  salt: Uint8Array,
  info: string,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret as unknown as ArrayBuffer,
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as unknown as ArrayBuffer,
      info: new TextEncoder().encode(info) as unknown as ArrayBuffer,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptResult {
  ciphertext: string;   // base64
  nonce: string;        // base64 (12 bytes IV)
}

/**
 * Encrypt plaintext с AES-GCM + AAD = header-канонический-префикс.
 * AAD связывает ciphertext с контекстом: тамперинг hopCount/senderId ломает decrypt.
 */
export async function encryptPayload(
  sessionKey: CryptoKey,
  plaintext: string,
  aad: string,
): Promise<EncryptResult> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as ArrayBuffer,
      additionalData: new TextEncoder().encode(aad) as unknown as ArrayBuffer,
    },
    sessionKey,
    plaintextBytes as unknown as ArrayBuffer,
  );

  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(iv),
  };
}

/**
 * Decrypt. Кидает CrisisMeshError('DECRYPTION_FAILED') если tag не сошёлся
 * (сигнал что данные были модифицированы или ключ неверный).
 */
export async function decryptPayload(
  sessionKey: CryptoKey,
  ciphertext: string,
  nonce: string,
  aad: string,
): Promise<string> {
  try {
    const ct = fromBase64(ciphertext);
    const iv = fromBase64(nonce);

    const plaintextBuf = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: new TextEncoder().encode(aad) as unknown as ArrayBuffer,
      },
      sessionKey,
      ct,
    );

    return new TextDecoder().decode(plaintextBuf);
  } catch (err) {
    throw new CrisisMeshError(
      'DECRYPTION_FAILED',
      'failed to decrypt payload — tag mismatch or wrong key',
      err,
    );
  }
}

/**
 * Строит AAD для encrypt/decrypt, связывая с header-полями которые
 * не должны быть модифицированы relay.
 */
export function buildAad(
  senderId: string,
  recipientId: string,
  kind: string,
  timestamp: number,
): string {
  return `${senderId}|${recipientId}|${kind}|${timestamp}`;
}
