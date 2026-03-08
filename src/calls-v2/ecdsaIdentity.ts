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

function idbGet(db: IDBDatabase, key: string): Promise<CryptoKeyPair | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as CryptoKeyPair | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: CryptoKeyPair): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
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
  const existing = await idbGet(db, KEY_ID);
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
 * Signs the tuple (userId, ephemeralPubKey) with the device identity private key.
 *
 * The signed data layout (deterministic, no hidden state):
 *   [ userId as UTF-8 bytes ] || [ 0x00 separator ] || [ ephemeralPubKey bytes ]
 *
 * Returns raw IEEE P1363 r||s (64 bytes for P-256).
 */
export async function signIdentity(
  privateKey: CryptoKey,
  userId: string,
  ephemeralPubKey: ArrayBuffer,
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const userIdBytes = encoder.encode(userId);
  // Deterministic data = userId_utf8 || 0x00 || ephemeralPubKey
  const data = new Uint8Array(userIdBytes.byteLength + 1 + ephemeralPubKey.byteLength);
  data.set(userIdBytes, 0);
  data[userIdBytes.byteLength] = 0x00;
  data.set(new Uint8Array(ephemeralPubKey), userIdBytes.byteLength + 1);
  return crypto.subtle.sign(SIGN_PARAMS, privateKey, data);
}

/**
 * Verifies an ECDSA signature over (userId, ephemeralPubKey).
 *
 * Returns false on any verification failure — never throws to the caller
 * to avoid timing-sensitive error propagation.
 */
export async function verifyIdentity(
  publicKey: CryptoKey,
  userId: string,
  ephemeralPubKey: ArrayBuffer,
  signature: ArrayBuffer,
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const userIdBytes = encoder.encode(userId);
    const data = new Uint8Array(userIdBytes.byteLength + 1 + ephemeralPubKey.byteLength);
    data.set(userIdBytes, 0);
    data[userIdBytes.byteLength] = 0x00;
    data.set(new Uint8Array(ephemeralPubKey), userIdBytes.byteLength + 1);
    return await crypto.subtle.verify(SIGN_PARAMS, publicKey, signature, data);
  } catch {
    return false;
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
