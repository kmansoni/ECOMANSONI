import { logger } from '@/lib/logger';

/**
 * Call Media Encryption — оркестрирует SFrame encryption/decryption для call media pipeline.
 *
 * Связывает:
 *   CallKeyExchange (epoch CryptoKey) ↔ MediaEncryptor (SFrame TransformStream)
 *   SfuMediaManager (RTCRtpSender/Receiver) ↔ Insertable Streams API
 *
 * Design decisions:
 * - Fail-closed: без валидного epoch key setupSenderTransform БРОСАЕТ ошибку (H-6).
 * - Async setEncryptionKey/setDecryptionKey: MediaEncryptor.setEncryptionKey принимает CryptoKey.
 * - Adapter pattern: скрывает отличия сигнатуры MediaEncryptor от call pipeline.
 * - EpochGuard integration (M-6): assertMediaAllowed() перед всеми media operations.
 * - H-2 compatible: принимает EpochKeyMaterial без rawKeyBytes — использует CryptoKey напрямую.
 *
 * MediaEncryptor API (actual):
 *   setEncryptionKey(key: CryptoKey, keyId: number): Promise<void>
 *   setDecryptionKey(key: CryptoKey, keyId: number, peerId: string): Promise<void>
 *   setupSenderTransform(sender: RTCRtpSender, trackId: string): void  — throws if unsupported
 *   setupReceiverTransform(receiver: RTCRtpReceiver, trackId: string, peerId: string): void
 *   removeAllTransforms(): void
 */

import { MediaEncryptor, type InsertableStreamsConfig } from '@/lib/e2ee/insertableStreams';
import type { PipeBreakInfo } from '@/lib/e2ee/insertableStreams';
import type { EpochKeyMaterial } from './callKeyExchange';
import type { EpochGuard } from './epochGuard';

export interface CallMediaEncryptionConfig {
  /** Вызывается при ошибке шифрования/дешифровки на уровне кадра (информационный) */
  onError?: (error: Error, direction: 'encrypt' | 'decrypt') => void;
  /** Вызывается при поломке pipe — caller должен пересоздать producer/consumer для восстановления */
  onPipeBreak?: (info: PipeBreakInfo) => void;
}

export class CallMediaEncryption {
  private encryptor: MediaEncryptor;
  private currentEpoch: number = 0;
  private hasEncryptionKey: boolean = false;
  /** peerId → epoch number (для диагностики) */
  private peerDecryptionEpochs: Map<string, number> = new Map();
  /** M-6: optional EpochGuard — wenn gesetzt, assertMediaAllowed() wird aufgerufen */
  private epochGuard: EpochGuard | null = null;

  constructor(config: CallMediaEncryptionConfig = {}) {
    const encryptorConfig: InsertableStreamsConfig = {
      onError: config.onError,
      onPipeBreak: config.onPipeBreak,
    };
    this.encryptor = new MediaEncryptor(encryptorConfig);
  }

  /**
   * M-6: Установить EpochGuard для enforcement media allowed checks.
   * Вызывать после создания CallMediaEncryption перед первым produce.
   */
  setEpochGuard(guard: EpochGuard): void {
    this.epochGuard = guard;
  }

  /**
   * Проверка поддержки Insertable Streams в текущем браузере.
   * Chrome 86+ (createEncodedStreams). RTCRtpScriptTransform not counted (C-4).
   */
  static isSupported(): boolean {
    return MediaEncryptor.isSupported();
  }

  /**
   * Установить ключ шифрования outbound media (наш epoch key).
   * Вызывать после createEpochKey() — до первого produce.
   * H-2: принимает CryptoKey напрямую — rawKeyBytes не нужен.
   */
  async setEncryptionKey(epochKey: EpochKeyMaterial): Promise<void> {
    // MediaEncryptor.setEncryptionKey(CryptoKey, keyId: number)
    // keyId = epoch число (0–255, используется как SFrame Key ID)
    await this.encryptor.setEncryptionKey(epochKey.key, epochKey.epoch & 0xff);
    this.currentEpoch = epochKey.epoch;
    this.hasEncryptionKey = true;
    logger.debug(`[CallMediaEncryption] Encryption key set for epoch ${epochKey.epoch}`);
  }

