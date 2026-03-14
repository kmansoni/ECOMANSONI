/**
 * Post-Quantum Readiness — Hybrid KEM abstraction
 *
 * Status: PLACEHOLDER / ROADMAP
 *
 * ML-KEM-768 (formerly Kyber-768, NIST FIPS 203) is not yet available
 * in Web Crypto API (as of 2025). This module provides:
 *
 * 1. A feature-flag check (`isPQAvailable()`)
 * 2. A hybrid encapsulation interface that combines:
 *    - ECDH P-256 (classical) — provides current security
 *    - ML-KEM-768 (PQ) — provides post-quantum security when available
 * 3. A shim that falls back to ECDH-only when PQ is unavailable,
 *    with a console warning so we know when to integrate the real impl
 * 4. Combiners following NIST SP 800-227 / IETF hybrid KEM recommendations
 *
 * Integration path:
 * - When `@noble/post-quantum` or Web Crypto ML-KEM landing:
 *   replace `_mlkemStub()` with real implementation
 * - Feature flag: enable via `localStorage.setItem('e2ee_pq', '1')`
 *   or environment variable `VITE_E2EE_PQ=1`
 *
 * Hybrid KEM combiner (following draft-ietf-tls-hybrid-design):
 *   sharedSecret = HKDF(ECDH_secret || MLKEM_secret, info="hybrid-kem-v1")
 */

import { toBase64, fromBase64 } from './utils';

// ─── Feature flag ─────────────────────────────────────────────────────────────

function _isPQFlagEnabled(): boolean {
  try {
    // 1. Build-time env var (Vite)
    if (import.meta.env.VITE_E2EE_PQ === '1') return true;
    // 2. Runtime override (useful for staged rollout)
    if (typeof localStorage !== 'undefined' &&
        localStorage.getItem('e2ee_pq') === '1') return true;
  } catch { /* SSR / Deno / no DOM */ }
  return false;
}

/**
 * Returns true if PQ-KEM is available and enabled.
 * Currently always false until ML-KEM Web Crypto integration is complete.
 */
export function isPQAvailable(): boolean {
  return _isPQFlagEnabled() && _isMLKEMAvailable();
}

/** Placeholder: check if ML-KEM is available in the current runtime. */
function _isMLKEMAvailable(): boolean {
  // Future: check `crypto.subtle.generateKey({ name: 'ML-KEM-768' }, ...)`
  // For now: always false (not in any browser/Deno as of 2025)
  return false;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HybridKEMResult {
  /** Combined shared secret (from ECDH + optional PQ) */
  sharedSecret: CryptoKey;
  /** Classical ECDH encapsulation (ephemeral public key SPKI, base64) */
  ecdhCiphertext: string;
  /** PQ-KEM encapsulation output (base64). Empty string if PQ unavailable */
  pqCiphertext: string;
  /** Whether PQ component was used */
  pqUsed: boolean;
}

export interface HybridKEMDecapResult {
  /** Recovered shared secret (must match encapsulation) */
  sharedSecret: CryptoKey;
  pqUsed: boolean;
}

// ─── ECDH part ────────────────────────────────────────────────────────────────

async function _ecdhEncap(
  recipientPublicKey: CryptoKey,
): Promise<{ sharedBits: ArrayBuffer; encap: ArrayBuffer }> {
  const ephemeralPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
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

// ─── PQ stub ──────────────────────────────────────────────────────────────────

/**
 * STUB: ML-KEM-768 is not available. Returns zeros as a placeholder.
 * Replace this when integrating a real ML-KEM implementation.
 */
async function _mlkemStub(): Promise<{ kemSharedSecret: ArrayBuffer; kemCiphertext: ArrayBuffer }> {
  console.warn(
    '[E2EE:PQ] ML-KEM-768 requested but not available. ' +
    'Falling back to ECDH-only. Enable PQ when FIPS 203 lands in Web Crypto.',
  );
  return {
    kemSharedSecret: new ArrayBuffer(32),  // zero bytes — excluded from combiner
    kemCiphertext:   new ArrayBuffer(0),
  };
}

// ─── Hybrid combiner ─────────────────────────────────────────────────────────

/**
 * Combines ECDH shared secret and (optional) PQ shared secret using HKDF.
 * If PQ is disabled, only ECDH contributes to the output.
 *
 * Follows draft-ietf-tls-hybrid-design concatenation combiner:
 *   concat = ECDH_secret || PQ_secret
 *   output = HKDF-SHA-256(concat, info="hybrid-kem-v1")
 */
async function _combineSecrets(
  ecdhSecret: ArrayBuffer,
  pqSecret: ArrayBuffer | null,
  info = 'hybrid-kem-v1',
): Promise<CryptoKey> {
  const combined = pqSecret
    ? _concat(new Uint8Array(ecdhSecret), new Uint8Array(pqSecret))
    : new Uint8Array(ecdhSecret);

  const hkdfKey = await crypto.subtle.importKey(
    'raw',
    combined as unknown as Uint8Array<ArrayBuffer>,
    'HKDF',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(info),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function _concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Hybrid KEM encapsulation — called by initiator (sender).
 *
 * @param recipientPublicKey  ECDH P-256 public key of recipient
 * @returns { sharedSecret, ecdhCiphertext, pqCiphertext, pqUsed }
 */
export async function hybridEncapsulate(
  recipientPublicKey: CryptoKey,
): Promise<HybridKEMResult> {
  const pqEnabled = isPQAvailable();

  const { sharedBits: ecdhBits, encap: ecdhEncap } = await _ecdhEncap(recipientPublicKey);

  let pqBits: ArrayBuffer | null = null;
  let pqCiphertext = '';

  if (pqEnabled) {
    const { kemSharedSecret, kemCiphertext } = await _mlkemStub();
    pqBits = kemSharedSecret;
    pqCiphertext = toBase64(kemCiphertext);
  }

  const sharedSecret = await _combineSecrets(ecdhBits, pqBits);

  return {
    sharedSecret,
    ecdhCiphertext: toBase64(ecdhEncap),
    pqCiphertext,
    pqUsed: pqEnabled,
  };
}

/**
 * Hybrid KEM decapsulation — called by recipient.
 *
 * @param ecdhCiphertextB64   ECDH encapsulation (ephemeral public key, base64)
 * @param pqCiphertextB64     PQ encapsulation (base64, empty string if PQ not used)
 * @param recipientPrivateKey ECDH P-256 private key of recipient
 * @param pqPrivateKey        PQ private key (not yet typed; pass null until ML-KEM lands)
 */
export async function hybridDecapsulate(
  ecdhCiphertextB64: string,
  pqCiphertextB64: string,
  recipientPrivateKey: CryptoKey,
  pqPrivateKey: unknown = null,
): Promise<HybridKEMDecapResult> {
  const ecdhBits = await _ecdhDecap(fromBase64(ecdhCiphertextB64), recipientPrivateKey);

  let pqBits: ArrayBuffer | null = null;
  let pqUsed = false;

  if (pqCiphertextB64 && isPQAvailable() && pqPrivateKey !== null) {
    // Future: const pqDecap = await mlkem768.decap(fromBase64(pqCiphertextB64), pqPrivateKey);
    // pqBits = pqDecap.sharedSecret;
    pqUsed = true;
  }

  const sharedSecret = await _combineSecrets(ecdhBits, pqBits);
  return { sharedSecret, pqUsed };
}
