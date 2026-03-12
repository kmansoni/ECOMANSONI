/**
 * Sender Keys — Signal-style групповое E2EE
 *
 * Протокол:
 *   - Каждый участник генерирует собственный SenderKey (chain).
 *   - При вступлении в группу отправляет зашифрованный SenderKeyMessage
 *     каждому другому участнику (через X3DH-derived shared secret).
 *   - Сообщения шифруются один раз sender'ом (не N раз для N участников).
 *   - Chain key разворачивается на каждом сообщении (HMAC-SHA-256 ratchet).
 *   - Message key деривируется и не переиспользуется (Forward Secrecy на уровне сообщений).
 *
 * Формат SenderKeyMessage (бинарный, без JSON — компактно):
 *   [1 byte: version=0x01]
 *   [4 bytes: keyId big-endian uint32]
 *   [4 bytes: iteration big-endian uint32]
 *   [32 bytes: chainKeySeed (публичная часть)]
 *   [65 bytes: signaturePublicKey ECDSA P-256 uncompressed]
 *   [64 bytes: signature]
 *
 * EncryptedGroupMessage (для транспорта):
 *   {
 *     senderId: string,
 *     keyId: number,
 *     iteration: number,
 *     iv: string,       // base64 12-byte
 *     ciphertext: string // base64
 *   }
 */

import { toBase64, fromBase64 } from './utils';

const SENDER_KEY_DB = 'e2ee-sender-keys-v1';
const SENDER_KEY_STORE = 'sender_keys';

interface PersistedSenderKeyState {
  id: string;
  conversationId: string;
  senderId: string;
  keyId: number;
  iteration: number;
  chainKey: string;
  signingPublicKeySpki: string;
  signingPrivateKeyPkcs8?: string;
  createdAt: number;
}

// ─── Типы ────────────────────────────────────────────────────────────────────

export interface SenderKeyState {
  conversationId: string;
  senderId: string;
  keyId: number;
  iteration: number;
  chainKey: ArrayBuffer;   // 32-byte secret, NOT stored as CryptoKey — ratcheted each message
  signingKeyPair: CryptoKeyPair; // ECDSA P-256
  createdAt: number;
}

export interface SenderKeyMessage {
  senderId: string;
  conversationId: string;
  keyId: number;
  chainKeySeed: string;    // base64 32 bytes — public starter for the chain
  signingPublicKey: string; // base64 SPKI
  signature: string;       // base64 signature over (keyId || chainKeySeed || conversationId)
  encryptedForRecipient?: string; // base64 AES-GCM ciphertext (SenderKeyMessage encrypted with recipient's shared secret)
}

export interface EncryptedGroupMessage {
  senderId: string;
  conversationId: string;
  keyId: number;
  iteration: number;
  iv: string;        // base64 12-byte nonce
  ciphertext: string; // base64 AES-GCM ciphertext + tag
}

// Map: `${conversationId}:${senderId}:${keyId}` → SenderKeyState
const _senderKeyStore = new Map<string, SenderKeyState>();

function openSenderKeyDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SENDER_KEY_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SENDER_KEY_STORE)) {
        db.createObjectStore(SENDER_KEY_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

async function _persistState(state: SenderKeyState): Promise<void> {
  try {
    const db = await openSenderKeyDb();
    const signingPublicKeySpki = toBase64(await crypto.subtle.exportKey('spki', state.signingKeyPair.publicKey));
    let signingPrivateKeyPkcs8: string | undefined;
    try {
      if (state.signingKeyPair.privateKey) {
        const pkcs8 = await crypto.subtle.exportKey('pkcs8', state.signingKeyPair.privateKey);
        signingPrivateKeyPkcs8 = toBase64(pkcs8);
      }
    } catch {
      signingPrivateKeyPkcs8 = undefined;
    }

    const record: PersistedSenderKeyState = {
      id: _storeKey(state.conversationId, state.senderId, state.keyId),
      conversationId: state.conversationId,
      senderId: state.senderId,
      keyId: state.keyId,
      iteration: state.iteration,
      chainKey: toBase64(state.chainKey),
      signingPublicKeySpki,
      signingPrivateKeyPkcs8,
      createdAt: state.createdAt,
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SENDER_KEY_STORE, 'readwrite');
      const store = tx.objectStore(SENDER_KEY_STORE);
      const req = store.put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch {
    // no-op: memory store remains source of truth for current session
  }
}

async function _loadLatestState(conversationId: string, senderId: string): Promise<SenderKeyState | null> {
  try {
    const db = await openSenderKeyDb();
    const rows = await new Promise<PersistedSenderKeyState[]>((resolve, reject) => {
      const tx = db.transaction(SENDER_KEY_STORE, 'readonly');
      const store = tx.objectStore(SENDER_KEY_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as PersistedSenderKeyState[]) ?? []);
      req.onerror = () => reject(req.error);
    });
    db.close();

    const filtered = rows.filter((r) => r.conversationId === conversationId && r.senderId === senderId);
    if (filtered.length === 0) return null;
    filtered.sort((a, b) => b.keyId - a.keyId);
    const latest = filtered[0];

    const publicKey = await crypto.subtle.importKey(
      'spki',
      fromBase64(latest.signingPublicKeySpki),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    let privateKey: CryptoKey;
    if (latest.signingPrivateKeyPkcs8) {
      privateKey = await crypto.subtle.importKey(
        'pkcs8',
        fromBase64(latest.signingPrivateKeyPkcs8),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
      );
    } else {
      privateKey = null as unknown as CryptoKey;
    }

    return {
      conversationId: latest.conversationId,
      senderId: latest.senderId,
      keyId: latest.keyId,
      iteration: latest.iteration,
      chainKey: fromBase64(latest.chainKey),
      signingKeyPair: { publicKey, privateKey },
      createdAt: latest.createdAt,
    };
  } catch {
    return null;
  }
}

async function _deleteStates(conversationId: string, senderId: string): Promise<void> {
  try {
    const db = await openSenderKeyDb();
    const rows = await new Promise<PersistedSenderKeyState[]>((resolve, reject) => {
      const tx = db.transaction(SENDER_KEY_STORE, 'readonly');
      const store = tx.objectStore(SENDER_KEY_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as PersistedSenderKeyState[]) ?? []);
      req.onerror = () => reject(req.error);
    });

    const ids = rows
      .filter((r) => r.conversationId === conversationId && r.senderId === senderId)
      .map((r) => r.id);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SENDER_KEY_STORE, 'readwrite');
      const store = tx.objectStore(SENDER_KEY_STORE);
      for (const id of ids) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // no-op
  }
}

// ─── HMAC ratchet helpers ─────────────────────────────────────────────────────

/**
 * Advance the chain key one step using HMAC-SHA-256.
 * Convention (same as Signal):
 *   nextChainKey = HMAC-SHA-256(chainKey, 0x02)
 *   messageKey   = HMAC-SHA-256(chainKey, 0x01)
 */
async function ratchet(chainKey: ArrayBuffer): Promise<{ nextChainKey: ArrayBuffer; messageKey: CryptoKey }> {
  const ck = await crypto.subtle.importKey('raw', chainKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const [msgKeyBytes, nextCKBytes] = await Promise.all([
    crypto.subtle.sign('HMAC', ck, new Uint8Array([0x01])),
    crypto.subtle.sign('HMAC', ck, new Uint8Array([0x02])),
  ]);

  // Derive AES-256-GCM message key from 32-byte HMAC output using HKDF
  const msgKeyRaw = await crypto.subtle.importKey('raw', msgKeyBytes, 'HKDF', false, ['deriveKey']);
  const messageKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('e2ee-senderkey-msgkey-v1'),
    },
    msgKeyRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return { nextChainKey: nextCKBytes, messageKey };
}

// ─── Key Generation ───────────────────────────────────────────────────────────

/**
 * Генерирует новый SenderKey для участника в conversation.
 * chainKey — случайный 32-byte секрет. После использования заменяется ratchet-шагом.
 */
export async function generateSenderKey(
  conversationId: string,
  senderId: string,
): Promise<SenderKeyState> {
  const chainKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(chainKeyBytes);

  const signingKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, // non-extractable signing private key
    ['sign', 'verify'],
  );

  const keyId = (Date.now() & 0xffffffff) >>> 0; // 32-bit timestamp as key ID

  const state: SenderKeyState = {
    conversationId,
    senderId,
    keyId,
    iteration: 0,
    chainKey: chainKeyBytes.buffer as ArrayBuffer,
    signingKeyPair,
    createdAt: Date.now(),
  };

  _senderKeyStore.set(_storeKey(conversationId, senderId, keyId), state);
  await _persistState(state);
  return state;
}

