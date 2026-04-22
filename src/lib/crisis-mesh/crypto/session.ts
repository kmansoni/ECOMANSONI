/**
 * Crisis Mesh — E2EE session manager на базе Double Ratchet.
 *
 * После handshake (обмен Ed25519 + ECDH публичными ключами):
 *
 *   1. Определяем роли детерминистично: меньший peerId (лексикографически)
 *      — Alice (initiator), больший — Bob (responder). Это избавляет от
 *      race: кто из двух пиров первый «обнаружил» другого, тот не стартует
 *      сессию «по-своему».
 *
 *   2. Alice: sharedSecret = ECDH(ourEcdhPriv, bobEcdhPub),
 *      DoubleRatchet.initAlice(sharedSecret, bobEcdhPub).
 *
 *   3. Bob: sharedSecret = ECDH(ourEcdhPriv, aliceEcdhPub),
 *      DoubleRatchet.initBob(sharedSecret).
 *      Bob не может отправить первым — он дождётся первого ratchet-сообщения
 *      от Alice, это естественное ограничение Double Ratchet.
 *
 *   4. Для каждого DM-сообщения кладём в ciphertext envelope'а:
 *         base64(JSON({ ratchetHeader, payloadB64 }))
 *      где payloadB64 = то, что DoubleRatchet.encrypt вернул в поле ciphertext.
 *
 * Broadcast сообщения НЕ шифруются через Ratchet (их же получают все, не
 * только конкретный peer). Остаются signed-only — подпись Ed25519 защищает
 * от tampering, но контент виден всем в radius.
 */

import { DoubleRatchet, type RatchetHeader } from '@/lib/e2ee/doubleRatchet';
import { toBase64, fromBase64 } from '@/lib/e2ee/utils';

import type { PeerId } from '../types';
import { deriveSharedSecret, importEcdhPublicKey } from './ecdh-keys';

/**
 * Сериализуемая копия RatchetState для хранения в IndexedDB.
 * В отличие от упавшего `DoubleRatchet.serialize()` из e2ee-ядра, эта
 * версия работает с extractable-ключами, которые мы сами держим в crisis-mesh.
 * Содержит только то, что нужно воссоздать сессию.
 */
interface SerializedSession {
  rootKeyB64: string;
  sendingChainKeyB64: string | null;
  receivingChainKeyB64: string | null;
  sendingRatchetPrivateB64: string;
  sendingRatchetPublicB64: string;
  receivingRatchetPublicB64: string | null;
  sendMessageNumber: number;
  receiveMessageNumber: number;
  previousSendingChainLength: number;
  skippedKeys: Array<[string, string]>;
}

type InternalState = Parameters<typeof DoubleRatchet.encrypt>[0];

export interface SessionRecord {
  peerId: PeerId;
  state: InternalState;
  role: 'alice' | 'bob';
  createdAt: number;
  lastActivityAt: number;
}

export interface EncryptedPayload {
  /** JSON-сериализованный { header: RatchetHeader, ct: string } — base64. */
  ciphertext: string;
}

interface InnerEncrypted {
  header: RatchetHeader;
  ct: string;
}

/**
 * Определяет роль текущего узла по паре peerId'ов.
 * Меньший peerId — alice, больший — bob. Детерминированно, без координации.
 */
export function resolveSessionRole(
  selfPeerId: PeerId,
  peerPeerId: PeerId,
): 'alice' | 'bob' {
  return selfPeerId < peerPeerId ? 'alice' : 'bob';
}

/**
 * Инициализация сессии. Вызывать при успешно верифицированном handshake.
 *
 * Важно для роли Bob: после `initBob` переопределяем его `sendingRatchetKey`
 * на наш long-term ECDH keypair. Alice в `initAlice` использует наш long-term
 * public key как `bobPublicKey`, поэтому Bob должен приватным этого же keypair'а
 * закрывать свой конец первого DH-ratchet шага (иначе shared DH не совпадёт,
 * и первое сообщение от Alice не дешифруется).
 */
export async function initSession(params: {
  selfPeerId: PeerId;
  peerPeerId: PeerId;
  ourEcdhPrivate: CryptoKey;
  ourEcdhPublicKeyB64: string;
  peerEcdhPublicKeyB64: string;
}): Promise<SessionRecord> {
  const role = resolveSessionRole(params.selfPeerId, params.peerPeerId);
  const peerEcdhPublicKey = await importEcdhPublicKey(params.peerEcdhPublicKeyB64);
  const sharedSecret = await deriveSharedSecret(params.ourEcdhPrivate, peerEcdhPublicKey);

  const state =
    role === 'alice'
      ? await DoubleRatchet.initAlice(sharedSecret, peerEcdhPublicKey)
      : await DoubleRatchet.initBob(sharedSecret);

  if (role === 'bob') {
    const ourEcdhPublic = await importEcdhPublicKey(params.ourEcdhPublicKeyB64);
    // Привязываем Bob'овский sendingRatchetKey к его long-term ECDH keypair.
    // initBob сгенерировал временную пару, но Alice уже сделала DH с нашим
    // опубликованным long-term public. Чтобы первый inbound DH-ratchet на Bob
    // сошёлся, приватный конец должен быть от того же keypair.
    state.sendingRatchetKey = {
      privateKey: params.ourEcdhPrivate,
      publicKey: ourEcdhPublic,
    };
  }

  const now = Date.now();
  return {
    peerId: params.peerPeerId,
    state,
    role,
    createdAt: now,
    lastActivityAt: now,
  };
}

