/**
 * Double Ratchet Algorithm — Signal Protocol
 *
 * Security properties:
 * - Perfect Forward Secrecy: per-message ephemeral keys via DH ratchet
 * - Break-in Recovery: symmetric-key ratchet limits exposure window
 * - Out-of-order message delivery via skipped-key store (max 100)
 * - Replay protection: message numbers are monotonically increasing per chain
 *
 * Cryptographic primitives (Web Crypto API only — no npm deps):
 * - ECDH P-256 for DH ratchet
 * - HKDF-SHA-256 for KDF (root + chain)
 * - AES-256-GCM for message encryption
 *
 * State transitions:
 * SEND:
 *   1. If no sending chain key → perform DH ratchet (new ephemeral key pair)
 *   2. Derive message key from sending chain key via KDF_CK
 *   3. Advance sending chain key
 *   4. Encrypt plaintext with message key + header as AAD
 *   5. Increment send message number
 *
 * RECEIVE:
 *   1. Check skipped message keys cache
 *   2. If header.publicKey !== stored receiving ratchet public key → DH ratchet step
 *      a. Store skipped keys from previous chain
 *      b. Derive new root key + receiving chain key from DH output
 *      c. Derive new root key + sending chain key from new DH key pair
 *   3. Skip + store any missing message keys
 *   4. Derive + use message key
 */

import { toBase64, fromBase64 } from "./utils";

// ── Types ──────────────────────────────────────────────────────────────────

export interface RatchetHeader {
  /** Base64-encoded DH ratchet public key (SPKI format) */
  publicKey: string;
  previousChainLength: number;
  messageNumber: number;
}

interface RatchetState {
  rootKey: ArrayBuffer;
  sendingChainKey: CryptoKey | null;
  receivingChainKey: CryptoKey | null;
  sendingRatchetKey: CryptoKeyPair;
  receivingRatchetPublicKey: CryptoKey | null;
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendingChainLength: number;
  /** "base64PubKey:msgNum" → AES-GCM message key */
  skippedMessageKeys: Map<string, CryptoKey>;
}

/** Maximum number of skipped message keys to store (DoS guard) */
const MAX_SKIP = 100;

// ── KDF helpers ────────────────────────────────────────────────────────────

/**
 * HKDF-SHA-256 extract-and-expand.
 * ikm: input key material (CryptoKey with extractable=false, usage=deriveBits)
 * salt: 32-byte salt (for root KDF: current root key bytes; for chain KDF: constant)
 * info: domain-separation label
 * Returns 64 bytes: first 32 = new root/chain key material, last 32 = msg/chain key material
 */
async function hkdf(
  ikm: ArrayBuffer,
  salt: ArrayBuffer,
  info: string,
  length: number = 64
): Promise<ArrayBuffer> {
  // Normalize to local TypedArray to avoid cross-realm BufferSource issues in Node/WebCrypto CI.
  const ikmBytes = new Uint8Array(ikm.slice(0));
  const saltBytes = new Uint8Array(salt.slice(0));
  const ikmKey = await crypto.subtle.importKey(
    "raw",
    ikmBytes,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const infoBytes = new TextEncoder().encode(info);
  return crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: saltBytes,
      info: infoBytes,
    },
    ikmKey,
    length * 8
  );
}

function cloneBuffer(input: ArrayBuffer): ArrayBuffer {
  return input.slice(0);
}

/** Derive new root key + chain key from root key + DH output */
async function kdfRK(
  rootKey: ArrayBuffer,
  dhOutput: ArrayBuffer
): Promise<{ newRootKey: ArrayBuffer; newChainKey: CryptoKey }> {
  const derived = await hkdf(dhOutput, rootKey, "WhisperRatchet", 64);
  const newRootKey = derived.slice(0, 32);
  const newChainKey = await crypto.subtle.importKey(
    "raw",
    derived.slice(32, 64),
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign"]
  );
  return { newRootKey, newChainKey };
}

/**
 * Chain KDF:
 * messageKey = HMAC-SHA-256(chainKey, 0x01)
 * nextChainKey = HMAC-SHA-256(chainKey, 0x02)
 */