function _storeKey(conversationId: string, senderId: string, keyId: number): string {
  return `${conversationId}:${senderId}:${keyId}`;
}

// ─── Distribution ─────────────────────────────────────────────────────────────

/**
 * Сериализует SenderKeyState в SenderKeyMessage для доставки участникам.
 * Подписывает (keyId || chainKeySeed || conversationId) приватным signing ключом.
 *
 * encryptedForRecipient опционально — caller шифрует SenderKeyMessage
 * через X3DH-derived shared secret для каждого получателя отдельно.
 */
export async function buildSenderKeyMessage(
  state: SenderKeyState,
): Promise<Omit<SenderKeyMessage, 'encryptedForRecipient'>> {
  const chainKeySeed = toBase64(state.chainKey);

  // Serialize signing public key to SPKI base64
  const sigPubRaw = await crypto.subtle.exportKey('spki', state.signingKeyPair.publicKey);
  const signingPublicKey = toBase64(sigPubRaw);

  // Signed data: version(1) || keyId(4) || conversationId(utf8) || chainKeySeed(base64 utf8)
  const encoder = new TextEncoder();
  const keyIdBuf = new ArrayBuffer(4);
  new DataView(keyIdBuf).setUint32(0, state.keyId, false);
  const signedData = _concat(
    new Uint8Array([0x01]),
    new Uint8Array(keyIdBuf),
    encoder.encode(state.conversationId),
    encoder.encode(chainKeySeed),
  );

  const signatureBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    state.signingKeyPair.privateKey,
    signedData as unknown as BufferSource,
  );

  return {
    senderId: state.senderId,
    conversationId: state.conversationId,
    keyId: state.keyId,
    chainKeySeed,
    signingPublicKey,
    signature: toBase64(signatureBuf),
  };
}

/**
 * Принимает SenderKeyMessage от другого участника.
 * Проверяет подпись; сохраняет state для последующей расшифровки.
 */
export async function processSenderKeyMessage(msg: SenderKeyMessage): Promise<void> {
  // Verify signature
  const sigPubKey = await crypto.subtle.importKey(
    'spki',
    fromBase64(msg.signingPublicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify'],
  );

  const encoder = new TextEncoder();
  const keyIdBuf = new ArrayBuffer(4);
  new DataView(keyIdBuf).setUint32(0, msg.keyId, false);
  const signedData = _concat(
    new Uint8Array([0x01]),
    new Uint8Array(keyIdBuf),
    encoder.encode(msg.conversationId),
    encoder.encode(msg.chainKeySeed),
  );

  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    sigPubKey,
    fromBase64(msg.signature),
    signedData as unknown as BufferSource,
  );

  if (!valid) {
    throw new Error(
      `SenderKeyMessage from ${msg.senderId} failed signature verification. ` +
      'Possible MITM — rejecting key.',
    );
  }

  // Create a dummy signing key pair with just the public key for storage
  const signingPubCryptoKey = await crypto.subtle.importKey(
    'spki',
    fromBase64(msg.signingPublicKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  // We don't have the private key for remote senders — use a placeholder CryptoKeyPair
  const state: SenderKeyState = {
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    keyId: msg.keyId,
    iteration: 0,
    chainKey: fromBase64(msg.chainKeySeed),
    signingKeyPair: {
      publicKey: signingPubCryptoKey,
      privateKey: null as unknown as CryptoKey, // remote: no private key
    },
    createdAt: Date.now(),
  };

  _senderKeyStore.set(_storeKey(msg.conversationId, msg.senderId, msg.keyId), state);
  await _persistState(state);
}

// ─── Encryption ───────────────────────────────────────────────────────────────

/**
 * Шифрует сообщение sender key chain'ом.
 * Advance ratchet → derive message key → AES-256-GCM encrypt.
 */
export async function encryptGroupMessage(
  conversationId: string,
  senderId: string,
  plaintext: Uint8Array,
): Promise<EncryptedGroupMessage> {
  const stateEntry = _findCurrentState(conversationId, senderId);
  if (!stateEntry) {
    throw new Error(`No sender key found for ${senderId} in ${conversationId}. Call generateSenderKey first.`);
  }

  const { nextChainKey, messageKey } = await ratchet(stateEntry.chainKey);

  const currentIteration = stateEntry.iteration;
  // Update state — mutation in place (Map reference)
  stateEntry.chainKey = nextChainKey;
  stateEntry.iteration++;
  await _persistState(stateEntry);

  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    messageKey,
    plaintext as unknown as BufferSource,
  );

  return {
    senderId,
    conversationId,
    keyId: stateEntry.keyId,
    iteration: currentIteration,
    iv: toBase64(iv.buffer as ArrayBuffer),
    ciphertext: toBase64(ciphertextBuf),
  };
}

// ─── Decryption ───────────────────────────────────────────────────────────────

/**
 * Расшифровывает групповое сообщение.
 * Продвигает chain key sender'а до нужной iteration (forward-skip if needed).
 *
 * NOTE: для production нужен skipped-message-key cache (как в Double Ratchet).
 * Текущая реализация поддерживает порядковую доставку; out-of-order расшифровка
 * требует расширения (Task backlog).
 */
export async function decryptGroupMessage(
  msg: EncryptedGroupMessage,
): Promise<Uint8Array> {
  const state = _senderKeyStore.get(_storeKey(msg.conversationId, msg.senderId, msg.keyId));
  if (!state) {
    throw new Error(
      `No sender key for ${msg.senderId} keyId=${msg.keyId} in ${msg.conversationId}. ` +
      'Request SenderKeyMessage from sender.',
    );
  }

  // Advance chain to target iteration
  if (msg.iteration < state.iteration) {
    throw new Error(
      `Out-of-order message: iteration ${msg.iteration} < current ${state.iteration}. ` +
      'Skipped-message-key cache required for out-of-order delivery — not implemented yet.',
    );
  }

  // Advance chain key to message's iteration
  let chainKey = state.chainKey;
  let messageKey: CryptoKey | null = null;

  for (let i = state.iteration; i <= msg.iteration; i++) {
    const result = await ratchet(chainKey);
    if (i === msg.iteration) {
      messageKey = result.messageKey;
    }
    chainKey = result.nextChainKey;
  }

  // Update stored state to latest position
  state.chainKey = chainKey;
  state.iteration = msg.iteration + 1;
  await _persistState(state);

  const iv = fromBase64(msg.iv);
  const ciphertext = fromBase64(msg.ciphertext);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    messageKey!,
    ciphertext,
  ).catch(() => {
    throw new Error('AES-GCM decryption failed — wrong key or tampered ciphertext.');
  });

  return new Uint8Array(plaintext);
}

