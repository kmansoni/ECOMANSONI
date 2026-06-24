import { logger } from '@/lib/logger';

/**
 * Call Media Encryption вЂ” РѕСЂРєРµСЃС‚СЂРёСЂСѓРµС‚ SFrame encryption/decryption РґР»СЏ call media pipeline.
 *
 * РЎРІСЏР·С‹РІР°РµС‚:
 *   CallKeyExchange (epoch CryptoKey) в†” MediaEncryptor (SFrame TransformStream)
 *   SfuMediaManager (RTCRtpSender/Receiver) в†” Insertable Streams API
 *
 * Design decisions:
 * - Fail-closed: Р±РµР· РІР°Р»РёРґРЅРѕРіРѕ epoch key setupSenderTransform Р‘Р РћРЎРђР•Рў РѕС€РёР±РєСѓ (H-6).
 * - Async setEncryptionKey/setDecryptionKey: MediaEncryptor.setEncryptionKey РїСЂРёРЅРёРјР°РµС‚ CryptoKey.
 * - Adapter pattern: СЃРєСЂС‹РІР°РµС‚ РѕС‚Р»РёС‡РёСЏ СЃРёРіРЅР°С‚СѓСЂС‹ MediaEncryptor РѕС‚ call pipeline.
 * - EpochGuard integration (M-6): assertMediaAllowed() РїРµСЂРµРґ РІСЃРµРјРё media operations.
 * - H-2 compatible: РїСЂРёРЅРёРјР°РµС‚ EpochKeyMaterial Р±РµР· rawKeyBytes вЂ” РёСЃРїРѕР»СЊР·СѓРµС‚ CryptoKey РЅР°РїСЂСЏРјСѓСЋ.
 *
 * MediaEncryptor API (actual):
 *   setEncryptionKey(key: CryptoKey, keyId: number): Promise<void>
 *   setDecryptionKey(key: CryptoKey, keyId: number, peerId: string): Promise<void>
 *   setupSenderTransform(sender: RTCRtpSender, trackId: string): void  вЂ” throws if unsupported
 *   setupReceiverTransform(receiver: RTCRtpReceiver, trackId: string, peerId: string): void
 *   removeAllTransforms(): void
 */

import { MediaEncryptor, type InsertableStreamsConfig } from '@/lib/e2ee/insertableStreams';
import type { PipeBreakInfo } from '@/lib/e2ee/insertableStreams';
import type { EpochKeyMaterial } from './callKeyExchange';
import type { EpochGuard } from './epochGuard';

export interface CallMediaEncryptionConfig {
  /** Р’С‹Р·С‹РІР°РµС‚СЃСЏ РїСЂРё РѕС€РёР±РєРµ С€РёС„СЂРѕРІР°РЅРёСЏ/РґРµС€РёС„СЂРѕРІРєРё РЅР° СѓСЂРѕРІРЅРµ РєР°РґСЂР° (РёРЅС„РѕСЂРјР°С†РёРѕРЅРЅС‹Р№) */
  onError?: (error: Error, direction: 'encrypt' | 'decrypt') => void;
  /** Р’С‹Р·С‹РІР°РµС‚СЃСЏ РїСЂРё РїРѕР»РѕРјРєРµ pipe вЂ” caller РґРѕР»Р¶РµРЅ РїРµСЂРµСЃРѕР·РґР°С‚СЊ producer/consumer РґР»СЏ РІРѕСЃСЃС‚Р°РЅРѕРІР»РµРЅРёСЏ */
  onPipeBreak?: (info: PipeBreakInfo) => void;
}

export class CallMediaEncryption {
  private encryptor: MediaEncryptor;
  private currentEpoch: number = 0;
  private hasEncryptionKey: boolean = false;
  /** peerId в†’ epoch number (РґР»СЏ РґРёР°РіРЅРѕСЃС‚РёРєРё) */
  private peerDecryptionEpochs: Map<string, number> = new Map();
  /** M-6: optional EpochGuard вЂ” wenn gesetzt, assertMediaAllowed() wird aufgerufen */
  private epochGuard: EpochGuard | null = null;

  private buildPeerAliases(peerId: string): string[] {
    const trimmed = peerId.trim();
    if (!trimmed) return [];
    // FIX CALLS-3: ONLY the exact composite peerId is a valid key identifier.
    // Splitting into bare userId or bare deviceId lets any device knowing one
    // fragment decrypt traffic for ALL devices of that user. Each SFrame key
    // must be associated with the precise userId:deviceId it was derived for.
    return [trimmed];
  }

  private resolveReceiverPeerId(peerId: string): string {
    if (this.peerDecryptionEpochs.has(peerId)) return peerId;

    for (const alias of this.buildPeerAliases(peerId)) {
      if (this.peerDecryptionEpochs.has(alias)) return alias;
    }

    return peerId;
  }

