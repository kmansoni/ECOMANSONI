import type { CallIdentity, KeyPackageData, EpochKeyMaterial } from '@/calls-v2';
import { CryptoProvider } from './cryptoProvider';
import { logger } from '@/lib/logger';

/**
 * Sealed Sender Crypto Provider — отправка сообщений с защитой от раскрытия отправителя.
 *
 * Sealed Sender hides the sender's identity from the server (including TURN/SFU).
 * The server cannot link the message to the sender's identity even from traffic analysis.
 *
 * Security model:
 * - Sender encrypts the message to the recipient's identity key
 * - Server sees only ciphertext addressed to "unknown sender"
 * - Recipient forwards response to original sender via separate channel
 *
 * Note: This implementation wraps the base provider, adding sealed sender envelope
 * handling. The sealed sender logic requires the recipient's identity key to encrypt
 * the sender's identity field.
 */
export class SealedSenderCryptoProvider implements CryptoProvider {
  private base: CryptoProvider;
  private identity: CallIdentity;

  constructor(base: CryptoProvider, identity: CallIdentity) {
    this.base = base;
    this.identity = identity;
  }

  async initialize(): Promise<void> {
    return this.base.initialize();
  }

  async getPublicKeyBase64(): Promise<string> {
    return this.base.getPublicKeyBase64();
  }

  async getSigningPublicKeyBase64(): Promise<string> {
    return this.base.getSigningPublicKeyBase64();
  }

  async registerPeerSigningKey(peerId: string, signingPublicKeyBase64: string): Promise<void> {
    return this.base.registerPeerSigningKey(peerId, signingPublicKeyBase64);
  }

  async createEpochKey(epoch: number): Promise<EpochKeyMaterial> {
    return this.base.createEpochKey(epoch);
  }

  /**
   * Sealed Sender: создать key package с защитой отправителя.
   *
   * Требует: recipientIdentityKey — публичный идентификационный ключ получателя
   * для шифрования имени отправителя.
   *
   * Если recipientIdentityKey не предоставлен, работает как обычный key package
   * (fallback для совместимости с не-sealed циклами).
   */
  async createKeyPackage(peerPublicKeyBase64: string, epoch: number): Promise<KeyPackageData> {
    // Sealed sender logic: encrypt sender identity with recipient's identity key
    // Currently DEPRECATED - sealed sender not yet implemented for calls-v2
    // TODO: implement sealed sender envelope using recipient's identity key
    logger.warn('[SealedSender] Sealed sender not yet implemented, falling back to unsealed key package');
    return this.base.createKeyPackage(peerPublicKeyBase64, epoch);
  }

  /**
   * Sealed Sender: обработать key package с проверкой sealed envelope.
   *
   * Проверяет, что sealed sender identity соответствует ожиданиям.
   * Если envelope отсутствует (legacy), принимает как обычный key package.
   */
  async processKeyPackage(pkg: KeyPackageData): Promise<EpochKeyMaterial> {
    // Sealed sender verification not yet implemented
    // TODO: verify sealed sender envelope and decrypt sender identity
    logger.warn('[SealedSender] Sealed sender verification not yet implemented, processing as unsealed');
    return this.base.processKeyPackage(pkg);
  }

  async setEncryptionKey(epochKey: EpochKeyMaterial): Promise<void> {
    return this.base.setEncryptionKey(epochKey);
  }

  async setDecryptionKey(peerId: string, epochKey: EpochKeyMaterial): Promise<void> {
    return this.base.setDecryptionKey(peerId, epochKey);
  }

  async updateKeys(ownEpochKey: EpochKeyMaterial, peerKeys?: Map<string, EpochKeyMaterial>): Promise<void> {
    return this.base.updateKeys(ownEpochKey, peerKeys);
  }

  async destroy(): Promise<void> {
    await this.base.destroy();
  }

  getCurrentEpochKey(): EpochKeyMaterial | null {
    return this.base.getCurrentEpochKey();
  }

  getIdentity(): CallIdentity {
    return this.identity;
  }
}