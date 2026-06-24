/**
 * ECDSA P-256 Identity Binding for Calls V2
 *
 * Architecture:
 * - One ECDSA P-256 key pair per device, stored in IndexedDB (non-extractable private key)
 * - Signs (userId || ephemeralPubKey) — binding the signaling identity to the ECDH ephemeral key
 * - Prevents identity substitution attacks: an adversary cannot swap userId<->pubKey
 *   without invalidating the signature.
 * - Replay attack surface: signature covers ephemeralPubKey which is session-unique,
 *   so a replayed sig packet refers to a stale ECDH key and the session will reject it
 *   during ECDH key derivation (mismatch).
 * - Private key is marked non-extractable; only the SubtleCrypto handle exists in memory.
 * - IndexedDB store name: "calls-v2-identity", key: "ecdsa-keypair"
 *
 * Security notes:
 * - generateKey() uses ECDSA P-256 (NIST approved, broadly supported).
 * - sign() uses SHA-256 digest — output is a DER-encoded IEEE P1363 signature (64 bytes).
 * - For cross-platform interoperability the signature format is raw IEEE P1363 (r||s, 64 bytes).
 * - Public key exported as JWK for transmission over signaling channel.
 */

import { safeEqualHex } from '@/lib/e2ee/constantTime';

const DB_NAME = "calls-v2-identity";
const DB_VERSION = 1;
const STORE_NAME = "keypairs";
const KEY_ID = "ecdsa-p256-v1";

const ECDSA_PARAMS: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_PARAMS: EcdsaParams = { name: "ECDSA", hash: { name: "SHA-256" } };

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (evt) => {
      const db = (evt.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T = CryptoKeyPair>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut<T>(db: IDBDatabase, key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte === undefined) continue;
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function stableStringifyJwk(jwk: JsonWebKey): string {
  return JSON.stringify({
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    alg: jwk.alg,
    ext: jwk.ext,
    key_ops: jwk.key_ops,
  });
}

async function fingerprintIdentityJwk(jwk: JsonWebKey): Promise<string> {
  const encoded = new TextEncoder().encode(stableStringifyJwk(jwk));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToBase64(new Uint8Array(digest));
}

interface TrustedPeerIdentityRecord {
  userId: string;
  deviceId: string;
  fingerprint: string;
  pinnedAt: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the device-scoped ECDSA P-256 key pair, creating and persisting it
 * on first call.  The private key is non-extractable; it exists only as a
 * SubtleCrypto handle backed by the browser's secure key storage.
 *
 * Concurrency: multiple callers racing on first-call will each generate a key
 * pair; the last writer wins in IndexedDB (IDB put is atomic).  This is safe:
 * the key pair is regenerated at most once per device per browser clear; a
 * brief dual-key window during racing is acceptable — the persisted key wins.
 */
export async function getOrCreateIdentityKeyPair(): Promise<CryptoKeyPair> {
  const db = await openDb();
  const existing = await idbGet<CryptoKeyPair>(db, KEY_ID);
  if (existing && existing.privateKey && existing.publicKey) {
    db.close();
    return existing;
  }
  const pair = await crypto.subtle.generateKey(
    ECDSA_PARAMS,
    false, // privateKey non-extractable
    ["sign", "verify"],
  );
  await idbPut(db, KEY_ID, pair);
  db.close();
  return pair;
}

/**
 * Signs the tuple (senderPublicKey, ciphertext, epoch, userId, deviceId, sessionId, salt, messageId) with the device identity private key.
 *
 * The signed data layout (deterministic, no hidden state):
 *   [ senderPublicKey as string ] || [ '|' ] ||
 *   [ ciphertext as string ] || [ '|' ] ||
 *   [ epoch as string ] || [ '|' ] ||
 *   [ userId as string ] || [ '|' ] ||
 *   [ deviceId as string ] || [ '|' ] ||
 *   [ sessionId as string ] || [ '|' ] ||
 *   [ salt as string ] || [ '|' ] ||
 *   [ messageId as string ]
 *
 * Returns raw IEEE P1363 r||s (64 bytes for P-256).
 */
export async function signIdentity(
   privateKey: CryptoKey,
   userId: string,
   deviceId: string,
   sessionId: string,
   senderPublicKey: string,
   ciphertext: string,
   epoch: number,
   salt: string,
   messageId: string,
): Promise<ArrayBuffer> {
   const encoder = new TextEncoder();
   const data = new TextEncoder().encode(
      `${senderPublicKey}|${ciphertext}|${epoch}|${userId}|${deviceId}|${sessionId}|${salt}|${messageId}`
   );
   return crypto.subtle.sign(SIGN_PARAMS, privateKey, data);
}

/**
 * Verifies an ECDSA signature over (senderPublicKey, ciphertext, epoch, userId, deviceId, sessionId, salt, messageId).
 *
 * Returns false for invalid signatures.
 * Throws CryptoVerificationError for system failures (OOM, invalid params, crypto unavailable) — caller
 * must distinguish system errors from invalid signatures.
 */
export class CryptoVerificationError extends Error {
  readonly name = "CryptoVerificationError" as const;
  constructor(message: string) {
    super(message);
  }
}

export async function verifyIdentity(
   publicKey: CryptoKey,
   userId: string,
   deviceId: string,
   sessionId: string,
   senderPublicKey: string,
   ciphertext: string,
   epoch: number,
   salt: string,
   messageId: string,
   signature: ArrayBuffer,
): Promise<boolean> {
   try {
      const data = new TextEncoder().encode(
         `${senderPublicKey}|${ciphertext}|${epoch}|${userId}|${deviceId}|${sessionId}|${salt}|${messageId}`
      );
      return crypto.subtle.verify(SIGN_PARAMS, publicKey, signature, data);
   } catch (err) {
      // System failures (DOMException, OOM, invalid params) → propagate so caller can distinguish
      // from a plain invalid signature (which returns false without throwing).
      const name = err instanceof DOMException ? err.name : "unknown";
      throw new CryptoVerificationError(`crypto.verify failed: ${name} — ${err instanceof Error ? err.message : String(err)}`);
   }
}

/**
 * Exports a CryptoKey (public) to JWK for transmission over the signaling channel.
 * Only call this with the public key — the private key is non-extractable.
 */
export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

/**
 * Imports a JWK public key received from a peer over the signaling channel.
 * Validates algorithm to prevent algorithm confusion attacks.
 *
 * @throws DOMException if the JWK is malformed or algorithm mismatches.
 */
export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
    throw new Error(`ecdsaIdentity: unexpected key type kty=${jwk.kty} crv=${jwk.crv}`);
  }
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    ECDSA_PARAMS,
    true, // public key is exportable
    ["verify"],
  );
}