  hasDecryptionKeyForPeer(peerId: string): boolean {
    const resolvedPeerId = this.resolveReceiverPeerId(peerId);
    return this.peerDecryptionEpochs.has(resolvedPeerId);
  }

  constructor(config: CallMediaEncryptionConfig = {}) {
    const encryptorConfig: InsertableStreamsConfig = {
      onError: config.onError,
      onPipeBreak: config.onPipeBreak,
    };
    this.encryptor = new MediaEncryptor(encryptorConfig);
  }

  /**
   * M-6: РЈСЃС‚Р°РЅРѕРІРёС‚СЊ EpochGuard РґР»СЏ enforcement media allowed checks.
   * Р’С‹Р·С‹РІР°С‚СЊ РїРѕСЃР»Рµ СЃРѕР·РґР°РЅРёСЏ CallMediaEncryption РїРµСЂРµРґ РїРµСЂРІС‹Рј produce.
   */
  setEpochGuard(guard: EpochGuard): void {
    this.epochGuard = guard;
  }

  /**
   * РџСЂРѕРІРµСЂРєР° РїРѕРґРґРµСЂР¶РєРё Insertable Streams РІ С‚РµРєСѓС‰РµРј Р±СЂР°СѓР·РµСЂРµ.
   * Chrome 86+ (createEncodedStreams). RTCRtpScriptTransform not counted (C-4).
   */
  static isSupported(): boolean {
    return MediaEncryptor.isSupported();
  }

  /**
   * РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РєР»СЋС‡ С€РёС„СЂРѕРІР°РЅРёСЏ outbound media (РЅР°С€ epoch key).
   * Р’С‹Р·С‹РІР°С‚СЊ РїРѕСЃР»Рµ createEpochKey() вЂ” РґРѕ РїРµСЂРІРѕРіРѕ produce.
   * H-2: РїСЂРёРЅРёРјР°РµС‚ CryptoKey РЅР°РїСЂСЏРјСѓСЋ вЂ” rawKeyBytes РЅРµ РЅСѓР¶РµРЅ.
   */
  async setEncryptionKey(epochKey: EpochKeyMaterial): Promise<void> {
    // MediaEncryptor.setEncryptionKey(CryptoKey, keyId: number)
    // keyId = epoch С‡РёСЃР»Рѕ (0вЂ“255, РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РєР°Рє SFrame Key ID)
    await this.encryptor.setEncryptionKey(epochKey.key, epochKey.epoch & 0x7fffffff, epochKey.epoch);
    this.currentEpoch = epochKey.epoch;
    this.hasEncryptionKey = true;
    logger.debug(`[CallMediaEncryption] Encryption key set for epoch ${epochKey.epoch}`);
  }

  /**
   * РЈСЃС‚Р°РЅРѕРІРёС‚СЊ РєР»СЋС‡ РґРµС€РёС„СЂРѕРІРєРё РґР»СЏ РєРѕРЅРєСЂРµС‚РЅРѕРіРѕ РїРёСЂР° (inbound media).
   * Р’С‹Р·С‹РІР°С‚СЊ РїРѕСЃР»Рµ processKeyPackage() СЃ РєР»СЋС‡РѕРј РѕС‚ РїРёСЂР°.
   * H-2: РїСЂРёРЅРёРјР°РµС‚ CryptoKey РЅР°РїСЂСЏРјСѓСЋ.
   *
   * @param peerId вЂ” userId РёР»Рё producerId РїРёСЂР°
   * @param epochKey вЂ” EpochKeyMaterial РїРѕР»СѓС‡РµРЅРЅС‹Р№ РѕС‚ СЌС‚РѕРіРѕ РїРёСЂР°
   */
  async setDecryptionKey(peerId: string, epochKey: EpochKeyMaterial): Promise<void> {
    // MediaEncryptor.setDecryptionKey(CryptoKey, keyId: number, peerId: string)
    const keyId = epochKey.epoch & 0x7fffffff;
    const aliases = this.buildPeerAliases(peerId);
    logger.debug(`[CallMediaEncryption] setDecryptionKey: peer=${peerId} aliases=${JSON.stringify(aliases)} epoch=${epochKey.epoch} keyId=${keyId}`);

    for (const alias of aliases) {
      await this.encryptor.setDecryptionKey(epochKey.key, keyId, alias, epochKey.epoch);
      this.peerDecryptionEpochs.set(alias, epochKey.epoch);
    }

    logger.debug(`[CallMediaEncryption] Decryption key set for peer ${peerId} epoch ${epochKey.epoch}, total keys=${this.peerDecryptionEpochs.size}`);
  }