// ─── Membership Change ────────────────────────────────────────────────────────

/**
 * Генерирует новый SenderKey после изменения состава группы.
 * Старые ключи остаются в store для расшифровки архивных сообщений.
 */
export async function rotateSenderKey(
  conversationId: string,
  senderId: string,
): Promise<SenderKeyState> {
  return generateSenderKey(conversationId, senderId);
}

/**
 * Возвращает текущий SenderKeyState для senderId (наибольший keyId).
 */
export function getSenderKeyState(
  conversationId: string,
  senderId: string,
): SenderKeyState | null {
  return _findCurrentState(conversationId, senderId) ?? null;
}

/**
 * Возвращает текущий SenderKeyState, подгружая его из IndexedDB при холодном старте.
 */
export async function getOrLoadSenderKeyState(
  conversationId: string,
  senderId: string,
): Promise<SenderKeyState | null> {
  const current = _findCurrentState(conversationId, senderId);
  if (current) return current;

  const loaded = await _loadLatestState(conversationId, senderId);
  if (loaded) {
    _senderKeyStore.set(_storeKey(loaded.conversationId, loaded.senderId, loaded.keyId), loaded);
  }
  return loaded;
}

/**
 * Удаляет все sender keys для conversation (при выходе из группы).
 */
export function deleteSenderKeys(conversationId: string, senderId: string): void {
  for (const key of _senderKeyStore.keys()) {
    if (key.startsWith(`${conversationId}:${senderId}:`)) {
      _senderKeyStore.delete(key);
    }
  }
  void _deleteStates(conversationId, senderId);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _findCurrentState(
  conversationId: string,
  senderId: string,
): SenderKeyState | undefined {
  let latest: SenderKeyState | undefined;
  for (const state of _senderKeyStore.values()) {
    if (state.conversationId === conversationId && state.senderId === senderId) {
      if (!latest || state.keyId > latest.keyId) {
        latest = state;
      }
    }
  }
  return latest;
}

function _concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
