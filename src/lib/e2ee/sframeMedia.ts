/**
 * SFrameMedia
 *
 * Media encryption facade for calls/screenshare on top of SFrameContext.
 * Uses AES-128-GCM and optional key-frame ratchet.
 *
 * Ratchet design:
 *   - Симметричный: оба пира используют одну и ту же base key material и
 *     один и тот же domain-separation salt → детерминированно выводят
 *     одинаковые следующие ключи.
 *   - Salt — фиксированная доменная метка (MLS-style), не требует
 *     внеполосного согласования. Это безопасно, потому что IKM
 *     (baseKeyMaterial) высокоэнтропийный.
 */

import { SFrameContext } from './sframe';

export interface MediaFrameMeta {
  isKeyFrame?: boolean;
}

/**
 * Domain separation salt — 32 байта, фиксированная ASCII-метка.
 * НЕ нули: нулевой salt допустим для HKDF, но фиксированная метка
 * обеспечивает доменное разделение с другими HKDF-деривациями
 * в рамках того же session key.
 */
const RATCHET_SALT = new TextEncoder().encode('mansoni/sframe-media-ratchet/v1/');

export class SFrameMediaContext {
  private readonly ctx = new SFrameContext({ cipherSuite: 'AES_128_GCM' });
  private keyEpoch = 0;
  private baseKeyMaterial: ArrayBuffer | null = null;
  private currentKeyId = 0;

  /**
   * Устанавливает начальный ключ медиасессии.
   *
   * @param key              AES-128-GCM CryptoKey (non-extractable)
   * @param keyId            Идентификатор ключа (epoch)
   * @param baseKeyMaterial  Raw байты базового key material — опционально.
   *                         Если передан, auto-ratchet будет работать при
   *                         encrypt/decrypt с meta.isKeyFrame=true.
   */
  async setKey(key: CryptoKey, keyId: number, baseKeyMaterial?: ArrayBuffer): Promise<void> {
    this.keyEpoch = 0;
    this.currentKeyId = keyId;
    this.baseKeyMaterial = baseKeyMaterial ? baseKeyMaterial.slice(0) : null;
    await this.ctx.setEncryptionKey(key, keyId);
  }

  /**
   * Ratchets media key per key-frame by deriving a fresh AES-128 key from current key material.
   */
  async ratchetForKeyFrame(baseKeyMaterial: ArrayBuffer, keyId: number): Promise<void> {
    const baseKeyBytes = new Uint8Array(baseKeyMaterial.slice(0));
    const ikm = await crypto.subtle.importKey('raw', baseKeyBytes, 'HKDF', false, ['deriveKey']);
    const nextKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: RATCHET_SALT,
        info: new TextEncoder().encode(`sframe-media-ratchet:${this.keyEpoch}`),
      },
      ikm,
      { name: 'AES-GCM', length: 128 },
      false,
      ['encrypt', 'decrypt'],
    );
    this.keyEpoch += 1;
    this.currentKeyId = keyId;
    await this.ctx.setEncryptionKey(nextKey, keyId);
  }

  async encryptFrame(frame: ArrayBuffer, meta: MediaFrameMeta = {}): Promise<ArrayBuffer> {
    if (meta.isKeyFrame && this.baseKeyMaterial) {
      await this.ratchetForKeyFrame(this.baseKeyMaterial, this.currentKeyId);
    }
    return this.ctx.encryptFrame(frame);
  }

  async decryptFrame(frame: ArrayBuffer, meta: MediaFrameMeta = {}): Promise<ArrayBuffer> {
    if (meta.isKeyFrame && this.baseKeyMaterial) {
      await this.ratchetForKeyFrame(this.baseKeyMaterial, this.currentKeyId);
    }
    return this.ctx.decryptFrame(frame);
  }
}
