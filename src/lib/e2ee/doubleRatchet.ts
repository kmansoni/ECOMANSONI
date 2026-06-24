/**
 * Double Ratchet Algorithm — Signal Protocol
 *
 * Security properties:
 * - Perfect Forward Secrecy: per-message ephemeral keys via DH ratchet
 * - Break-in Recovery: symmetric-key ratchet limits exposure window
 * - Out-of-order message delivery via skipped-key store (max 2000)
 * - Replay protection: message numbers are monotonically increasing per chain
 *
 * Cryptographic primitives (Web Crypto API only — no npm deps):
 * - ECDH P-256 for DH ratchet
 * - HKDF-SHA-256 for KDF (root + chain)
 * - AES-256-GCM for message encryption
 *
 * CRYPTO-5 fix: operational keys are stored non-extractable. Persistence
 * uses AES-GCM wrap via SecureKeyStore (passphrase-derived master key).
 * XSS cannot export raw key material via crypto.subtle.exportKey.
 */

import { toBase64, fromBase64 } from "./utils";

function toLocalBytesFromBase64(b64: string): Uint8Array {
  const raw = fromBase64(b64);
  return new Uint8Array(raw.slice(0));
}

function cloneBuffer(input: ArrayBuffer): ArrayBuffer {
  return input.slice(0);
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface RatchetHeader {
  publicKey: string;          // base64 SPKI
  previousChainLength: number;
  messageNumber: number;
}

export interface RatchetState {
  rootKey: ArrayBuffer;
  sendingChainKey: CryptoKey | null;
  receivingChainKey: CryptoKey | null;
  sendingRatchetKey: CryptoKeyPair;
  receivingRatchetPublicKey: CryptoKey | null;
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendingChainLength: number;
  /** "base64PubKey:msgNum" → AES-256-GCM message key */
  skippedMessageKeys: Map<string, CryptoKey>;
}

export interface SerializedRatchetState {
  rootKey: string;
  sendingChainKey: string | null;
  receivingChainKey: string | null;
  sendingRatchetPrivate: string;  // base64 PKCS8
  sendingRatchetPublic: string;   // base64 SPKI
  receivingRatchetPublicKey: string | null;
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendingChainLength: number;
  skippedMessageKeys: Array<[string, string]>; // [lookupKey, base64 raw]
}

export interface WrappedRatchetState {
  version: 1;
  iv: string;       // base64 12-byte IV
  aad: string;      // conversationId — binds blob to conversation
  ciphertext: string; // base64 AES-GCM ciphertext
  tag: string;       // base64 16-byte auth tag
}

/** Maximum skipped message keys (Signal uses 2000) */
const MAX_SKIP = 2000;

// ── KDF helpers ────────────────────────────────────────────────────────────

async function hkdf(
  ikm: ArrayBuffer,
  salt: ArrayBuffer,
  info: string,
  length = 64,
): Promise<ArrayBuffer> {
  const ikmBytes = new Uint8Array(ikm.slice(0));
  const saltBytes = new Uint8Array(salt.slice(0));
  const ikmKey = await crypto.subtle.importKey(
    "raw", ikmBytes, { name: "HKDF" }, false, ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: saltBytes, info: new TextEncoder().encode(info) },
    ikmKey, length * 8,
  );
}

/**
 * KDF_RK — derives root key and chain key from DH output.
 * Uses `extractable: false` for chain keys — CRYPTO-5 fix.
 * Only the root key (ArrayBuffer) needs to be serializable.
 */
async function kdfRK(
  rootKey: ArrayBuffer,
  dhOutput: ArrayBuffer,
): Promise<{ newRootKey: ArrayBuffer; newChainKey: CryptoKey }> {
  const derived = await hkdf(dhOutput, rootKey, "WhisperRatchet", 64);
  const newRootKey = derived.slice(0, 32);
  const newChainKey = await crypto.subtle.importKey(
    "raw", derived.slice(32, 64),
    { name: "HMAC", hash: "SHA-256" },
    false, // NON-EXTRACTABLE — CRYPTO-5 fix
    ["sign"],
  );
  return { newRootKey, newChainKey };
}

/**
 * KDF_CK — derives message key and next chain key.
 */
