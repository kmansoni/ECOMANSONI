/**
 * Cryptographic primitives for CallKeyExchange.
 * Extracted for modularity — max 150 lines.
 *
 * H-1: Random HKDF salt
 * H-2: Non-extractable epoch CryptoKey  
 * C-1: ECDSA signature verification order
 */

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value);
}

// Crypto helpers
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

export function decodeRequiredBase64Bytes(b64: string, expectedLength: number, field: string): Uint8Array {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(b64);
  } catch {
    throw new Error(`[CallKeyExchange] processStagedKeyPackage: ${field} must be valid base64.`);
  }
  if (bytes.length !== expectedLength) {
    throw new Error(`[CallKeyExchange] processStagedKeyPackage: ${field} must decode to ${expectedLength} bytes, got ${bytes.length}.`);
  }
  return bytes;
}

/**
 * Generate random 32-byte salt for HKDF (H-1)
 */
export function generateHKDFSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/**
 * Generate AES-128-GCM epoch key (non-extractable)
 */
export async function generateEpochKey(): Promise<CryptoKey> {
  const rawKeyBytes = crypto.getRandomValues(new Uint8Array(16));
  return crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive AES-KW wrapping key from ECDH shared secret
 */
export async function deriveWrappingKey(
  sharedBits: ArrayBuffer,
  epoch: number,
  userId: string,
  deviceId: string,
  sessionId: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const info = new TextEncoder().encode(
    `call-e2ee-epoch-${epoch}-${userId}-${deviceId}-${sessionId}`
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    hkdfKey,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/**
 * Wrap epoch key with AES-KW
 */
export async function wrapEpochKey(
  rawKeyBytes: Uint8Array,
  wrappingKey: CryptoKey
): Promise<string> {
  const localWrapKey = await crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM', length: 128 },
    true,
    ['encrypt', 'decrypt']
  );
  const wrappedKeyBuffer = await crypto.subtle.wrapKey(
    'raw',
    localWrapKey,
    wrappingKey,
    'AES-KW'
  );
  return bytesToBase64(new Uint8Array(wrappedKeyBuffer));
}

/**
 * Unwrap epoch key with AES-KW (returns non-extractable CryptoKey)
 */
export async function unwrapEpochKey(
  ciphertextRaw: Uint8Array,
  unwrappingKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    ciphertextRaw,
    unwrappingKey,
    'AES-KW',
    { name: 'AES-GCM', length: 128 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encode signature data for KeyPackage verification
 */
export function encodeSignData(
  senderPublicKey: string,
  ciphertext: string,
  epoch: number,
  userId: string,
  deviceId: string,
  sessionId: string,
  salt: string,
  messageId: string
): Uint8Array {
  return new TextEncoder().encode(
    `${senderPublicKey}|${ciphertext}|${epoch}|${userId}|${deviceId}|${sessionId}|${salt}|${messageId}`
  );
}