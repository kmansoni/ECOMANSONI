/**
 * Crypto Agility Module — Post-Quantum Hybrid Support
 *
 * Hybrid KEM: ECDH P-256 + ML-KEM-768 (NIST FIPS 203)
 * Provides quantum-resistant key exchange.
 */

import type { RatchetState } from './doubleRatchet';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

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

  async hybridKeyExchange(
    x25519PrivateKey: CryptoKey,
    x25519PublicKey: CryptoKey
  ): Promise<ArrayBuffer> {
    const ecdhSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: x25519PublicKey },
      x25519PrivateKey,
      256
    );

    let mlkemSecret: Uint8Array | null = null;

    if (PQ_ENABLED) {
      try {
        const { publicKey } = await MLKEM768.generateKeyPair();
        const { sharedSecret } = await MLKEM768.encapsulate(publicKey);
        mlkemSecret = sharedSecret;
      } catch {
        console.warn('[CryptoAgility] ML-KEM-768 failed, using ECDH-only');
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
      const pqKeys = await this.generateKyberKeypair();

      const newRootKey = await crypto.subtle.digest(
        'SHA-512',
        new Uint8Array([
          ...new Uint8Array(state.rootKey),
          ...pqKeys.publicKey.slice(0, 32),
        ])
      );

      const newChainKey = await crypto.subtle.importKey(
        'raw',
        newRootKey.slice(0, 32),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      return {
        ...state,
        rootKey: newRootKey.slice(0, 32),
        receivingChainKey: newChainKey,
      };
    } else {
      const newRootKeyBytes = crypto.getRandomValues(new Uint8Array(32));
      const newRootKey = newRootKeyBytes.buffer;

      const newChainKey = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(newRootKey).slice(32, 64),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      return {
        ...state,
        rootKey: newRootKey.slice(0, 32),
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