  /**
   * Установить ключ дешифровки для конкретного пира (inbound media).
   * Вызывать после processKeyPackage() с ключом от пира.
   * H-2: принимает CryptoKey напрямую.
   *
   * @param peerId — userId или producerId пира
   * @param epochKey — EpochKeyMaterial полученный от этого пира
   */
  async setDecryptionKey(peerId: string, epochKey: EpochKeyMaterial): Promise<void> {
    // MediaEncryptor.setDecryptionKey(CryptoKey, keyId: number, peerId: string)
    await this.encryptor.setDecryptionKey(epochKey.key, epochKey.epoch & 0xff, peerId);
    this.peerDecryptionEpochs.set(peerId, epochKey.epoch);
    logger.debug(`[CallMediaEncryption] Decryption key set for peer ${peerId} epoch ${epochKey.epoch}`);
  }

  /**
   * Подключить SFrame encrypt transform на outbound RTCRtpSender.
   * Вызывать ПОСЛЕ setEncryptionKey() и ПОСЛЕ produce().
   *
   * H-6: THROWS если encryption key не установлен — fail-closed, не допускаем незашифрованный медиа.
   * M-6: assertMediaAllowed() через EpochGuard если установлен.
   *
   * @param sender — RTCRtpSender от SfuMediaManager.getProducerSender()
   * @param trackId — producer.id (для идентификации transform в логах)
   */
  setupSenderTransform(sender: RTCRtpSender, trackId: string): void {
    // M-6: assert epoch guard allows media
    this.epochGuard?.assertMediaAllowed('setupSenderTransform');

    // H-6: BLOCKED if no encryption key — throw, do not attach transform without key
    if (!this.hasEncryptionKey) {
      throw new Error(
        `[CallMediaEncryption] BLOCKED: cannot attach sender transform without encryption key for track ${trackId}. ` +
        `Set encryption key first via setEncryptionKey().`
      );
    }

    // MediaEncryptor.setupSenderTransform throws if browser doesn't support transforms (C-4)
    this.encryptor.setupSenderTransform(sender, trackId);
    logger.debug(`[CallMediaEncryption] Sender transform attached, track=${trackId}`);
  }

  /**
   * Подключить SFrame decrypt transform на inbound RTCRtpReceiver.
   * Вызывать ПОСЛЕ consume().
   *
   * Receiver можно подключать до прихода decryption key — MediaEncryptor дропнет фреймы
   * пока ключ не придёт (fail-closed в SFrame transport).
   * M-6: assertMediaAllowed() через EpochGuard если установлен.
   *
   * @param receiver — RTCRtpReceiver от SfuMediaManager.getConsumerReceiver()
   * @param peerId — userId или producerId отправителя
   * @param trackId — consumer.id (для идентификации)
   */
  setupReceiverTransform(receiver: RTCRtpReceiver, peerId: string, trackId: string): void {
    // M-6: assert epoch guard allows media
    this.epochGuard?.assertMediaAllowed('setupReceiverTransform');

    if (!this.peerDecryptionEpochs.has(peerId)) {
      logger.warn(
        `[CallMediaEncryption] No decryption key for peer ${peerId} — frames will be dropped until key arrives`
      );
    }
    // MediaEncryptor.setupReceiverTransform(receiver, trackId, peerId) — note arg order difference
    // MediaEncryptor throws if browser doesn't support transforms (C-4)
    this.encryptor.setupReceiverTransform(receiver, trackId, peerId);
    logger.debug(`[CallMediaEncryption] Receiver transform attached, peer=${peerId} track=${trackId}`);
  }

  /**
   * Обновить ключи при rekey (новый epoch).
   * setEncryptionKey обновляет outbound; setDecryptionKey для каждого пира.
   * Все уже подключённые transforms подхватывают новый ключ через SFrameContext.
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
   * Проверить готовность E2EE (encryption key установлен + хотя бы один decryption key).
   */
  isReady(): boolean {
    return this.hasEncryptionKey && this.peerDecryptionEpochs.size > 0;
  }

  /** Текущий epoch номер */
  getEpoch(): number {
    return this.currentEpoch;
  }

  /**
   * Уничтожить все transforms и очистить ключи.
   * Вызывать в closeCallsV2.
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
