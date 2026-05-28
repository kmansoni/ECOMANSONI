import type { KeyPackageData, EpochKeyMaterial, CallIdentity } from '@/calls-v2';
import { CallKeyExchange } from '@/calls-v2';
import { CallMediaEncryption, type CallMediaEncryptionConfig } from '@/calls-v2';

export class DefaultCryptoProvider implements CryptoProvider {
  private keyExchange: CallKeyExchange;
  private mediaEncryption: CallMediaEncryption;
  private identity: CallIdentity;

  constructor(identity: CallIdentity, mediaEncryptionConfig?: CallMediaEncryptionConfig) {
    this.identity = identity;
    this.keyExchange = new CallKeyExchange(identity);
    this.mediaEncryption = new CallMediaEncryption(mediaEncryptionConfig ?? {});
  }

  async initialize(): Promise<void> {
    await this.keyExchange.initialize();
  }

  async getPublicKeyBase64(): Promise<string> {
    return this.keyExchange.getPublicKeyBase64();
  }

  async getSigningPublicKeyBase64(): Promise<string> {
    return this.keyExchange.getSigningPublicKeyBase64();
  }

  async registerPeerSigningKey(peerId: string, signingPublicKeyBase64: string): Promise<void> {
    await this.keyExchange.registerPeerSigningKey(peerId, signingPublicKeyBase64);
  }

  async createEpochKey(epoch: number): Promise<EpochKeyMaterial> {
    return this.keyExchange.createEpochKey(epoch);
  }

  async createKeyPackage(peerPublicKeyBase64: string, epoch: number): Promise<KeyPackageData> {
    return this.keyExchange.createKeyPackage(peerPublicKeyBase64, epoch);
  }

  async processKeyPackage(pkg: KeyPackageData): Promise<EpochKeyMaterial> {
    return this.keyExchange.processKeyPackage(pkg);
  }

  async setEncryptionKey(epochKey: EpochKeyMaterial): Promise<void> {
    await this.mediaEncryption.setEncryptionKey(epochKey);
  }

  async setDecryptionKey(peerId: string, epochKey: EpochKeyMaterial): Promise<void> {
    await this.mediaEncryption.setDecryptionKey(peerId, epochKey);
  }

  async updateKeys(ownEpochKey: EpochKeyMaterial, peerKeys?: Map<string, EpochKeyMaterial>): Promise<void> {
    await this.mediaEncryption.setEncryptionKey(ownEpochKey);
    if (peerKeys) {
      for (const [peerId, key] of peerKeys) {
        await this.mediaEncryption.setDecryptionKey(peerId, key);
      }
    }
  }

  async destroy(): Promise<void> {
    this.keyExchange.destroy();
    this.mediaEncryption.destroy();
  }

  getCurrentEpochKey(): EpochKeyMaterial | null {
    return this.keyExchange.getCurrentEpochKey();
  }

  getIdentity(): CallIdentity {
    return this.identity;
  }
}