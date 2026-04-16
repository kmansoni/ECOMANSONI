/**
 * Crisis Mesh — Proof-of-Work для anti-Sybil и anti-SOS-spam.
 * Hashcash-style: найти nonce такой что SHA-256(challenge || nonce) имеет ≥N ведущих нулевых бит.
 */

import { toBase64 } from '@/lib/e2ee/utils';

export interface PowResult {
  nonce: string;           // base64
  bits: number;            // сколько фактически
  iterations: number;      // сколько hash'ей понадобилось
  elapsedMs: number;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  return new Uint8Array(buf);
}

function leadingZeroBits(hash: Uint8Array): number {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    // Count leading zeros in this byte
    let b = byte;
    while ((b & 0x80) === 0) {
      bits++;
      b = b << 1;
    }
    break;
  }
  return bits;
}

/**
 * Найти PoW nonce. Синхронно-итеративно, но с периодическим yield через await.
 * Max iterations защищает от зависания при недостижимых параметрах.
 */
export async function findProofOfWork(
  challenge: Uint8Array,
  targetBits: number,
  opts: { maxIterations?: number; yieldEvery?: number } = {},
): Promise<PowResult> {
  const maxIter = opts.maxIterations ?? 10_000_000;
  const yieldEvery = opts.yieldEvery ?? 10_000;
  const start = performance.now();

  const nonceBytes = new Uint8Array(16);
  const combined = new Uint8Array(challenge.length + nonceBytes.length);
  combined.set(challenge, 0);

  for (let i = 0; i < maxIter; i++) {
    // Increment nonce (8 low bytes as counter)
    let carry = 1;
    for (let j = 0; j < 8 && carry; j++) {
      const sum = nonceBytes[j] + carry;
      nonceBytes[j] = sum & 0xff;
      carry = sum >> 8;
    }

    combined.set(nonceBytes, challenge.length);
    const hash = await sha256(combined);
    const bits = leadingZeroBits(hash);

    if (bits >= targetBits) {
      return {
        nonce: toBase64(nonceBytes),
        bits,
        iterations: i + 1,
        elapsedMs: performance.now() - start,
      };
    }

    if ((i + 1) % yieldEvery === 0) {
      // Даём event loop передохнуть (важно в UI-потоке)
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  throw new Error(`PoW not found within ${maxIter} iterations at ${targetBits} bits`);
}

/**
 * Проверить PoW nonce. Быстро, один SHA-256.
 */
export async function verifyProofOfWork(
  challenge: Uint8Array,
  nonce: Uint8Array,
  targetBits: number,
): Promise<boolean> {
  if (nonce.length === 0) return false;
  const combined = new Uint8Array(challenge.length + nonce.length);
  combined.set(challenge, 0);
  combined.set(nonce, challenge.length);
  const hash = await sha256(combined);
  return leadingZeroBits(hash) >= targetBits;
}

/**
 * Построить challenge для first-contact: peerId отправителя + peerId получателя + timestamp.
 */
export function buildFirstContactChallenge(
  senderPeerId: string,
  recipientPeerId: string,
  timestamp: number,
): Uint8Array {
  const str = `first-contact:${senderPeerId}:${recipientPeerId}:${timestamp}`;
  return new TextEncoder().encode(str);
}

/**
 * Challenge для SOS: peerId + timestamp + type.
 */
export function buildSosChallenge(
  senderPeerId: string,
  timestamp: number,
  type: string,
): Uint8Array {
  const str = `sos:${senderPeerId}:${timestamp}:${type}`;
  return new TextEncoder().encode(str);
}