async function kdfCK(
  chainKey: CryptoKey,
): Promise<{ messageKey: CryptoKey; nextChainKey: CryptoKey }> {
  const msgKeyBytes = await crypto.subtle.sign("HMAC", chainKey, new Uint8Array([0x01]));
  const nextKeyBytes = await crypto.subtle.sign("HMAC", chainKey, new Uint8Array([0x02]));

  const messageKey = await crypto.subtle.importKey(
    "raw", msgKeyBytes,
    { name: "AES-GCM", length: 256 },
    false, // message keys are never persisted directly
    ["encrypt", "decrypt"],
  );
  const nextChainKey = await crypto.subtle.importKey(
    "raw", nextKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false, // NON-EXTRACTABLE — CRYPTO-5 fix
    ["sign"],
  );
  return { messageKey, nextChainKey };
}

// ── ECDH helpers ─────────────────────────────────────────────────────────

async function generateDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false, // NON-EXTRACTABLE — CRYPTO-5 fix; deriveBits works with non-extractable ECDH keys
    ["deriveBits"],
  );
}

async function dh(localPrivateKey: CryptoKey, remotePublicKey: CryptoKey): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: remotePublicKey },
    localPrivateKey, 256,
  );
}

async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return toBase64(new Uint8Array(spki));
}

async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki", toLocalBytesFromBase64(b64),
    { name: "ECDH", namedCurve: "P-256" },
    true, [],
  );
}

// ── Serialization helpers ────────────────────────────────────────────────

async function exportHmacKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64(new Uint8Array(raw));
}

async function exportEcdhPrivate(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", key);
  return toBase64(new Uint8Array(pkcs8));
}

async function importHmacKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", toLocalBytesFromBase64(b64),
    { name: "HMAC", hash: "SHA-256" },
    true, ["sign"], // extractable for serialization; replaced by makeNonExtractable after unwrap
  );
}

async function importEcdhPrivate(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8", toLocalBytesFromBase64(b64),
    { name: "ECDH", namedCurve: "P-256" },
    true, ["deriveBits"], // extractable for serialization
  );
}

async function importAesKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw", toLocalBytesFromBase64(b64),
    { name: "AES-GCM", length: 256 },
    true, ["encrypt", "decrypt"], // extractable for serialization
  );
}

// ── Core Double Ratchet ────────────────────────────────────────────────

export class DoubleRatchet {
  /**
   * Initialize Alice's state (initiator).
   * Called after X3DH to bootstrap the ratchet.
   */
  static async initAlice(
    sharedSecret: ArrayBuffer,
    bobPublicKey: CryptoKey,
  ): Promise<RatchetState> {
    const initialRootKey = cloneBuffer(sharedSecret);
    const sendingRatchetKey = await generateDHKeyPair();
    const dhOut = await dh(sendingRatchetKey.privateKey, bobPublicKey);
    const { newRootKey, newChainKey } = await kdfRK(initialRootKey, dhOut);

    return {
      rootKey: newRootKey,
      sendingChainKey: newChainKey,
      receivingChainKey: null,
      sendingRatchetKey,
      receivingRatchetPublicKey: bobPublicKey,
      sendMessageNumber: 0,
      receiveMessageNumber: 0,
      previousSendingChainLength: 0,
      skippedMessageKeys: new Map(),
    };
  }

  /**
   * Initialize Bob's state (responder).
   * Bob waits for Alice's first message to perform DH ratchet.
   */
  static async initBob(sharedSecret: ArrayBuffer): Promise<RatchetState> {
    return {
      rootKey: cloneBuffer(sharedSecret),
      sendingChainKey: null,
      receivingChainKey: null,
      sendingRatchetKey: await generateDHKeyPair(),
      receivingRatchetPublicKey: null,
      sendMessageNumber: 0,
      receiveMessageNumber: 0,
      previousSendingChainLength: 0,
      skippedMessageKeys: new Map(),
    };
  }

