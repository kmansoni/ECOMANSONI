/**
 * Crypto Agility Module — stub for tests
 *
 * Provides algorithm rotation and hybrid PQ support.
 * Real implementation will be added in future.
 */

import type { RatchetState } from './doubleRatchet';

export const CryptoAgility = {
  getActiveAlgorithm: () => 'X25519-Ed25519-AES256',

  supportedAlgorithms: [
    'X25519-Ed25519-AES256',
    'X25519-Ed25519-ChaCha20',
    'Kyber-X25519-Ed25519-AES256',
  ],

  canReadMessage: (msg: any, algo: string) => true,

  async generateKyberKeypair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
    return {
      publicKey: new Uint8Array(1500).fill(0x42),
      privateKey: new Uint8Array(1500).fill(0x42),
    };
  },

  async kyberEncapsulate(publicKey: Uint8Array): Promise<{ ciphertext: Uint8Array; sharedSecret: Uint8Array }> {
    return {
      ciphertext: new Uint8Array(2000).fill(0x43),
      sharedSecret: new Uint8Array(32).fill(0x44),
    };
  },

  async kyberDecapsulation(privateKey: Uint8Array, ciphertext: Uint8Array): Promise<Uint8Array> {
    return new Uint8Array(32).fill(0x44);
  },

  async rotateKeys(state: RatchetState, newAlgo: string): Promise<RatchetState> {
    // In reality: perform DH exchange with new key pair
    return state;
  },

  async selectBestAvailable(): Promise<string> {
    return 'X25519-Ed25519-AES256';
  },
};
