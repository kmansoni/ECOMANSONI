import { logger } from '@/lib/logger';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

/**
 * Post-Quantum Readiness — Hybrid KEM abstraction
 *
 * Hybrid scheme: ECDH P-256 + ML-KEM-768 (NIST FIPS 203)
 * When PQ_ENABLED: combines both ECDH and ML-KEM secrets
 * When disabled: falls back to ECDH-only (graceful degradation)
 */

import { toBase64, fromBase64 } from './utils';

const PQ_ENABLED = String(import.meta.env.VITE_E2EE_PQ_ENABLED ?? "false").trim() === "true";

export function isPQAvailable(): boolean {
  return PQ_ENABLED;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HybridKEMResult {
  sharedSecret: CryptoKey;
  ecdhCiphertext: string;
  /** ML-KEM ciphertext — sender encapsulates recipient's pubKey */
  pqCiphertext: string;
  pqUsed: boolean;
}

export interface HybridKEMDecapResult {
  sharedSecret: CryptoKey;
  pqUsed: boolean;
}

// ─── ECDH part ────────────────────────────────────────────────────────────────

async function _ecdhEncap(
  recipientPublicKey: CryptoKey,
): Promise<{ sharedBits: ArrayBuffer; encap: ArrayBuffer }> {
  const ephemeralPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientPublicKey },
    ephemeralPair.privateKey,
    256,
  );
  const encap = await crypto.subtle.exportKey('spki', ephemeralPair.publicKey);
  return { sharedBits, encap };
}

async function _ecdhDecap(
  encap: ArrayBuffer,
  recipientPrivateKey: CryptoKey,
): Promise<ArrayBuffer> {
  const ephemeralPub = await crypto.subtle.importKey(
    'spki',
    encap,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  return crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephemeralPub },
    recipientPrivateKey,
    256,
  );
}

// ─── ML-KEM-768 ───────────────────────────────────────────────────────────────

async function _mlkemEncap(publicKey: Uint8Array): Promise<{
  cipherText: Uint8Array;
  sharedSecret: Uint8Array;
}> {
  return ml_kem768.encapsulate(publicKey);
}

async function _mlkemDecap(
  cipherText: Uint8Array,
  secretKey: Uint8Array
): Promise<Uint8Array> {
  return ml_kem768.decapsulate(cipherText, secretKey);
}

// ─── Hybrid combiner ─────────────────────────────────────────────────────────

async function _combineSecrets(
  ecdhSecret: ArrayBuffer,
  mlkemSecret: Uint8Array | null,
): Promise<CryptoKey> {
  const ecdhBytes = new Uint8Array(ecdhSecret);
  const combined = mlkemSecret
    ? new Uint8Array(ecdhBytes.length + mlkemSecret.length)
    : ecdhBytes;

  if (mlkemSecret) {
    combined.set(ecdhBytes, 0);
    combined.set(mlkemSecret, ecdhBytes.length);
  }

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    combined,
    'HKDF',
    false,
    ['deriveBits'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('hybrid-kem-v1'),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initiator (Alice) performs ML-KEM encapsulation against recipient's (Bob's) pubKey.
 * Protocol: Alice ← Bob's ML-KEM pubKey | Alice encapsulates → sends ciphertext
 * Recipient (Bob): decapsulates(ciphertext, hisPrivateKey) → same sharedSecret
 */
export async function hybridEncapsulate(
  recipientECDH: CryptoKey,
  recipientMlKemPublicKey: Uint8Array | null,
): Promise<HybridKEMResult> {
  try {
    const ecdhResult = await _ecdhEncap(recipientECDH);

    let mlkemCipherText: Uint8Array | undefined;
    let mlkemSecret: Uint8Array | undefined;

    if (isPQAvailable() && recipientMlKemPublicKey) {
      // FIX CRYPTO-1: encapsulate in recipient's pubKey, not our own.
      const mlkemResult = ml_kem768.encapsulate(recipientMlKemPublicKey);
      mlkemCipherText = mlkemResult.cipherText;
      mlkemSecret = mlkemResult.sharedSecret;
    }

    const combinedSecret = await _combineSecrets(ecdhResult.sharedBits, mlkemSecret ?? null);

    return {
      sharedSecret: combinedSecret,
      ecdhCiphertext: toBase64(ecdhResult.encap),
      pqCiphertext: mlkemCipherText ? toBase64(mlkemCipherText) : "",
      pqUsed: !!mlkemSecret,
    };
  } catch (error) {
    logger.error("Hybrid KEM encapsulation failed", error);
    throw error;
  }
}

/**
 * Decapsulate the ML-KEM ciphertext using our private key.
 * Must be called with our own private ML-KEM key (the one whose pubKey we published).
 */
export async function hybridDecapsulate(
  ecdhCiphertextB64: string,
  pqCiphertextB64: string,
  recipientECDH: CryptoKey,
  recipientMlKemPrivateKey: Uint8Array | null,
): Promise<HybridKEMDecapResult> {
  const ecdhBits = await _ecdhDecap(fromBase64(ecdhCiphertextB64), recipientECDH);

  let mlkemSecret: Uint8Array | null = null;

  if (pqCiphertextB64 && isPQAvailable() && recipientMlKemPrivateKey) {
    // FIX CRYPTO-1: decapsulate with OUR private key, using the ciphertext from sender.
    const cipherText = new Uint8Array(fromBase64(pqCiphertextB64));
    mlkemSecret = await _mlkemDecap(cipherText, recipientMlKemPrivateKey);
  }

  const sharedSecret = await _combineSecrets(ecdhBits, mlkemSecret);
  return { sharedSecret, pqUsed: !!mlkemSecret };
}