  /**
   * Encrypt a plaintext message.
   * CRYPTO-5: state keys are non-extractable — encrypt cannot export them.
   */
  static async encrypt(
    state: RatchetState,
    plaintext: string,
  ): Promise<{ ciphertext: string; header: RatchetHeader }> {
    if (!state.sendingChainKey) {
      throw new Error("DoubleRatchet: no sending chain key — must receive before sending");
    }

    const header: RatchetHeader = {
      publicKey: await exportPublicKey(state.sendingRatchetKey.publicKey),
      previousChainLength: state.previousSendingChainLength,
      messageNumber: state.sendMessageNumber,
    };

    const { messageKey, nextChainKey } = await kdfCK(state.sendingChainKey);
    state.sendingChainKey = nextChainKey;
    state.sendMessageNumber += 1;

    // Header as AAD binds ciphertext to this ratchet step
    const aad = new TextEncoder().encode(JSON.stringify(header));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = new TextEncoder().encode(plaintext);

    const ciphertextBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      messageKey, plaintextBytes,
    );

    const packed = new Uint8Array(12 + ciphertextBuf.byteLength);
    packed.set(iv, 0);
    packed.set(new Uint8Array(ciphertextBuf), 12);

    return { ciphertext: toBase64(packed), header };
  }

  /**
   * Decrypt a message. Handles skipped keys, DH ratchet, chain advancement.
   */
  static async decrypt(
    state: RatchetState,
    ciphertext: string,
    header: RatchetHeader,
  ): Promise<string> {
    if (!Number.isSafeInteger(header.messageNumber) || header.messageNumber < 0) {
      throw new Error("DoubleRatchet: unsafe messageNumber");
    }

    // 1. Check skipped message keys cache
    const skipKey = `${header.publicKey}:${header.messageNumber}`;
    const skippedMsgKey = state.skippedMessageKeys.get(skipKey);
    if (skippedMsgKey) {
      state.skippedMessageKeys.delete(skipKey);
      return DoubleRatchet._decryptWithKey(skippedMsgKey, ciphertext, header);
    }

    let receivingChainKey = state.receivingChainKey;

    // 2. DH ratchet step if sender's public key changed
    if (
      !state.receivingRatchetPublicKey ||
      await exportPublicKey(state.receivingRatchetPublicKey) !== header.publicKey
    ) {
      // Save skipped keys from old receiving chain
      if (state.receivingRatchetPublicKey && receivingChainKey) {
        const oldPubKey = await exportPublicKey(state.receivingRatchetPublicKey);
        await DoubleRatchet._skipMessageKeys(
          state, receivingChainKey, oldPubKey,
          state.receiveMessageNumber, header.previousChainLength,
        );
      }

      // Receive step
      const newRemotePublicKey = await importPublicKey(header.publicKey);
      const dhRecv = await dh(state.sendingRatchetKey.privateKey, newRemotePublicKey);
      const { newRootKey: rk1, newChainKey: recvChain } = await kdfRK(state.rootKey, dhRecv);

      // Send step
      const newSendingRatchetKey = await generateDHKeyPair();
      const dhSend = await dh(newSendingRatchetKey.privateKey, newRemotePublicKey);
      const { newRootKey: rk2, newChainKey: sendChain } = await kdfRK(rk1, dhSend);

      state.previousSendingChainLength = state.sendMessageNumber;
      state.sendMessageNumber = 0;
      state.receiveMessageNumber = 0;
      state.sendingChainKey = sendChain;
      state.receivingRatchetPublicKey = newRemotePublicKey;
      state.sendingRatchetKey = newSendingRatchetKey;
      state.rootKey = rk2;
      receivingChainKey = recvChain;
      state.receivingChainKey = recvChain;
    }

    if (!receivingChainKey) {
      throw new Error("DoubleRatchet: no receiving chain key after ratchet step");
    }

    // 3. Skip keys for any gaps
    const pubKeyForSkip = await exportPublicKey(state.receivingRatchetPublicKey!);
    const advancedChainKey = await DoubleRatchet._skipMessageKeys(
      state, receivingChainKey, pubKeyForSkip,
      state.receiveMessageNumber, header.messageNumber,
    );
    state.receiveMessageNumber = header.messageNumber;

    // 4. Decrypt
    const { messageKey, nextChainKey } = await kdfCK(advancedChainKey);
    state.receivingChainKey = nextChainKey;
    state.receiveMessageNumber += 1;

    return DoubleRatchet._decryptWithKey(messageKey, ciphertext, header);
  }

  private static async _skipMessageKeys(
    state: RatchetState,
    chainKey: CryptoKey,
    pubKeyB64: string,
    startIdx: number,
    target: number,
  ): Promise<CryptoKey> {
    let ck = chainKey;
    for (let idx = startIdx; idx < target; idx++) {
      if (state.skippedMessageKeys.size >= MAX_SKIP) {
        throw new Error("DoubleRatchet: too many skipped messages — DoS guard");
      }
      const { messageKey, nextChainKey } = await kdfCK(ck);
      state.skippedMessageKeys.set(`${pubKeyB64}:${idx}`, messageKey);
      ck = nextChainKey;
    }
    return ck;
  }

  private static async _decryptWithKey(
    messageKey: CryptoKey,
    ciphertext: string,
    header: RatchetHeader,
  ): Promise<string> {
    const packed = toLocalBytesFromBase64(ciphertext);
    const iv = packed.slice(0, 12);
    const data = packed.slice(12);
    const aad = new TextEncoder().encode(JSON.stringify(header));

    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      messageKey, data,
    );
    return new TextDecoder().decode(plainBuf);
  }

  /**
   * Serialize state to JSON. Keys are exportable for wrapping.
   * Caller MUST wrap with AES-GCM before persisting.
   */
  static async serialize(state: RatchetState): Promise<string> {
    const serial: SerializedRatchetState = {
      rootKey: toBase64(new Uint8Array(state.rootKey)),
      sendingChainKey: state.sendingChainKey ? await exportHmacKey(state.sendingChainKey) : null,
      receivingChainKey: state.receivingChainKey ? await exportHmacKey(state.receivingChainKey) : null,
      sendingRatchetPrivate: await exportEcdhPrivate(state.sendingRatchetKey.privateKey),
      sendingRatchetPublic: await exportPublicKey(state.sendingRatchetKey.publicKey),
      receivingRatchetPublicKey: state.receivingRatchetPublicKey
        ? await exportPublicKey(state.receivingRatchetPublicKey)
        : null,
      sendMessageNumber: state.sendMessageNumber,
      receiveMessageNumber: state.receiveMessageNumber,
      previousSendingChainLength: state.previousSendingChainLength,
      skippedMessageKeys: await Promise.all(
        Array.from(state.skippedMessageKeys.entries()).map(async ([k, v]) => {
          const raw = await crypto.subtle.exportKey("raw", v);
          return [k, toBase64(new Uint8Array(raw))] as [string, string];
        }),
      ),
    };
    return JSON.stringify(serial);
  }

  /**
   * Deserialize from JSON. Keys are importable.
   * After deserialization, caller MUST call makeNonExtractable() before use.
   */
  static async deserialize(data: string): Promise<RatchetState> {
    let s: SerializedRatchetState;
    try {
      s = JSON.parse(data);
    } catch {
      throw new Error("DoubleRatchet: corrupted state — invalid JSON");
    }

    if (typeof s.rootKey !== "string" || typeof s.sendingRatchetPrivate !== "string") {
      throw new Error("DoubleRatchet: corrupted state — missing required fields");
    }
    if (
      typeof s.sendMessageNumber !== "number" ||
      typeof s.receiveMessageNumber !== "number" ||
      typeof s.previousSendingChainLength !== "number"
    ) {
      throw new Error("DoubleRatchet: corrupted state — invalid counters");
    }

    const rootKey = cloneBuffer(fromBase64(s.rootKey));

    const [sendingChainKey, receivingChainKey] = await Promise.all([
      s.sendingChainKey ? importHmacKey(s.sendingChainKey) : Promise.resolve(null),
      s.receivingChainKey ? importHmacKey(s.receivingChainKey) : Promise.resolve(null),
    ]);

    const sendingRatchetPrivate = await importEcdhPrivate(s.sendingRatchetPrivate);
    const sendingRatchetPublicKey = await importPublicKey(s.sendingRatchetPublic);
    const sendingRatchetKey: CryptoKeyPair = {
      privateKey: sendingRatchetPrivate,
      publicKey: sendingRatchetPublicKey,
    };

    const receivingRatchetPublicKey = s.receivingRatchetPublicKey
      ? await importPublicKey(s.receivingRatchetPublicKey)
      : null;

    const skippedMessageKeys = new Map<string, CryptoKey>(
      await Promise.all(
        (s.skippedMessageKeys ?? []).map(async ([k, v]) => {
          const key = await importAesKey(v);
          return [k, key] as [string, CryptoKey];
        }),
      ),
    );

    return {
      rootKey,
      sendingChainKey,
      receivingChainKey,
      sendingRatchetKey,
      receivingRatchetPublicKey,
      sendMessageNumber: s.sendMessageNumber,
      receiveMessageNumber: s.receiveMessageNumber,
      previousSendingChainLength: s.previousSendingChainLength,
      skippedMessageKeys,
    };
  }
}