/**
 * Trust On First Use pinning for calls-v2 peer identity keys.
 * First seen identity public key for userId:deviceId is pinned in IndexedDB.
 * Any later fingerprint mismatch is rejected fail-closed as possible identity substitution.
 */
export async function assertPeerIdentityPinned(
  userId: string,
  deviceId: string,
  jwk: JsonWebKey,
): Promise<string> {
  if (!userId || !deviceId) {
    throw new Error("ecdsaIdentity: cannot pin peer identity without userId and deviceId");
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") {
    throw new Error(`ecdsaIdentity: cannot pin unexpected key type kty=${jwk.kty} crv=${jwk.crv}`);
  }

  const fingerprint = await fingerprintIdentityJwk(jwk);
  const key = `peer-identity:${userId}:${deviceId}`;
  const db = await openDb();
  try {
    const existing = await idbGet<TrustedPeerIdentityRecord>(db, key);
    if (!existing) {
      await idbPut<TrustedPeerIdentityRecord>(db, key, {
        userId,
        deviceId,
        fingerprint,
        pinnedAt: Date.now(),
      });
      return fingerprint;
    }

    if (!safeEqualHex(existing.fingerprint, fingerprint)) {
      throw new Error(
        `ecdsaIdentity: peer identity key changed for ${userId}:${deviceId} — TOFU pin mismatch`
      );
    }
    return fingerprint;
  } finally {
    db.close();
  }
}

/**
 * TOFU pinning for SFU key exchange peer signing keys.
 * Called from CallKeyExchange.registerPeerSigningKey() BEFORE accepting a peer's ECDSA
 * public key. First-seen fingerprint is pinned in IndexedDB; any mismatch is rejected
 * fail-closed as a possible identity substitution attack.
 *
 * @param peerId  composite userId:deviceId
 * @param rawKey  raw bytes of the peer's ECDSA P-256 public key
 */
export async function assertPeerSigningKeyPinned(
  peerId: string,
  rawKey: Uint8Array,
): Promise<string> {
  const parts = peerId.split(':');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`ecdsaIdentity: invalid peerId format "${peerId}" — expected userId:deviceId`);
  }
  const [userId, deviceId] = parts;

  // Reconstruct JWK from raw P-256 public key bytes
  if (rawKey.length !== 65 || rawKey[0] !== 0x04) {
    throw new Error(`ecdsaIdentity: expected uncompressed P-256 public key (65 bytes, 0x04 prefix), got ${rawKey.length} bytes`);
  }
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64(rawKey.slice(1, 33)),
    y: bytesToBase64(rawKey.slice(33, 65)),
  };
  return assertPeerIdentityPinned(userId, deviceId, jwk);
}
