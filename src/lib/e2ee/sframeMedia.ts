/**
 * SFrameMedia
 *
 * Media encryption facade for calls/screenshare on top of SFrameContext.
 * Uses AES-128-GCM and optional key-frame ratchet.
 */

import { SFrameContext } from './sframe';

export interface MediaFrameMeta {
  isKeyFrame?: boolean;
}

export class SFrameMediaContext {
  private readonly ctx = new SFrameContext({ cipherSuite: 'AES_128_GCM' });
  private keyEpoch = 0;

  async setKey(key: CryptoKey, keyId: number): Promise<void> {
    this.keyEpoch = 0;
    await this.ctx.setEncryptionKey(key, keyId);
  }

  /**
   * Ratchets media key per key-frame by deriving a fresh AES-128 key from current key material.
   */
  async ratchetForKeyFrame(baseKeyMaterial: ArrayBuffer, keyId: number): Promise<void> {
    const ikm = await crypto.subtle.importKey('raw', baseKeyMaterial, 'HKDF', false, ['deriveKey']);
    const nextKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(16),
        info: new TextEncoder().encode(`sframe-media-ratchet:${this.keyEpoch}`),
      },
      ikm,
      { name: 'AES-GCM', length: 128 },
      false,
      ['encrypt', 'decrypt'],
    );
    this.keyEpoch += 1;
    await this.ctx.setEncryptionKey(nextKey, keyId);
  }

  async encryptFrame(frame: ArrayBuffer, _meta: MediaFrameMeta = {}): Promise<ArrayBuffer> {
    return this.ctx.encryptFrame(frame);
  }

  async decryptFrame(frame: ArrayBuffer): Promise<ArrayBuffer> {
    return this.ctx.decryptFrame(frame);
  }
}
