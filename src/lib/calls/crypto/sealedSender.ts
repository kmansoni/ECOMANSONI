import type { CallIdentity, KeyPackageData, EpochKeyMaterial } from '@/calls-v2';
import { CryptoProvider } from './cryptoProvider';

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

  // Sealed Sender logic: создаём ключ пакет, затем подписываем его долгосрочным ключом получателя
  // Для простоты пока что просто delegates, но в реальности нужно добавить sealing.
  async createKeyPackage(peerPublicKeyBase64: string, epoch: number): Promise<KeyPackageData> {
    // TODO: реализовать sealing
    return this.base.createKeyPackage(peerPublicKeyBase64, epoch);
  }

  async processKeyPackage(pkg: KeyPackageData): Promise<EpochKeyMaterial> {
    // TODO: реализовать проверку sealing
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