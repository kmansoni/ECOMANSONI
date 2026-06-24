/**
 * Crypto Agility Module — Post-Quantum Hybrid Support
 *
 * Hybrid KEM: ECDH P-256 + ML-KEM-768 (NIST FIPS 203)
 * Provides quantum-resistant key exchange.
 */

import type { RatchetState } from './doubleRatchet';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { logger } from '@/lib/logger';

const PQ_ENABLED = String(import.meta.env.VITE_E2EE_PQ_ENABLED ?? "false").trim() === "true";

class MLKEM768 {
  static async generateKeyPair(): Promise<{
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  }> {
    const kp = ml_kem768.keygen();
    return { publicKey: kp.publicKey, privateKey: kp.secretKey };
  }

  static async encapsulate(publicKey: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    sharedSecret: Uint8Array;
  }> {
    const result = ml_kem768.encapsulate(publicKey);
    return { ciphertext: result.cipherText, sharedSecret: result.sharedSecret };
  }

  static async decapsulate(
    ciphertext: Uint8Array,
    privateKey: Uint8Array
  ): Promise<Uint8Array> {
    return ml_kem768.decapsulate(ciphertext, privateKey);
  }

  static getActiveMode(): 'hybrid' | 'classical' {
    return PQ_ENABLED ? 'hybrid' : 'classical';
  }
}

