/**
 * Crisis Mesh — ECDH P-256 keypair для Double Ratchet sessions.
 *
 * Ed25519 identity (из `identity.ts`) используется только для подписи и
 * верификации — алгоритм не поддерживает DH. Для key agreement нам нужен
 * отдельный ECDH ключ. Его привязка к Ed25519 identity делается подписью
 * в handshake-сообщении — см. `handshake.ts`.
 *
 * Приватный ключ extractable=true, чтобы его можно было экспортировать в
 * pkcs8 и сохранить через `HardwareKeyStorage`. После восстановления
 * импортируется обратно с теми же usages.
 */

import { fromBase64, toBase64 } from '@/lib/e2ee/utils';

export interface EcdhKeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  /** SPKI base64 — тот же ключ, в виде который можно отправить по сети. */
  publicKeyB64: string;
}

const ECDH_PARAMS: EcKeyGenParams = {
  name: 'ECDH',
  namedCurve: 'P-256',
};

export async function generateEcdhKeyPair(): Promise<EcdhKeyPair> {
  const kp = (await crypto.subtle.generateKey(ECDH_PARAMS, true, ['deriveBits'])) as CryptoKeyPair;
  const spki = await crypto.subtle.exportKey('spki', kp.publicKey);
  return {
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    publicKeyB64: toBase64(new Uint8Array(spki)),
  };
}

export async function exportEcdhPrivateKey(privateKey: CryptoKey): Promise<string> {
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
  return toBase64(new Uint8Array(pkcs8));
}

export async function importEcdhPrivateKey(pkcs8B64: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(fromBase64(pkcs8B64));
  return crypto.subtle.importKey('pkcs8', bytes, ECDH_PARAMS, true, ['deriveBits']);
}

export async function importEcdhPublicKey(spkiB64: string): Promise<CryptoKey> {
  const bytes = new Uint8Array(fromBase64(spkiB64));
  return crypto.subtle.importKey('spki', bytes, ECDH_PARAMS, true, []);
}

/**
 * Derive 32-байтный симметричный master secret из нашего ECDH приватного
 * и чужого ECDH публичного ключа. Результат — sharedSecret для инициализации
 * Double Ratchet (далее HKDF внутри DoubleRatchet разводит root/chain keys).
 */
export async function deriveSharedSecret(
  ourPrivate: CryptoKey,
  theirPublic: CryptoKey,
): Promise<ArrayBuffer> {
  return crypto.subtle.deriveBits({ name: 'ECDH', public: theirPublic }, ourPrivate, 256);
}
