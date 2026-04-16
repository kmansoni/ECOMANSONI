/**
 * Crisis Mesh — Ed25519 signing / verification of envelope.
 *
 * Канонический вид подписываемого массива (sign-bytes):
 *   SHA-256(
 *     "crisis-mesh:v1\n" ||
 *     senderId || "\n" ||
 *     recipientId || "\n" ||
 *     kind || "\n" ||
 *     timestamp (decimal) || "\n" ||
 *     initialHopCount (0, decimal) || "\n" ||
 *     nonce (base64) || "\n" ||
 *     ciphertext (base64)
 *   )
 *
 * Важно: hopCount фиксируется как 0 в момент подписи, чтобы relay не мог
 * подделать счётчик. Текущий hopCount хранится в header отдельно и
 * увеличивается на каждом узле.
 */

import { toBase64, fromBase64 } from '@/lib/e2ee/utils';
import { CrisisMeshError, type MeshMessageEnvelope, type MeshMessageHeader } from '../types';
import { importPublicKey } from './identity';

const CANONICAL_PREFIX = 'crisis-mesh:v1\n';

/**
 * Строит канонический массив байт для подписи.
 * hopCount подписи — всегда 0 (отправитель).
 */
function buildSignBytes(
  header: Omit<MeshMessageHeader, 'hopCount' | 'routePath'>,
  nonce: string,
  ciphertext: string,
): Uint8Array {
  const canonical =
    CANONICAL_PREFIX +
    `${header.senderId}\n` +
    `${header.recipientId}\n` +
    `${header.kind}\n` +
    `${header.timestamp}\n` +
    `0\n` +
    `${nonce}\n` +
    `${ciphertext}`;
  return new TextEncoder().encode(canonical);
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buf);
}

/**
 * Подписать envelope.
 */
export async function signEnvelope(
  privateKey: CryptoKey,
  header: Omit<MeshMessageHeader, 'hopCount' | 'routePath'>,
  nonce: string,
  ciphertext: string,
): Promise<string> {
  const signBytes = await sha256(buildSignBytes(header, nonce, ciphertext));
  const sigBuf = await crypto.subtle.sign({ name: 'Ed25519' }, privateKey, signBytes);
  return toBase64(sigBuf);
}

/**
 * Верифицировать envelope.
 * senderPublicKey должен быть предварительно получен (через handshake или mesh-identity table).
 */
export async function verifyEnvelope(
  senderPublicKey: Uint8Array,
  envelope: MeshMessageEnvelope,
): Promise<boolean> {
  try {
    const signBytes = await sha256(
      buildSignBytes(
        {
          id: envelope.id,
          senderId: envelope.senderId,
          recipientId: envelope.recipientId,
          kind: envelope.kind,
          priority: envelope.priority,
          timestamp: envelope.timestamp,
          maxHops: envelope.maxHops,
          ttlMs: envelope.ttlMs,
        },
        envelope.nonce,
        envelope.ciphertext,
      ),
    );
    const pubKey = await importPublicKey(senderPublicKey);
    const sigBytes = fromBase64(envelope.signature);
    return await crypto.subtle.verify({ name: 'Ed25519' }, pubKey, sigBytes, signBytes);
  } catch (err) {
    // Логируем через security logger, но возвращаем false — не кидаем
    console.warn('[crisis-mesh] verify failed:', err);
    return false;
  }
}

/**
 * Защитная проверка: verify + throw если не прошло.
 */
export async function verifyEnvelopeOrThrow(
  senderPublicKey: Uint8Array,
  envelope: MeshMessageEnvelope,
): Promise<void> {
  const ok = await verifyEnvelope(senderPublicKey, envelope);
  if (!ok) {
    throw new CrisisMeshError(
      'INVALID_SIGNATURE',
      `signature verification failed for message ${envelope.id} from ${envelope.senderId}`,
    );
  }
}