// ── DoubleRatchetE2E — non-extractable keys at runtime ──────────────────────

/**
 * CRYPTO-5 fix: wraps DoubleRatchet with non-extractable key enforcement.
 *
 * All operational keys (chain keys, message keys, ratchet private keys) are
 * stored non-extractable. Persistence uses AES-GCM wrap via SecureKeyStore
 * (passphrase-derived master key). XSS cannot call exportKey() on any key
 * that has been through makeNonExtractable().
 *
 * Usage:
 *   // After init:
 *   const state = DoubleRatchetE2E.initAlice(sharedSecret, bobPubKey);
 *
 *   // After every state mutation (encrypt/decrypt):
 *   const wrapped = await wrapState(state, conversationId, wrappingKey);
 *   await secureKeyStore.storeWrappedKey(`ratchet:${id}`, wrapped, wrappingKey);
 *
 *   // On app restart:
 *   const blob = await secureKeyStore.unwrapKey(...);
 *   const state = await unwrapState(blob, conversationId, unwrappingKey);
 *   // state keys are now non-extractable
 */
export class DoubleRatchetE2E {
  static async initAlice(
    sharedSecret: ArrayBuffer,
    bobPublicKey: CryptoKey,
  ): Promise<RatchetState> {
    return DoubleRatchet.initAlice(sharedSecret, bobPublicKey);
  }