  /**
   * РџСЂРѕРІРµСЂСЏРµС‚, С‡С‚Рѕ call-СЃРµСЃСЃРёСЏ СѓР¶Рµ РїСЂРѕС€Р»Р° auth + room join РґР»СЏ РїРѕРґРєР»СЋС‡РµРЅРёСЏ transforms.
   *
   * Р’Р°Р¶РЅРѕ: setupSenderTransform/setupReceiverTransform СЏРІР»СЏСЋС‚СЃСЏ С‡Р°СЃС‚СЊСЋ РїРѕРґРіРѕС‚РѕРІРєРё E2EE,
   * Р° РЅРµ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµРј E2EE_READY. РўСЂРµР±РѕРІР°РЅРёРµ mediaAllowed Р·РґРµСЃСЊ СЃРѕР·РґР°С‘С‚ deadlock:
   * E2EE_READY РЅРµР»СЊР·СЏ РѕС‚РїСЂР°РІРёС‚СЊ РґРѕ РєР»СЋС‡РµР№/transforms, РЅРѕ transforms РЅРµР»СЊР·СЏ РїРѕРґРєР»СЋС‡РёС‚СЊ
   * РґРѕ E2EE_READY. РџРѕСЌС‚РѕРјСѓ guard РїСЂРѕРІРµСЂСЏРµС‚ С‚РѕР»СЊРєРѕ Р±Р°Р·РѕРІС‹Р№ РєРѕРЅС‚РµРєСЃС‚ РєРѕРјРЅР°С‚С‹ Рё epoch,
   * Р° fail-closed РёРЅРІР°СЂРёР°РЅС‚ РѕР±РµСЃРїРµС‡РёРІР°РµС‚СЃСЏ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹Рј outbound key РЅРёР¶Рµ.
   */
  private assertTransformSetupContext(operation: string): void {
    this.epochGuard?.assertAuthenticated(operation);
    this.epochGuard?.assertInRoom(operation);
    this.epochGuard?.assertEpochValid(this.currentEpoch, operation);
  }

  /**
   * РџРѕРґРєР»СЋС‡РёС‚СЊ SFrame encrypt transform РЅР° outbound RTCRtpSender.
   * Р’С‹Р·С‹РІР°С‚СЊ РџРћРЎР›Р• setEncryptionKey() Рё РџРћРЎР›Р• produce().
   *
   * H-6: THROWS РµСЃР»Рё encryption key РЅРµ СѓСЃС‚Р°РЅРѕРІР»РµРЅ вЂ” fail-closed, РЅРµ РґРѕРїСѓСЃРєР°РµРј РЅРµР·Р°С€РёС„СЂРѕРІР°РЅРЅС‹Р№ РјРµРґРёР°.
   * M-6: EpochGuard РїСЂРѕРІРµСЂСЏРµС‚ auth/room/epoch; E2EE_READY РІС‹СЃС‚Р°РІР»СЏРµС‚СЃСЏ РїРѕСЃР»Рµ СѓСЃРїРµС€РЅРѕРіРѕ РїРѕРґРєР»СЋС‡РµРЅРёСЏ transforms.
   *
   * Fail-closed: throws if Insertable Streams unavailable вЂ” call must not proceed unencrypted.
   * Caller must verify CallMediaEncryption.isSupported() before entering a call.
   *
   * @param sender вЂ” RTCRtpSender РѕС‚ SfuMediaManager.getProducerSender()
   * @param trackId вЂ” producer.id (РґР»СЏ РёРґРµРЅС‚РёС„РёРєР°С†РёРё transform РІ Р»РѕРіР°С…)
   */
  setupSenderTransform(sender: RTCRtpSender, trackId: string): void {
    this.assertTransformSetupContext('setupSenderTransform');

    // H-6: BLOCKED if no encryption key вЂ” throw, do not attach transform without key
    if (!this.hasEncryptionKey) {
      throw new Error(
        `[CallMediaEncryption] BLOCKED: cannot attach sender transform without encryption key for track ${trackId}. ` +
        `Set encryption key first via setEncryptionKey().`
      );
    }

    // Fail-closed: throws if browser doesn't support Insertable Streams.
    // Caller must check CallMediaEncryption.isSupported() before calling.
    this.encryptor.setupSenderTransform(sender, trackId);
    logger.debug(`[CallMediaEncryption] Sender transform attached, track=${trackId}`);
  }