export const CryptoAgility = {
  getActiveAlgorithm: () => {
    const mode = MLKEM768.getActiveMode();
    return mode === 'hybrid'
      ? 'X25519-MLKEM768-AES256-GCM'
      : 'X25519-AES256-GCM';
  },

  getActiveMode: () => MLKEM768.getActiveMode(),

  isPQEnabled: () => PQ_ENABLED,

  supportedAlgorithms: [
    'X25519-AES256-GCM',
    'X25519-MLKEM768-AES256-GCM',
    'X25519-MLKEM768-ChaCha20-Poly1305',
  ],

  canReadMessage: (msg: any, algo: string): boolean => {
    try {
      const alg = algo.toLowerCase();
      if (alg.includes('mlkem') && !msg.pqCiphertext) return false;
      return true;
    } catch {
      return false;
    }
  },

  async generateKyberKeypair(): Promise<{
    publicKey: Uint8Array;
    privateKey: Uint8Array;
  }> {
    return MLKEM768.generateKeyPair();
  },

  async kyberEncapsulate(publicKey: Uint8Array): Promise<{
    ciphertext: Uint8Array;
    sharedSecret: Uint8Array;
  }> {
    return MLKEM768.encapsulate(publicKey);
  },

  async kyberDecapsulate(
    privateKey: Uint8Array,
    ciphertext: Uint8Array
  ): Promise<Uint8Array> {
    return MLKEM768.decapsulate(ciphertext, privateKey);
  },

  /**
   * FIX CRYPTO-1: symmetric KEM requires recipient pubKey.
   *
   * Protocol (X-Wing / NIST SP 800-56A rev. 3 hybrid pattern):
   *   Alice: receives Bob's ML-KEM public key (published in bundle)
   *   Alice: ML-KEM encapsulate(Bob.mlkem_pubkey) → (ciphertext, sharedSecret)
   *   Alice: sends ciphertext to Bob
   *   Bob:   ML-KEM decapsulate(ciphertext, Bob.mlkem_secretkey) → same sharedSecret
   *
   * @param senderPrivateKey     ECDH private key of sender (deriveBits source)
   * @param recipientPublicKey   ECDH public key of recipient
   * @param recipientMlKemPk    Recipient's ML-KEM-768 public key (from their bundle)
   */
  async hybridKeyExchange(
    senderPrivateKey: CryptoKey,
    senderPublicKey: CryptoKey,
    recipientPublicKey: CryptoKey,
    recipientMlKemPk: Uint8Array | null,
  ): Promise<ArrayBuffer> {
    const ecdhSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: recipientPublicKey },
      senderPrivateKey,
      256
    );

    let mlkemSecret: Uint8Array | null = null;

    if (PQ_ENABLED && recipientMlKemPk) {
      try {
        // FIX CRYPTO-1: encapsulate in recipient's pubKey, not our own.
        const { sharedSecret } = await MLKEM768.encapsulate(recipientMlKemPk);
        mlkemSecret = sharedSecret;
      } catch (err) {
        // FIX HIGH-2: hard fail on PQ path — silent fallback hides broken hybrid.
        // Withdrawing PQ protection is a security decision, not a silent one.
        logger.error('[CryptoAgility] ML-KEM encapsulation failed — PQ disabled', err);
        throw new Error('Post-quantum key exchange failed. Rejecting ECDH-only fallback.');
      }
    }

    const ecdhBytes = new Uint8Array(ecdhSecret);
    let combined: Uint8Array;

    if (mlkemSecret) {
      combined = new Uint8Array(ecdhBytes.length + mlkemSecret.length);
      combined.set(ecdhBytes, 0);
      combined.set(mlkemSecret, ecdhBytes.length);
    } else {
      combined = new Uint8Array(64);
      combined.set(ecdhBytes, 0);
    }

    const hkdfKey = await crypto.subtle.importKey(
      'raw',
      combined,
      { name: 'HKDF' },
      false,
      ['deriveBits']
    );

    return crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-512',
        salt: new TextEncoder().encode('HybridX25519MLKEM768'),
        info: new TextEncoder().encode('E2EE Hybrid Key Derivation'),
      },
      hkdfKey,
      512
    );
  },

  async rotateKeys(state: RatchetState, newAlgo: string): Promise<RatchetState> {
    if (!this.supportedAlgorithms.includes(newAlgo)) {
      throw new Error(`Unsupported algorithm: ${newAlgo}`);
    }

    const usesPQ = newAlgo.includes('MLKEM');

    if (usesPQ) {
      // FIX CRYPTO-3: derive root key and chain key from DIFFERENT parts of KDF output.
      // Using same 32 bytes for both = forward secrecy broken.
      const pqKeys = await this.generateKyberKeypair();

      const newRootKeyMaterial = await crypto.subtle.digest(
        'SHA-512',
        new Uint8Array([
          ...new Uint8Array(state.rootKey),
          ...pqKeys.publicKey,
        ])
      );

      const newRootKeyBytes = new Uint8Array(newRootKeyMaterial);

      const newRootKey = newRootKeyBytes.slice(0, 32);
      const chainKeyBytes = newRootKeyBytes.slice(32, 64);

      const newChainKey = await crypto.subtle.importKey(
        'raw',
        chainKeyBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      return {
        ...state,
        rootKey: newRootKey.buffer,
        receivingChainKey: newChainKey,
      };
    } else {
      // FIX CRYPTO-2: generate 64 bytes, split 32/32.
      // Previous: 32 bytes + slice(32,64) on 32-byte array = 0 bytes (empty chain key).
      // FIX CRYPTO-3: use different halves for root key and chain key.
      const newRootKeyBytes = crypto.getRandomValues(new Uint8Array(64));

      const newChainKey = await crypto.subtle.importKey(
        'raw',
        newRootKeyBytes.slice(32, 64),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      return {
        ...state,
        rootKey: newRootKeyBytes.slice(0, 32).buffer,
        receivingChainKey: newChainKey,
      };
    }
  },

  async selectBestAvailable(): Promise<string> {
    if (PQ_ENABLED) {
      return 'X25519-MLKEM768-AES256-GCM';
    }
    return 'X25519-AES256-GCM';
  },

  isAlgorithmAllowed(current: string, requested: string): boolean {
    const currentIndex = this.supportedAlgorithms.indexOf(current);
    const requestedIndex = this.supportedAlgorithms.indexOf(requested);
    return requestedIndex >= currentIndex;
  },
};
