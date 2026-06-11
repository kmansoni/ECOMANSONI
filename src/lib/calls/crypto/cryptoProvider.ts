import type { KeyPackageData, EpochKeyMaterial, CallIdentity } from '@/calls-v2';

export interface CryptoProvider {
  initialize(): Promise<void>;
  getPublicKeyBase64(): Promise<string>;
  getSigningPublicKeyBase64(): Promise<string>;
  registerPeerSigningKey(peerId: string, signingPublicKeyBase64: string): Promise<void>;
  createEpochKey(epoch: number): Promise<EpochKeyMaterial>;
  createKeyPackage(peerPublicKeyBase64: string, epoch: number): Promise<KeyPackageData>;
  processKeyPackage(pkg: KeyPackageData): Promise<EpochKeyMaterial>;
  setEncryptionKey(epochKey: EpochKeyMaterial): Promise<void>;
  setDecryptionKey(peerId: string, epochKey: EpochKeyMaterial): Promise<void>;
  updateKeys(ownEpochKey: EpochKeyMaterial, peerKeys?: Map<string, EpochKeyMaterial>): Promise<void>;
  destroy(): Promise<void>;
  /** @deprecated Use getActiveEpochKey() / getStagedEpochKey(). Returns active only. */
  getCurrentEpochKey(): EpochKeyMaterial | null;
  getActiveEpochKey(): EpochKeyMaterial | null;
  getStagedEpochKey(): EpochKeyMaterial | null;
  /** Возвращает идентичность этого провайдера (userId, deviceId, sessionId) */
  getIdentity(): CallIdentity;
}

export type PeerId = `${string}:${string}`; // userId:deviceId