/**
 * Key Escrow — Social Recovery для E2EE identity ключей
 *
 * Два режима восстановления:
 *
 * 1. Social Recovery (Shamir's Secret Sharing-inspired):
 *    - Владелец выбирает N доверенных контактов (guardians)
 *    - Identity private key разбивается на N шардов (XOR-based, simple 2-of-N)
 *    - Каждый шард зашифрован публичным ключом гардиана
 *    - Восстановление требует K из N гардианов (threshold)
 *
 * 2. Password-derived Escrow:
 *    - Identity private key зашифрован PBKDF2(recovery_password)
 *    - Blob хранится в Supabase Storage или email
 *    - Восстановление требует только пароль
 *
 * Формат шарда:
 * {
 *   shardId: string,       // UUID
 *   accountId: string,     // owner user id
 *   guardianId: string,    // guardian user id
 *   index: number,         // shard index (1-based)
 *   threshold: number,     // K-of-N
 *   total: number,         // N
 *   encryptedShard: string // base64 AES-GCM(guardianSharedKey, shardBytes)
 *   iv: string,
 *   createdAt: number
 * }
 */

import { toBase64, fromBase64 } from './utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EscrowShard {
  shardId: string;
  accountId: string;
  guardianId: string;
  index: number;
  threshold: number;
  total: number;
  encryptedShard: string; // base64
  iv: string;             // base64 12-byte
  createdAt: number;
}

export interface PasswordEscrowBlob {
  v: 1;
  salt: string;       // base64 32-byte PBKDF2 salt
  iv: string;         // base64 12-byte AES-GCM nonce
  ciphertext: string; // base64 AES-GCM(PBKDF2(password), PKCS8 private key bytes)
  createdAt: number;
}

export interface SocialRecoveryResult {
  shards: EscrowShard[];
  threshold: number;
  total: number;
}

// ─── PBKDF2 helper ────────────────────────────────────────────────────────────

async function deriveEscrowKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
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

// ─── Password Escrow ──────────────────────────────────────────────────────────

/**
 * Шифрует identity private key паролем восстановления.
 *
 * @param identityPrivateKey  Must have extractable: true to export
 * @param recoveryPassword    Min 16 chars recommended
 */
export async function createPasswordEscrow(
  identityPrivateKey: CryptoKey,
  recoveryPassword: string,
): Promise<PasswordEscrowBlob> {
  if (recoveryPassword.length < 12) {
    throw new Error('Recovery password must be at least 12 characters.');
  }

  let pkcs8Bytes: ArrayBuffer;
  try {
    pkcs8Bytes = await crypto.subtle.exportKey('pkcs8', identityPrivateKey);
  } catch {
    throw new Error(
      'identityPrivateKey is non-extractable. Cannot create password escrow. ' +
      'Generate with extractable: true for escrow capability.',
    );
  }

  const salt = new Uint8Array(32);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const escrowKey = await deriveEscrowKey(recoveryPassword, salt.buffer as ArrayBuffer);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    escrowKey,
    pkcs8Bytes,
  );

  return {
    v: 1,
    salt: toBase64(salt.buffer as ArrayBuffer),
    iv: toBase64(iv.buffer as ArrayBuffer),
    ciphertext: toBase64(ciphertextBuf),
    createdAt: Date.now(),
  };
}

/**
 * Восстанавливает identity private key из password escrow.
 * Возвращает non-extractable CryptoKey (ECDH P-256).
 */
export async function recoverFromPasswordEscrow(
  blob: PasswordEscrowBlob,
  recoveryPassword: string,
): Promise<CryptoKey> {
  const escrowKey = await deriveEscrowKey(recoveryPassword, fromBase64(blob.salt));
  const pkcs8Bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) },
    escrowKey,
    fromBase64(blob.ciphertext),
  ).catch(() => {
    throw new Error('Escrow decryption failed — wrong recovery password.');
  });

  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // non-extractable after recovery
    ['deriveKey', 'deriveBits'],
  );
}

// ─── Social Recovery (XOR shard splitting) ───────────────────────────────────