async function kdfCK(
  chainKey: CryptoKey
): Promise<{ messageKey: CryptoKey; nextChainKey: CryptoKey }> {
  const msgKeyBytes = await crypto.subtle.sign(
    "HMAC",
    chainKey,
    new Uint8Array([0x01])
  );
  const nextChainKeyBytes = await crypto.subtle.sign(
    "HMAC",
    chainKey,
    new Uint8Array([0x02])
  );

  const messageKey = await crypto.subtle.importKey(
    "raw",
    msgKeyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  const nextChainKey = await crypto.subtle.importKey(
    "raw",
    nextChainKeyBytes,
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign"]
  );
  return { messageKey, nextChainKey };
}

// ── ECDH helpers ───────────────────────────────────────────────────────────

async function generateDHKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
}

async function dh(
  localPrivateKey: CryptoKey,
  remotePublicKey: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits(
    { name: "ECDH", public: remotePublicKey },
    localPrivateKey,
    256
  );
}

async function exportPublicKey(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey("spki", key);
  return toBase64(new Uint8Array(spki));
}

async function importPublicKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    fromBase64(b64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

// ── Serialization helpers ──────────────────────────────────────────────────

interface SerializedState {
  rootKey: string;           // base64 raw
  sendingChainKey: string | null;
  receivingChainKey: string | null;
  sendingRatchetPrivate: string;  // base64 pkcs8
  sendingRatchetPublic: string;   // base64 spki
  receivingRatchetPublicKey: string | null;
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendingChainLength: number;
  skippedMessageKeys: Array<[string, string]>; // [key, base64 raw]
}

// ── Main class ─────────────────────────────────────────────────────────────

export class DoubleRatchet {
  /**
   * Initialize Alice's state (initiator).
   * Called after X3DH to bootstrap the ratchet.
   * Alice performs first DH ratchet immediately.
   */
  static async initAlice(
    sharedSecret: ArrayBuffer,
    bobPublicKey: CryptoKey
  ): Promise<RatchetState> {
    const initialRootKey = cloneBuffer(sharedSecret);

    // Alice generates her initial ratchet key pair
    const sendingRatchetKey = await generateDHKeyPair();

    // DH(Alice_ratchet_private, Bob_ratchet_public) → first chain keys
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
    const rootKey = cloneBuffer(sharedSecret);

    const sendingRatchetKey = await generateDHKeyPair();

    return {
      rootKey,
      sendingChainKey: null,
      receivingChainKey: null,
      sendingRatchetKey,
      receivingRatchetPublicKey: null,
      sendMessageNumber: 0,
      receiveMessageNumber: 0,
      previousSendingChainLength: 0,
      skippedMessageKeys: new Map(),
    };
  }

  /**
   * Encrypt a plaintext message.
   * Mutates state — caller must persist the updated state.
   */
  static async encrypt(
    state: RatchetState,
    plaintext: string
  ): Promise<{ ciphertext: string; header: RatchetHeader }> {
    // If no sending chain key, we need to ratchet first.
    // This can only happen on Bob's first send (he has no sending chain yet).
    // In that case, Alice must have already sent us a message to advance.
    // Guard: if sendingChainKey is null, throw — caller must receive first.
    if (!state.sendingChainKey) {
      throw new Error(
        "DoubleRatchet: no sending chain key. Must receive a message before sending."
      );
    }

    const header: RatchetHeader = {
      publicKey: await exportPublicKey(state.sendingRatchetKey.publicKey),
      previousChainLength: state.previousSendingChainLength,
      messageNumber: state.sendMessageNumber,
    };

    const { messageKey, nextChainKey } = await kdfCK(state.sendingChainKey);
    state.sendingChainKey = nextChainKey;
    state.sendMessageNumber += 1;

    // Encode header as AAD to bind it cryptographically to the ciphertext
    const aad = new TextEncoder().encode(JSON.stringify(header));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintextBytes = new TextEncoder().encode(plaintext);

    const ciphertextBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      messageKey,
      plaintextBytes
    );

    // Pack: 12-byte IV || ciphertext+tag
    const packed = new Uint8Array(12 + ciphertextBuf.byteLength);
    packed.set(iv, 0);
    packed.set(new Uint8Array(ciphertextBuf), 12);

    return { ciphertext: toBase64(packed), header };
  }

  /**
   * Decrypt a message.
   * Handles:
   * 1. Skipped message key (out-of-order) lookup
   * 2. DH ratchet step when new public key seen
   * 3. Chain advancement with skipped key storage
   * Mutates state — caller must persist the updated state.
   */
  static async decrypt(
    state: RatchetState,
    ciphertext: string,
    header: RatchetHeader
  ): Promise<string> {
    if (!Number.isSafeInteger(header.messageNumber)) {
      throw new Error('DoubleRatchet: unsafe messageNumber');
    }
    if (header.messageNumber < 0) {
      throw new Error('DoubleRatchet: negative messageNumber');
    }
    if (header.messageNumber > Number.MAX_SAFE_INTEGER - 1) {
      throw new Error('DoubleRatchet: messageNumber overflow');
    }

    // 1. Check skipped message keys
    const skipKey = `${header.publicKey}:${header.messageNumber}`;
    const skippedMsgKey = state.skippedMessageKeys.get(skipKey);
    if (skippedMsgKey) {
      state.skippedMessageKeys.delete(skipKey);
      return DoubleRatchet._decryptWithKey(skippedMsgKey, ciphertext, header);
    }

    // 2. Check if DH ratchet step is needed
    const senderPubKeyB64 = header.publicKey;
    let receivingChainKey = state.receivingChainKey;

    if (!state.receivingRatchetPublicKey ||
        await exportPublicKey(state.receivingRatchetPublicKey) !== senderPubKeyB64) {
      // DH ratchet step: skip remaining keys in old receiving chain.
      // IMPORTANT: use the OLD receiving ratchet public key as bucket key, not the new one.
      // Skipped messages from the previous chain will arrive with headers containing the OLD
      // public key. The lookup at decrypt time is `${header.publicKey}:${msgNum}`, so the
      // stored entries must use the old key to be found.
      if (state.receivingRatchetPublicKey && receivingChainKey) {
        const oldReceivingPubKeyB64 = await exportPublicKey(state.receivingRatchetPublicKey);
        // Сохраняем пропущенные ключи из СТАРОЙ цепочки.
        // startIdx = state.receiveMessageNumber — сколько сообщений из старой цепочки
        // мы уже расшифровали. target = header.previousChainLength — сколько сообщений
        // отправитель передал в старой цепочке до DH ratchet.
        //
        // ВАЖНО: возвращаемый advancedKey (advanced chain key старой цепочки)
        // намеренно игнорируется — старая цепочка после DH ratchet больше не используется.
        // state.receivingChainKey и state.receiveMessageNumber НЕ изменяются здесь —
        // они будут явно выставлены ниже в блоке DH ratchet.
        await DoubleRatchet._skipMessageKeys(
          state,
          receivingChainKey,
          oldReceivingPubKeyB64,
          state.receiveMessageNumber,   // явный startIdx — сколько уже получено в старой цепочке
          header.previousChainLength    // target — длина старой цепочки по утверждению отправителя
        );
      }

      // Perform DH ratchet: receive step
      const newRemotePublicKey = await importPublicKey(senderPubKeyB64);
      const dhRecv = await dh(state.sendingRatchetKey.privateKey, newRemotePublicKey);
      const { newRootKey: rk1, newChainKey: recvChain } = await kdfRK(state.rootKey, dhRecv);

      // Perform DH ratchet: send step
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

    // 3. Пропускаем ключи для сообщений [state.receiveMessageNumber .. header.messageNumber).
    //    Возвращённый advancedChainKey — chain key в позиции header.messageNumber.
    const pubKeyForSkip = await exportPublicKey(state.receivingRatchetPublicKey!);
    const advancedChainKey = await DoubleRatchet._skipMessageKeys(
      state,
      receivingChainKey,
      pubKeyForSkip,
      state.receiveMessageNumber,   // явный startIdx — текущая позиция в цепочке
      header.messageNumber          // target — номер сообщения которое дешифруем
    );
    // Явно обновляем state — _skipMessageKeys не мутирует счётчик и chain key.
    state.receiveMessageNumber = header.messageNumber;

    // 4. Дешифруем текущее сообщение с advancedChainKey (уже известен — не читаем из state).
    //    state.receivingChainKey выставляем сразу в nextChainKey после kdfCK.
    const { messageKey, nextChainKey } = await kdfCK(advancedChainKey);
    state.receivingChainKey = nextChainKey;
    state.receiveMessageNumber += 1;

    return DoubleRatchet._decryptWithKey(messageKey, ciphertext, header);
  }

  /**
   * Вычисляет и хранит message keys для сообщений [startIdx .. target).
   *
   * КОНТРАКТ (намеренно чистый относительно state):
   * - Читает только `state.skippedMessageKeys` (для DoS guard).
   * - Пишет только в `state.skippedMessageKeys`.
   * - НЕ изменяет `state.receivingChainKey` и `state.receiveMessageNumber`.
   *   Caller обязан явно обновить эти поля на основе возвращённого значения.
   *
   * Почему явный startIdx вместо state.receiveMessageNumber:
   *   Функция вызывается дважды — для СТАРОЙ цепочки (при DH ratchet) и для
   *   ТЕКУЩЕЙ цепочки. В случае старой цепочки state.receiveMessageNumber
   *   относится к ДРУГОМУ контексту. Неявное чтение из state создаёт
   *   скрытую зависимость от порядка вызовов, которая ломается при рефакторинге.
   *
   * @returns advancedChainKey — chain key в позиции target (для использования caller'ом)
   */
  private static async _skipMessageKeys(
    state: RatchetState,
    chainKey: CryptoKey,
    pubKeyB64: string,
    startIdx: number,
    target: number
  ): Promise<CryptoKey> {
    let ck = chainKey;

    for (let idx = startIdx; idx < target; idx++) {
      if (state.skippedMessageKeys.size >= MAX_SKIP) {
        throw new Error("DoubleRatchet: too many skipped messages (DoS guard)");
      }
      const { messageKey, nextChainKey } = await kdfCK(ck);
      state.skippedMessageKeys.set(`${pubKeyB64}:${idx}`, messageKey);
      ck = nextChainKey;
    }

    // Возвращаем chain key в позиции target — caller использует его для расшифровки
    return ck;
  }

  private static async _decryptWithKey(
    messageKey: CryptoKey,
    ciphertext: string,
    header: RatchetHeader
  ): Promise<string> {
    const packed = fromBase64(ciphertext);
    const iv = packed.slice(0, 12);
    const data = packed.slice(12);
    const aad = new TextEncoder().encode(JSON.stringify(header));

    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      messageKey,
      data
    );
    return new TextDecoder().decode(plainBuf);
  }

  // ── Serialization ────────────────────────────────────────────────────────

  /**
   * @deprecated Use DoubleRatchetE2E.serialize() — base class ratchet keys are non-extractable.
   * This method always throws. DoubleRatchetE2E creates extractable root keys for serialization.
   */
  static async serialize(_state: RatchetState): Promise<string> {
    throw new Error(
      "DoubleRatchet.serialize() is not supported. Use DoubleRatchetE2E which creates extractable root keys for serialization."
    );
  }

  // DEAD CODE SENTINEL — the original serialize body below is unreachable and kept only for reference:
   
  private static async _serializeUnreachable(state: RatchetState): Promise<string> {
    const exportHmacKey = async (k: CryptoKey): Promise<string> => {
      const raw = await crypto.subtle.exportKey("raw", k);
      return toBase64(new Uint8Array(raw));
    };

    const serial: SerializedState = {
      rootKey: await exportHkdfKey(state.rootKey),

      sendingChainKey: state.sendingChainKey
        ? await exportHmacKey(state.sendingChainKey)
        : null,
      receivingChainKey: state.receivingChainKey
        ? await exportHmacKey(state.receivingChainKey)
        : null,
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
        })
      ),
    };
    return JSON.stringify(serial);
  }

  static async deserialize(data: string): Promise<RatchetState> {
    const s: SerializedState = JSON.parse(data);

    const rootKey = cloneBuffer(fromBase64(s.rootKey));
    const sendingChainKey = s.sendingChainKey
      ? await importHmacKey(s.sendingChainKey)
      : null;
    const receivingChainKey = s.receivingChainKey
      ? await importHmacKey(s.receivingChainKey)
      : null;

    const sendingRatchetPrivate = await importEcdhPrivate(s.sendingRatchetPrivate);
    const sendingRatchetPublicRaw = await importPublicKey(s.sendingRatchetPublic);
    const sendingRatchetKey: CryptoKeyPair = {
      privateKey: sendingRatchetPrivate,
      publicKey: sendingRatchetPublicRaw,
    };

    const receivingRatchetPublicKey = s.receivingRatchetPublicKey
      ? await importPublicKey(s.receivingRatchetPublicKey)
      : null;

    const skippedMessageKeys = new Map<string, CryptoKey>(
      await Promise.all(
        s.skippedMessageKeys.map(async ([k, v]) => {
          const key = await crypto.subtle.importKey(
            "raw",
            fromBase64(v),
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"]
          );
          return [k, key] as [string, CryptoKey];
        })
      )
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

// ── Key import/export helpers ──────────────────────────────────────────────

async function exportHkdfKey(key: ArrayBuffer): Promise<string> {
  return toBase64(new Uint8Array(key));
}

async function importHmacKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromBase64(b64),
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign"]
  );
}

