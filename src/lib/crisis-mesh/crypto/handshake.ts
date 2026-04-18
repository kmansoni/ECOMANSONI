/**
 * Crisis Mesh — handshake-сообщение для обмена публичными ключами.
 *
 * Проблема: при первом контакте у получателя нет нашего Ed25519 publicKey
 * → он не может проверить подпись envelope'а. Штатный путь verifyEnvelope
 * отбросит сообщение как invalid-signature.
 *
 * Решение: handshake-envelope с kind='handshake' имеет специальный формат —
 *   ciphertext = base64(JSON(HandshakePayload)),
 *   где payload содержит наш Ed25519 publicKey и ECDH publicKey,
 *   а подпись envelope'а проверяется уже по ключу ИЗ payload.
 *
 * Защита от подмены личности:
 *   1. envelope.senderId ОБЯЗАН совпадать с computePeerId(ed25519PublicKey)
 *      из payload. Атакующий не может подделать peerId чужой identity.
 *   2. handshakePayload.ecdhPublicKey подписан Ed25519 ключом (embedded
 *      signature внутри payload). Это предотвращает downgrade/подмену ECDH
 *      части со стороны relay.
 *   3. После handshake сохраняем peer.publicKey и peer.encryptionPublicKey
 *      как TOFU (Trust On First Use). UI должен показывать отпечаток для
 *      out-of-band верификации.
 */

import { toBase64, fromBase64 } from '@/lib/e2ee/utils';

import { computePeerId, importPublicKey } from './identity';

const HANDSHAKE_SIGN_PREFIX = 'crisis-mesh:handshake:v1\n';

export interface HandshakePayload {
  /** Ed25519 raw public key (base64, 32 байта) */
  ed25519PublicKey: string;
  /** ECDH P-256 SPKI public key (base64) */
  ecdhPublicKey: string;
  /** Ed25519 подпись над bytes("handshake-prefix" || ecdhPublicKey), base64. */
  ecdhBinding: string;
  /** Отправка в ms, для anti-replay (проверяется в engine против hopCount/ttl). */
  timestamp: number;
  /** deviceType из enum Peer — справочно, не влияет на trust. */
  deviceType: 'android' | 'ios' | 'web' | 'unknown';
  /** Отображаемое имя, подтверждённое подписью (часть binding-bytes). */
  displayName: string;
}

function buildBindingBytes(
  ecdhPublicKeyB64: string,
  displayName: string,
  timestamp: number,
): Uint8Array {
  const canonical =
    HANDSHAKE_SIGN_PREFIX +
    `${ecdhPublicKeyB64}\n` +
    `${displayName}\n` +
    `${timestamp}`;
  return new TextEncoder().encode(canonical);
}

/**
 * Собирает HandshakePayload и подписывает ECDH ключ своим Ed25519 ключом.
 */
export async function buildHandshakePayload(params: {
  ed25519PublicKey: Uint8Array;
  ed25519PrivateKey: CryptoKey;
  ecdhPublicKeyB64: string;
  displayName: string;
  deviceType: HandshakePayload['deviceType'];
  timestamp?: number;
}): Promise<HandshakePayload> {
  const timestamp = params.timestamp ?? Date.now();
  const bindingBytes = buildBindingBytes(
    params.ecdhPublicKeyB64,
    params.displayName,
    timestamp,
  );
  const sigBuf = await crypto.subtle.sign(
    { name: 'Ed25519' },
    params.ed25519PrivateKey,
    bindingBytes as unknown as ArrayBuffer,
  );
  return {
    ed25519PublicKey: toBase64(params.ed25519PublicKey),
    ecdhPublicKey: params.ecdhPublicKeyB64,
    ecdhBinding: toBase64(new Uint8Array(sigBuf)),
    timestamp,
    deviceType: params.deviceType,
    displayName: params.displayName,
  };
}

export interface VerifiedHandshake {
  ed25519PublicKey: Uint8Array;
  ecdhPublicKeyB64: string;
  displayName: string;
  deviceType: HandshakePayload['deviceType'];
  timestamp: number;
}

/**
 * Верифицирует handshake:
 *   1. peerId = computePeerId(ed25519PublicKey) — matches claimed senderId.
 *   2. Ed25519.verify(ed25519PublicKey, ecdhBinding, bindingBytes) == true.
 * Возвращает verified результат или null, если проверка не прошла.
 */
export async function verifyHandshakePayload(
  claimedSenderId: string,
  payload: unknown,
): Promise<VerifiedHandshake | null> {
  if (!isHandshakePayload(payload)) return null;

  let ed25519PublicKey: Uint8Array;
  try {
    ed25519PublicKey = new Uint8Array(fromBase64(payload.ed25519PublicKey));
  } catch {
    return null;
  }
  if (ed25519PublicKey.length !== 32) return null;

  const computedPeerId = await computePeerId(ed25519PublicKey);
  if (computedPeerId !== claimedSenderId) return null;

  const now = Date.now();
  const age = now - payload.timestamp;
  if (age > 24 * 60 * 60 * 1000 || age < -5 * 60 * 1000) return null;

  try {
    const pubKey = await importPublicKey(ed25519PublicKey);
    const bindingBytes = buildBindingBytes(
      payload.ecdhPublicKey,
      payload.displayName,
      payload.timestamp,
    );
    const sig = new Uint8Array(fromBase64(payload.ecdhBinding));
    const ok = await crypto.subtle.verify(
      { name: 'Ed25519' },
      pubKey,
      sig as unknown as ArrayBuffer,
      bindingBytes as unknown as ArrayBuffer,
    );
    if (!ok) return null;
  } catch {
    return null;
  }

  return {
    ed25519PublicKey,
    ecdhPublicKeyB64: payload.ecdhPublicKey,
    displayName: payload.displayName,
    deviceType: payload.deviceType,
    timestamp: payload.timestamp,
  };
}

function isHandshakePayload(value: unknown): value is HandshakePayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.ed25519PublicKey === 'string' &&
    typeof v.ecdhPublicKey === 'string' &&
    typeof v.ecdhBinding === 'string' &&
    typeof v.timestamp === 'number' &&
    (v.deviceType === 'android' ||
      v.deviceType === 'ios' ||
      v.deviceType === 'web' ||
      v.deviceType === 'unknown') &&
    typeof v.displayName === 'string' &&
    v.displayName.length > 0 &&
    v.displayName.length <= 128
  );
}
