/**
 * Cryptographic operation timeout utilities.
 * Prevents wedged tabs / deadlocks by bounding async WebCrypto operations.
 */

const DEFAULT_CRYPTO_TIMEOUT_MS = 10_000; // 10 seconds for key exchange

/**
 * Wraps a crypto promise with a timeout.
 * If timeout fires first, rejects with a descriptive error.
 * The underlying promise continues running (tab stays alive) but result is discarded.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = DEFAULT_CRYPTO_TIMEOUT_MS,
  operationName = 'crypto operation',
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CryptoTimeoutError(operationName, timeoutMs));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export class CryptoTimeoutError extends Error {
  readonly operation: string;
  readonly timeoutMs: number;
  readonly code = 'CRYPTO_TIMEOUT';

  constructor(operation: string, timeoutMs: number) {
    super(`Cryptographic operation "${operation}" timed out after ${timeoutMs}ms`);
    this.name = 'CryptoTimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Standard timeouts for specific crypto operations.
 * Calibrated to typical WebCrypto latency on mobile devices.
 */
export const CRYPTO_TIMEOUTS = {
  /** ECDH key generation or derivation */
  keyAgreement: 5_000,
  /** AES-GCM encrypt/decrypt single frame */
  frameEncrypt: 2_000,
  /** wrapKey / unwrapKey */
  keyWrap: 3_000,
  /** Full X3DH key agreement */
  x3dhKeyAgreement: 10_000,
  /** Key ceremony (user confirmation flow) */
  keyCeremony: 30_000,
  /** Group key distribution to N recipients */
  groupKeyDistribute: 15_000,
  /** IndexedDB keystore operations */
  keystoreOp: 8_000,
} as const;