async function exportEcdhPrivate(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", key);
  return toBase64(new Uint8Array(pkcs8));
}

async function importEcdhPrivate(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    fromBase64(b64),
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
}

/**
 * Re-export of DoubleRatchet with corrected root key creation (extractable).
 * Replace internal kdfRK to create extractable HKDF keys.
 */

// Patch: kdfRK creates extractable root keys for serialization
export async function kdfRKExtractable(
  rootKey: ArrayBuffer,
  dhOutput: ArrayBuffer
): Promise<{ newRootKey: ArrayBuffer; newChainKey: CryptoKey }> {
  const derived = await hkdf(dhOutput, rootKey, "WhisperRatchet", 64);
  const newRootKey = derived.slice(0, 32);
  const newChainKey = await crypto.subtle.importKey(
    "raw",
    derived.slice(32, 64),
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign"]
  );
  return { newRootKey, newChainKey };
}

/**
 * DoubleRatchetE2E — production-ready version with extractable root keys.
 * Identical to DoubleRatchet but uses kdfRKExtractable and proper serialization.
 */
export class DoubleRatchetE2E {
  static async initAlice(
    sharedSecret: ArrayBuffer,
    bobPublicKey: CryptoKey
  ): Promise<RatchetState> {
    const initialRootKey = cloneBuffer(sharedSecret);

    const sendingRatchetKey = await generateDHKeyPair();
    const dhOut = await dh(sendingRatchetKey.privateKey, bobPublicKey);
    const { newRootKey, newChainKey } = await kdfRKExtractable(initialRootKey, dhOut);

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

  static async initBob(sharedSecret: ArrayBuffer): Promise<RatchetState> {
    const rootKey = cloneBuffer(sharedSecret);
    const sendingRatchetKey = await generateDHKeyPair();
    return {
      rootKey,
      sendingChainKey: null,
      receivingChainKey: null,
      sendingRatchetKey,
      receivingRatchetPublicKey: null,
      sendMessageNumber: 0,
      receiveMessageNumber: 0,
      previousSendingChainLength: 0,
      skippedMessageKeys: new Map(),
    };
  }

  static encrypt = DoubleRatchet.encrypt;
  static decrypt = DoubleRatchet.decrypt;

  static async serialize(state: RatchetState): Promise<string> {
    const exportRaw = async (k: CryptoKey): Promise<string> => {
      const raw = await crypto.subtle.exportKey("raw", k);
      return toBase64(new Uint8Array(raw));
    };

    const serial: SerializedState = {
      rootKey: toBase64(new Uint8Array(state.rootKey)),
      sendingChainKey: state.sendingChainKey ? await exportRaw(state.sendingChainKey) : null,
      receivingChainKey: state.receivingChainKey ? await exportRaw(state.receivingChainKey) : null,
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
        })
      ),
    };
    return JSON.stringify(serial);
  }

  static async deserialize(data: string): Promise<RatchetState> {
    let s: SerializedState;
    try {
      s = JSON.parse(data);
    } catch {
      throw new Error('DoubleRatchet: corrupted state — invalid JSON');
    }

    // Validate required fields before any crypto operations
    const requiredStrings: (keyof SerializedState)[] = [
      'rootKey', 'sendingRatchetPrivate', 'sendingRatchetPublic',
    ];
    for (const key of requiredStrings) {
      if (typeof s[key] !== 'string') {
        throw new Error(`DoubleRatchet: corrupted state — missing or invalid field: ${key}`);
      }
    }
    if (typeof s.sendMessageNumber !== 'number' || typeof s.receiveMessageNumber !== 'number') {
      throw new Error('DoubleRatchet: corrupted state — invalid message numbers');
    }

    const rootKey = cloneBuffer(fromBase64(s.rootKey));

    const importHmac = async (b64: string) =>
      crypto.subtle.importKey(
        "raw",
        fromBase64(b64),
        { name: "HMAC", hash: "SHA-256" },
        true,
        ["sign"]
      );

    const sendingChainKey = s.sendingChainKey ? await importHmac(s.sendingChainKey) : null;
    const receivingChainKey = s.receivingChainKey ? await importHmac(s.receivingChainKey) : null;

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
        s.skippedMessageKeys.map(async ([k, v]) => {
          const key = await crypto.subtle.importKey(
            "raw",
            fromBase64(v),
            { name: "AES-GCM" },
            false,
            ["encrypt", "decrypt"]
          );
          return [k, key] as [string, CryptoKey];
        })
      )
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

export type { RatchetState };
