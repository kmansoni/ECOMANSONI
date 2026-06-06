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

  private buildPeerAliases(peerId: string): string[] {
    const trimmed = peerId.trim();
    if (!trimmed) return [];

    const aliases = new Set<string>([trimmed]);
    const sepIndex = trimmed.indexOf(':');
    if (sepIndex > 0 && sepIndex < trimmed.length - 1) {
      const userId = trimmed.slice(0, sepIndex).trim();
      const deviceId = trimmed.slice(sepIndex + 1).trim();
      if (userId) aliases.add(userId);
      if (deviceId) aliases.add(deviceId);
    }

    return Array.from(aliases);
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
    await this.encryptor.setEncryptionKey(epochKey.key, epochKey.epoch & 0xff, epochKey.epoch);
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
    const keyId = epochKey.epoch & 0xff;
    const aliases = this.buildPeerAliases(peerId);
    logger.debug(`[CallMediaEncryption] setDecryptionKey: peer=${peerId} aliases=${JSON.stringify(aliases)} epoch=${epochKey.epoch} keyId=${keyId}`);

    for (const alias of aliases) {
      await this.encryptor.setDecryptionKey(epochKey.key, keyId, alias, epochKey.epoch);
      this.peerDecryptionEpochs.set(alias, epochKey.epoch);
    }

    logger.debug(`[CallMediaEncryption] Decryption key set for peer ${peerId} epoch ${epochKey.epoch}, total keys=${this.peerDecryptionEpochs.size}`);
  }

  /**
   * Проверяет, что call-сессия уже прошла auth + room join для подключения transforms.
   *
   * Важно: setupSenderTransform/setupReceiverTransform являются частью подготовки E2EE,
   * а не подтверждением E2EE_READY. Требование mediaAllowed здесь создаёт deadlock:
   * E2EE_READY нельзя отправить до ключей/transforms, но transforms нельзя подключить
   * до E2EE_READY. Поэтому guard проверяет только базовый контекст комнаты и epoch,
   * а fail-closed инвариант обеспечивается обязательным outbound key ниже.
   */
  private assertTransformSetupContext(operation: string): void {
    this.epochGuard?.assertAuthenticated(operation);
    this.epochGuard?.assertInRoom(operation);
    this.epochGuard?.assertEpochValid(this.currentEpoch, operation);
  }

  /**
   * Подключить SFrame encrypt transform на outbound RTCRtpSender.
   * Вызывать ПОСЛЕ setEncryptionKey() и ПОСЛЕ produce().
   *
   * H-6: THROWS если encryption key не установлен — fail-closed, не допускаем незашифрованный медиа.
   * M-6: EpochGuard проверяет auth/room/epoch; E2EE_READY выставляется после успешного подключения transforms.
   *
   * Fail-closed: throws if Insertable Streams unavailable — call must not proceed unencrypted.
   * Caller must verify CallMediaEncryption.isSupported() before entering a call.
   *
   * @param sender — RTCRtpSender от SfuMediaManager.getProducerSender()
   * @param trackId — producer.id (для идентификации transform в логах)
   */
  setupSenderTransform(sender: RTCRtpSender, trackId: string): void {
    this.assertTransformSetupContext('setupSenderTransform');

    // H-6: BLOCKED if no encryption key — throw, do not attach transform without key
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
   * Подключить SFrame decrypt transform на inbound RTCRtpReceiver.
   * Вызывать ПОСЛЕ consume().
   *
   * Receiver можно подключать до прихода decryption key — MediaEncryptor дропнет фреймы
   * пока ключ не придёт (fail-closed в SFrame transport).
   * M-6: EpochGuard проверяет auth/room/epoch; E2EE_READY выставляется после успешного подключения transforms.
   *
   * Fail-closed: throws if browser doesn't support Insertable Streams.
   *
   * @param receiver — RTCRtpReceiver от SfuMediaManager.getConsumerReceiver()
   * @param peerId — userId или producerId отправителя
   * @param trackId — consumer.id (для идентификации)
   */
  setupReceiverTransform(receiver: RTCRtpReceiver, peerId: string, trackId: string): void {
    this.assertTransformSetupContext('setupReceiverTransform');

    const resolvedPeerId = this.resolveReceiverPeerId(peerId);
    const hasKey = this.peerDecryptionEpochs.has(resolvedPeerId);
    const knownKeys = Array.from(this.peerDecryptionEpochs.keys());
    if (!hasKey) {
      logger.warn(
        `[CallMediaEncryption] No decryption key for peer ${peerId} (resolved=${resolvedPeerId}) — frames will be dropped until key arrives. ` +
        `known peers: ${JSON.stringify(knownKeys)}`
      );
    }

    // Fail-closed: throws if browser doesn't support Insertable Streams.
    this.encryptor.setupReceiverTransform(receiver, trackId, resolvedPeerId);
    logger.debug(`[CallMediaEncryption] Receiver transform attached, peer=${peerId} resolved=${resolvedPeerId} track=${trackId}`);
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

  hasOutboundKey(): boolean {
    return this.hasEncryptionKey;
  }

  getDecryptionPeerIds(): string[] {
    return Array.from(this.peerDecryptionEpochs.keys());
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