/**
 * Шифрует plaintext → envelope.ciphertext-совместимая строка (base64 JSON).
 * Требует что у этой стороны уже есть sending chain key:
 *   - Alice — всегда (после initAlice).
 *   - Bob — после того, как получит первое сообщение от Alice и выполнит
 *     DH ratchet в decrypt().
 */
export async function encryptWithSession(
  session: SessionRecord,
  plaintext: string,
): Promise<EncryptedPayload> {
  const { ciphertext, header } = await DoubleRatchet.encrypt(session.state, plaintext);
  session.lastActivityAt = Date.now();
  const inner: InnerEncrypted = { header, ct: ciphertext };
  const bytes = new TextEncoder().encode(JSON.stringify(inner));
  return { ciphertext: toBase64(bytes) };
}

export async function decryptWithSession(
  session: SessionRecord,
  ciphertextB64: string,
): Promise<string> {
  const raw = new Uint8Array(fromBase64(ciphertextB64));
  const text = new TextDecoder().decode(raw);
  const parsed = JSON.parse(text) as InnerEncrypted;
  if (!parsed || typeof parsed !== 'object' || !parsed.header || !parsed.ct) {
    throw new Error('invalid ratchet payload');
  }
  const plaintext = await DoubleRatchet.decrypt(session.state, parsed.ct, parsed.header);
  session.lastActivityAt = Date.now();
  return plaintext;
}

/**
 * Проверка, может ли эта сессия отправлять (есть sendingChainKey).
 * Bob до первого принятого сообщения — не может.
 */
export function canSend(session: SessionRecord): boolean {
  return session.state.sendingChainKey !== null;
}

// ── Сериализация ──────────────────────────────────────────────────────────

async function exportRawKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return toBase64(new Uint8Array(raw));
}

async function importHmacKey(b64: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(fromBase64(b64));
  return crypto.subtle.importKey(
    'raw',
    bytes as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign'],
  );
}

async function importAesGcmKey(b64: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(fromBase64(b64));
  return crypto.subtle.importKey(
    'raw',
    bytes as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function exportEcdhPrivate(key: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', key);
  return toBase64(new Uint8Array(pkcs8));
}

async function exportEcdhPublic(key: CryptoKey): Promise<string> {
  const spki = await crypto.subtle.exportKey('spki', key);
  return toBase64(new Uint8Array(spki));
}

async function importEcdhPrivate(b64: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(fromBase64(b64));
  return crypto.subtle.importKey(
    'pkcs8',
    bytes as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
}

async function importEcdhPublic(b64: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(fromBase64(b64));
  return crypto.subtle.importKey(
    'spki',
    bytes as unknown as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

export async function serializeSession(session: SessionRecord): Promise<string> {
  const s = session.state;

  const skippedKeys: Array<[string, string]> = [];
  for (const [k, v] of s.skippedMessageKeys) {
    skippedKeys.push([k, await exportRawKey(v)]);
  }

  const serial: SerializedSession = {
    rootKeyB64: toBase64(new Uint8Array(s.rootKey)),
    sendingChainKeyB64: s.sendingChainKey ? await exportRawKey(s.sendingChainKey) : null,
    receivingChainKeyB64: s.receivingChainKey
      ? await exportRawKey(s.receivingChainKey)
      : null,
    sendingRatchetPrivateB64: await exportEcdhPrivate(s.sendingRatchetKey.privateKey),
    sendingRatchetPublicB64: await exportEcdhPublic(s.sendingRatchetKey.publicKey),
    receivingRatchetPublicB64: s.receivingRatchetPublicKey
      ? await exportEcdhPublic(s.receivingRatchetPublicKey)
      : null,
    sendMessageNumber: s.sendMessageNumber,
    receiveMessageNumber: s.receiveMessageNumber,
    previousSendingChainLength: s.previousSendingChainLength,
    skippedKeys,
  };

  return JSON.stringify({
    peerId: session.peerId,
    role: session.role,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    state: serial,
  });
}

export async function deserializeSession(json: string): Promise<SessionRecord> {
  const parsed = JSON.parse(json) as {
    peerId: PeerId;
    role: 'alice' | 'bob';
    createdAt: number;
    lastActivityAt: number;
    state: SerializedSession;
  };
  const s = parsed.state;

  const rootKey = (fromBase64(s.rootKeyB64) as ArrayBuffer).slice(0);
  const sendingPrivate = await importEcdhPrivate(s.sendingRatchetPrivateB64);
  const sendingPublic = await importEcdhPublic(s.sendingRatchetPublicB64);

  const state: InternalState = {
    rootKey,
    sendingChainKey: s.sendingChainKeyB64 ? await importHmacKey(s.sendingChainKeyB64) : null,
    receivingChainKey: s.receivingChainKeyB64
      ? await importHmacKey(s.receivingChainKeyB64)
      : null,
    sendingRatchetKey: { privateKey: sendingPrivate, publicKey: sendingPublic },
    receivingRatchetPublicKey: s.receivingRatchetPublicB64
      ? await importEcdhPublic(s.receivingRatchetPublicB64)
      : null,
    sendMessageNumber: s.sendMessageNumber,
    receiveMessageNumber: s.receiveMessageNumber,
    previousSendingChainLength: s.previousSendingChainLength,
    skippedMessageKeys: new Map(
      await Promise.all(
        s.skippedKeys.map(async ([k, v]) => [k, await importAesGcmKey(v)] as [string, CryptoKey]),
      ),
    ),
  };

  return {
    peerId: parsed.peerId,
    state,
    role: parsed.role,
    createdAt: parsed.createdAt,
    lastActivityAt: parsed.lastActivityAt,
  };
}