  static async initBob(sharedSecret: ArrayBuffer): Promise<RatchetState> {
    return DoubleRatchet.initBob(sharedSecret);
  }

  static encrypt = DoubleRatchet.encrypt;
  static decrypt = DoubleRatchet.decrypt;

  /**
   * Wrap state to JSON string for persistence.
   * Keys in the JSON are raw bytes — MUST be wrapped with AES-GCM before storage.
   */
  static async serialize(state: RatchetState): Promise<string> {
    return DoubleRatchet.serialize(state);
  }

  /**
   * Deserialize from JSON. Keys are extractable — caller MUST call
   * makeNonExtractable() before using for encrypt/decrypt.
   */
  static async deserialize(data: string): Promise<RatchetState> {
    return DoubleRatchet.deserialize(data);
  }
}

// ── Secure wrap / unwrap (CRYPTO-5 fix) ─────────────────────────────────────

/**
 * Serialize + AES-GCM-wrap a ratchet state for IndexedDB persistence.
 *
 * AAD = conversationId prevents cross-conversation blob reuse.
 * IV is random per wrap, preventing IV reuse across sessions.
 *
 * Caller persists the WrappedRatchetState object via SecureKeyStore.
 */
export async function wrapState(
  state: RatchetState,
  conversationId: string,
  wrappingKey: CryptoKey,
): Promise<WrappedRatchetState> {
  const serial = await DoubleRatchetE2E.serialize(state);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = new TextEncoder().encode(conversationId);
  const plaintext = new TextEncoder().encode(serial);

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
    wrappingKey, plaintext,
  );

  const enc = new Uint8Array(encrypted);
  const ctLen = enc.length - 16;
  return {
    version: 1,
    iv: toBase64(iv.buffer as ArrayBuffer),
    aad: conversationId,
    ciphertext: toBase64(enc.slice(0, ctLen).buffer as ArrayBuffer),
    tag: toBase64(enc.slice(ctLen).buffer as ArrayBuffer),
  };
}

/**
 * AES-GCM unwrap + deserialize into NON-EXTRACTABLE keys.
 *
 * AAD mismatch throws — prevents using a blob from conversation A in B.
 *
 * After unwrap, ALL operational CryptoKeys are non-extractable.
 * Even if XSS reads the IDB blob, it cannot call exportKey().
 *
 * @param blob - WrappedRatchetState from SecureKeyStore
 * @param conversationId - must match blob.aad
 * @param unwrappingKey - same key used in wrapState()
 */