  /**
   * РџРѕРґРєР»СЋС‡РёС‚СЊ SFrame decrypt transform РЅР° inbound RTCRtpReceiver.
   * Р’С‹Р·С‹РІР°С‚СЊ РџРћРЎР›Р• consume().
   *
   * Receiver РјРѕР¶РЅРѕ РїРѕРґРєР»СЋС‡Р°С‚СЊ РґРѕ РїСЂРёС…РѕРґР° decryption key вЂ” MediaEncryptor РґСЂРѕРїРЅРµС‚ С„СЂРµР№РјС‹
   * РїРѕРєР° РєР»СЋС‡ РЅРµ РїСЂРёРґС‘С‚ (fail-closed РІ SFrame transport).
   * M-6: EpochGuard РїСЂРѕРІРµСЂСЏРµС‚ auth/room/epoch; E2EE_READY РІС‹СЃС‚Р°РІР»СЏРµС‚СЃСЏ РїРѕСЃР»Рµ СѓСЃРїРµС€РЅРѕРіРѕ РїРѕРґРєР»СЋС‡РµРЅРёСЏ transforms.
   *
   * Fail-closed: throws if browser doesn't support Insertable Streams.
   *
   * @param receiver вЂ” RTCRtpReceiver РѕС‚ SfuMediaManager.getConsumerReceiver()
   * @param peerId вЂ” userId РёР»Рё producerId РѕС‚РїСЂР°РІРёС‚РµР»СЏ
   * @param trackId вЂ” consumer.id (РґР»СЏ РёРґРµРЅС‚РёС„РёРєР°С†РёРё)
   */
  setupReceiverTransform(receiver: RTCRtpReceiver, peerId: string, trackId: string): void {
    this.assertTransformSetupContext('setupReceiverTransform');

    const resolvedPeerId = this.resolveReceiverPeerId(peerId);
    const hasKey = this.peerDecryptionEpochs.has(resolvedPeerId);
    const knownKeys = Array.from(this.peerDecryptionEpochs.keys());
    if (!hasKey) {
      logger.warn(
        `[CallMediaEncryption] No decryption key for peer ${peerId} (resolved=${resolvedPeerId}) вЂ” frames will be dropped until key arrives. ` +
        `known peers: ${JSON.stringify(knownKeys)}`
      );
    }

    // Fail-closed: throws if browser doesn't support Insertable Streams.
    this.encryptor.setupReceiverTransform(receiver, trackId, resolvedPeerId);
    logger.debug(`[CallMediaEncryption] Receiver transform attached, peer=${peerId} resolved=${resolvedPeerId} track=${trackId}`);
  }

  /**
   * РћР±РЅРѕРІРёС‚СЊ РєР»СЋС‡Рё РїСЂРё rekey (РЅРѕРІС‹Р№ epoch).
   * setEncryptionKey РѕР±РЅРѕРІР»СЏРµС‚ outbound; setDecryptionKey РґР»СЏ РєР°Р¶РґРѕРіРѕ РїРёСЂР°.
   * Р’СЃРµ СѓР¶Рµ РїРѕРґРєР»СЋС‡С‘РЅРЅС‹Рµ transforms РїРѕРґС…РІР°С‚С‹РІР°СЋС‚ РЅРѕРІС‹Р№ РєР»СЋС‡ С‡РµСЂРµР· SFrameContext.
   */
  async updateKeys(
    ownEpochKey: EpochKeyMaterial,
    peerKeys?: Map<string, EpochKeyMaterial>
  ): Promise<void> {
    await this.setEncryptionKey(ownEpochKey);
    if (peerKeys) {
      for (const [peerId, key] of peerKeys) {
        await this.setDecryptionKey(peerId, key);
      }
    }
    logger.debug(`[CallMediaEncryption] Keys updated for epoch ${ownEpochKey.epoch}, peers=${peerKeys?.size ?? 0}`);
  }

  /**
   * РџСЂРѕРІРµСЂРёС‚СЊ РіРѕС‚РѕРІРЅРѕСЃС‚СЊ E2EE (encryption key СѓСЃС‚Р°РЅРѕРІР»РµРЅ + С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ decryption key).
   */
  isReady(): boolean {
    return this.hasEncryptionKey && this.peerDecryptionEpochs.size > 0;
  }

  hasOutboundKey(): boolean {
    return this.hasEncryptionKey;
  }

  getDecryptionPeerIds(): string[] {
    return Array.from(this.peerDecryptionEpochs.keys());
  }

  /** РўРµРєСѓС‰РёР№ epoch РЅРѕРјРµСЂ */
  getEpoch(): number {
    return this.currentEpoch;
  }

  /**
   * РЈРЅРёС‡С‚РѕР¶РёС‚СЊ РІСЃРµ transforms Рё РѕС‡РёСЃС‚РёС‚СЊ РєР»СЋС‡Рё.
   * Р’С‹Р·С‹РІР°С‚СЊ РІ closeCallsV2.
   */
  destroy(): void {
    this.encryptor.removeAllTransforms();
    this.hasEncryptionKey = false;
    this.peerDecryptionEpochs.clear();
    this.currentEpoch = 0;
    this.epochGuard = null;
    logger.debug('[CallMediaEncryption] Destroyed');
  }
}
