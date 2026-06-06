/**
 * Software E2EE Encryptor — browser-independent encryption using Web Crypto API.
 *
 * This is a fallback for browsers without Insertable Streams support.
 * Uses MediaStreamTrack API for media processing (available in all modern browsers).
 *
 * Design:
 * - encryptFrame/decryptFrame: AES-GCM with SFrame format (same as MediaEncryptor)
 * - No Insertable Streams dependency — uses Web Crypto API directly
 * - Replay protection via sliding window (same as SFrameContext)
 *
 * Usage:
 *   const enc = new SoftwareE2eeEncryptor();
 *   await enc.setEncryptionKey(cryptoKey, keyId);
 *   const encrypted = await enc.encryptFrame(frameData);
 */

import { SFrameContext } from './sframe';
import { logger } from '@/lib/logger';

export interface SoftwareEncryptorConfig {
  onError?: (error: Error, direction: 'encrypt' | 'decrypt') => void;
  onFrame?: (direction: 'encrypt' | 'decrypt', size: number) => void;
}

export class SoftwareE2eeEncryptor {
  private encryptor: SFrameContext;
  private decryptors: Map<string, SFrameContext> = new Map();
  private config: SoftwareEncryptorConfig;
  private stats = {
    encryptedFrames: 0,
    decryptedFrames: 0,
    encryptionErrors: 0,
    decryptionErrors: 0,
  };

  constructor(config: SoftwareEncryptorConfig = {}) {
    this.config = config;
    this.encryptor = new SFrameContext();
  }

  /**
   * Set encryption key for outgoing media.
   */
  async setEncryptionKey(key: CryptoKey, keyId: number, epoch: number = keyId): Promise<void> {
    await this.encryptor.setEncryptionKey(key, keyId, epoch);
    logger.debug('[SoftwareE2eeEncryptor] Encryption key set', { keyId, epoch });
  }

  /**
   * Set decryption key for a specific peer.
   */
  async setDecryptionKey(key: CryptoKey, keyId: number, peerId: string, epoch: number = keyId): Promise<void> {
    let ctx = this.decryptors.get(peerId);
    if (!ctx) {
      ctx = new SFrameContext();
      this.decryptors.set(peerId, ctx);
    }
    await ctx.setEncryptionKey(key, keyId, epoch);
    logger.debug('[SoftwareE2eeEncryptor] Decryption key set', { peerId, keyId, epoch });
  }

  /**
   * Encrypt a media frame (ArrayBuffer).
   * Returns encrypted data with SFrame header.
   */
  async encryptFrame(frame: ArrayBuffer): Promise<ArrayBuffer> {
    try {
      const encrypted = await this.encryptor.encryptFrame(frame);
      this.stats.encryptedFrames++;
      this.config.onFrame?.('encrypt', encrypted.byteLength);
      return encrypted;
    } catch (error) {
      this.stats.encryptionErrors++;
      this.config.onError?.(error as Error, 'encrypt');
      throw error;
    }
  }

  /**
   * Decrypt a media frame from a specific peer.
   */
  async decryptFrame(frame: ArrayBuffer, peerId: string): Promise<ArrayBuffer> {
    const ctx = this.decryptors.get(peerId);
    if (!ctx) {
      this.stats.decryptionErrors++;
      this.config.onError?.(new Error('No decryption key for peer: ' + peerId), 'decrypt');
      throw new Error('No decryption key for peer: ' + peerId);
    }

    try {
      const decrypted = await ctx.decryptFrame(frame);
      this.stats.decryptedFrames++;
      this.config.onFrame?.('decrypt', decrypted.byteLength);
      return decrypted;
    } catch (error) {
      this.stats.decryptionErrors++;
      this.config.onError?.(error as Error, 'decrypt');
      throw error;
    }
  }

  /**
   * Check if decryption key exists for a peer.
   */
  hasDecryptionKey(peerId: string): boolean {
    return this.decryptors.has(peerId);
  }

  /**
   * Get processing stats.
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.encryptor.reset();
    this.decryptors.clear();
    this.stats = {
      encryptedFrames: 0,
      decryptedFrames: 0,
      encryptionErrors: 0,
      decryptionErrors: 0,
    };
  }
}

/**
 * Check if browser supports required crypto primitives for E2EE.
 * All modern browsers support Web Crypto API + getUserMedia.
 */
export function hasSoftwareE2eeSupport(): boolean {
  if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
    return false;
  }
  if (typeof MediaStreamTrack === 'undefined') {
    return false;
  }
  return true;
}