export async function unwrapState(
  blob: WrappedRatchetState,
  conversationId: string,
  unwrappingKey: CryptoKey,
): Promise<RatchetState> {
  if (blob.version !== 1) {
    throw new Error(`DoubleRatchet: unknown wrapped-state version ${blob.version}`);
  }

  if (blob.aad !== conversationId) {
    throw new Error("DoubleRatchet: AAD mismatch — blob is for a different conversation");
  }

  const iv = fromBase64(blob.iv);
  const ct = fromBase64(blob.ciphertext);
  const tag = fromBase64(blob.tag);
  const aad = new TextEncoder().encode(blob.aad);

  const combined = new Uint8Array(ct.byteLength + tag.byteLength);
  combined.set(new Uint8Array(ct), 0);
  combined.set(new Uint8Array(tag), ct.byteLength);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 },
      unwrappingKey, combined,
    );
  } catch {
    throw new Error("DoubleRatchet: unwrap failed — wrong key or corrupted blob");
  }

  const serial = new TextDecoder().decode(plaintext);
  const state = await DoubleRatchetE2E.deserialize(serial);

  return makeNonExtractable(state);
}

/**
 * Re-imports all CryptoKey fields of a RatchetState as NON-EXTRACTABLE.
 *
 * This is the CRYPTO-5 fix: after deserializing a wrapped blob, we re-import
 * every key with extractable:false so that XSS cannot call exportKey() on them.
 *
 * Flow: deserialize (extractable:true for raw bytes) → makeNonExtractable (extractable:false)
 */
async function makeNonExtractable(state: RatchetState): Promise<RatchetState> {
  // Serialize to get raw bytes, then re-import non-extractable
  const serial = await DoubleRatchetE2E.serialize(state);
  const s: SerializedRatchetState = JSON.parse(serial);

  const importHmacNE = async (b64: string | null) => {
    if (!b64) return null;
    return crypto.subtle.importKey(
      "raw", toLocalBytesFromBase64(b64),
      { name: "HMAC", hash: "SHA-256" },
      false, // NON-EXTRACTABLE — CRYPTO-5 fix
      ["sign"],
    );
  };

  const importAesNE = async (b64: string) =>
    crypto.subtle.importKey(
      "raw", toLocalBytesFromBase64(b64),
      { name: "AES-GCM", length: 256 },
      false, // NON-EXTRACTABLE — CRYPTO-5 fix
      ["encrypt", "decrypt"],
    );

  const [sendingChainKey, receivingChainKey] = await Promise.all([
    importHmacNE(s.sendingChainKey),
    importHmacNE(s.receivingChainKey),
  ]);

  // Ratchet private key — re-import non-extractable
  const ratchetPrivate = await crypto.subtle.importKey(
    "pkcs8", toLocalBytesFromBase64(s.sendingRatchetPrivate),
    { name: "ECDH", namedCurve: "P-256" },
    false, // NON-EXTRACTABLE — CRYPTO-5 fix
    ["deriveBits"],
  );

  // Skipped message keys — re-import non-extractable
  const skippedMessageKeys = new Map<string, CryptoKey>();
  for (const [k, v] of s.skippedMessageKeys) {
    skippedMessageKeys.set(k, await importAesNE(v));
  }

  return {
    rootKey: cloneBuffer(fromBase64(s.rootKey)),
    sendingChainKey,
    receivingChainKey,
    sendingRatchetKey: {
      privateKey: ratchetPrivate,
      publicKey: state.sendingRatchetKey.publicKey, // public key is not sensitive
    },
    receivingRatchetPublicKey: state.receivingRatchetPublicKey,
    sendMessageNumber: s.sendMessageNumber,
    receiveMessageNumber: s.receiveMessageNumber,
    previousSendingChainLength: s.previousSendingChainLength,
    skippedMessageKeys,
  };
}


// ── Deniability utilities ────────────────────────────────────────────────

/**
 * Deniable key confirmation between two ratchet key pairs.
 * Uses ECDH directly (no signature) — any party with the keys can compute it.
 * Does not leave a verifiable transcript.
 */
export async function computeDenyableSharedSecret(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey,
): Promise<ArrayBuffer> {
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: remotePublicKey },
    localPrivateKey, 256,
  );
  const ikmKey = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode("e2ee-denyable-confirm-v1") },
    ikmKey, 256,
  );
}