/**
 * Разбивает identity private key на `total` шардов методом XOR.
 * Для восстановления нужны ВСЕ `total` шарды (full XOR scheme).
 * Для K-of-N порогового восстановления нужна реализация Shamir's SS (todo roadmap).
 *
 * Каждый шард зашифрован общим ECDH секретом с гардианом (wrappingKeys).
 *
 * @param identityPrivateKey  Must have extractable: true
 * @param guardianWrappingKeys  Array of { guardianId, aesKey } — один ключ на гардиана
 * @param threshold  Minimum shards needed (currently must equal total for XOR)
 */
export async function splitKeyForSocialRecovery(
  accountId: string,
  identityPrivateKey: CryptoKey,
  guardianWrappingKeys: Array<{ guardianId: string; aesKey: CryptoKey }>,
  threshold: number,
): Promise<SocialRecoveryResult> {
  const total = guardianWrappingKeys.length;
  if (threshold < 2 || threshold > total) {
    throw new Error(`threshold must be between 2 and total (${total})`);
  }
  if (total > 10) {
    throw new Error('Social recovery supports up to 10 guardians.');
  }

  // Export private key bytes
  let pkcs8Bytes: Uint8Array;
  try {
    pkcs8Bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', identityPrivateKey));
  } catch {
    throw new Error('identityPrivateKey is non-extractable. Cannot create social escrow.');
  }

  const keyLen = pkcs8Bytes.length;

  // XOR split: generate (N-1) random shards, last = XOR of all
  const randomShards: Uint8Array[] = [];
  for (let i = 0; i < total - 1; i++) {
    const shard = new Uint8Array(keyLen);
    crypto.getRandomValues(shard);
    randomShards.push(shard);
  }

  // Last shard = secret XOR shard[0] XOR shard[1] ... XOR shard[N-2]
  const lastShard = new Uint8Array(pkcs8Bytes);
  for (const s of randomShards) {
    for (let b = 0; b < keyLen; b++) lastShard[b] ^= s[b];
  }
  randomShards.push(lastShard);

  // Encrypt each shard with the guardian's AES key
  const shards: EscrowShard[] = [];
  for (let i = 0; i < total; i++) {
    const { guardianId, aesKey } = guardianWrappingKeys[i];
    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const encBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      randomShards[i],
    );

    shards.push({
      shardId: crypto.randomUUID(),
      accountId,
      guardianId,
      index: i + 1,
      threshold,
      total,
      encryptedShard: toBase64(encBuf),
      iv: toBase64(iv.buffer as ArrayBuffer),
      createdAt: Date.now(),
    });
  }

  return { shards, threshold, total };
}

/**
 * Восстанавливает identity private key из набора расшифрованных шардов.
 * Шарды должны быть расшифрованы гардианами и переданы как plaintext ArrayBuffer.
 *
 * @param decryptedShards  Array of { index, shardBytes } — must cover all N shards for XOR
 */
export async function recoverFromShards(
  decryptedShards: Array<{ index: number; shardBytes: ArrayBuffer }>,
  total: number,
): Promise<CryptoKey> {
  if (decryptedShards.length !== total) {
    throw new Error(
      `Full XOR recovery requires all ${total} shards. Got ${decryptedShards.length}.`,
    );
  }

  // Sort by index
  const sorted = [...decryptedShards].sort((a, b) => a.index - b.index);

  // XOR all shards to recover key bytes
  const first = new Uint8Array(sorted[0].shardBytes);
  const keyLen = first.length;
  const secret = new Uint8Array(keyLen);
  secret.set(first);

  for (let i = 1; i < sorted.length; i++) {
    const s = new Uint8Array(sorted[i].shardBytes);
    if (s.length !== keyLen) throw new Error(`Shard ${i + 1} length mismatch.`);
    for (let b = 0; b < keyLen; b++) secret[b] ^= s[b];
  }

  return crypto.subtle.importKey(
    'pkcs8',
    secret.buffer as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // non-extractable after recovery
    ['deriveKey', 'deriveBits'],
  );
}

/**
 * Расшифровывает шард гардианским AES ключом.
 * Вызывается на стороне гардиана.
 */
export async function decryptShard(
  shard: EscrowShard,
  guardianAesKey: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(shard.iv) },
    guardianAesKey,
    fromBase64(shard.encryptedShard),
  ).catch(() => {
    throw new Error(`Shard decryption failed for index ${shard.index}.`);
  });
}
