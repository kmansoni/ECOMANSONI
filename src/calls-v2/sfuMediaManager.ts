import { Device, types as mediasoupTypes } from 'mediasoup-client';
import { logger } from '@/lib/logger';
import {
  RelayStatsCollector,
  extractRelayMetrics,
  type RelayMetrics,
  type RelaySelectionEvent,
} from './relayStats';

/**
 * SFU Media Manager — управляет mediasoup-client Device lifecycle.
 *
 * Lifecycle:
 * 1. loadDevice(routerRtpCapabilities) — после ROOM_JOIN_OK
 * 2. createSendTransport(transportOptions) — после TRANSPORT_CREATED (direction: send)
 * 3. createRecvTransport(transportOptions) — после TRANSPORT_CREATED (direction: recv)
 * 4. produce(track) → { producerId, rtpParameters }
 * 5. consume(consumeOptions) → { consumer, track }
 * 6. close() — cleanup
 */
export class SfuMediaManager {
  private device: Device;
  private sendTransport: mediasoupTypes.Transport | null = null;
  private recvTransport: mediasoupTypes.Transport | null = null;
  private producers: Map<string, mediasoupTypes.Producer> = new Map();
  private consumers: Map<string, mediasoupTypes.Consumer> = new Map();
  private readonly requireSenderReceiverAccessForE2ee: boolean;
  /**
   * C-3: Кешируем RTCRtpSender/Receiver при produce/consume, пока track доступен.
   * Заменяет ненадёжный доступ к internal _rtpSender/_rtpReceiver mediasoup-client.
   */
  private producerSenders: Map<string, RTCRtpSender> = new Map();
  private consumerReceivers: Map<string, RTCRtpReceiver> = new Map();
  private relayStatsCollector = new RelayStatsCollector({ maxHistorySize: 120 });
  private lastRelayRoute: "none" | "p2p" | "relay" = "none";

  constructor(options?: { requireSenderReceiverAccessForE2ee?: boolean }) {
    this.device = new Device();
    this.requireSenderReceiverAccessForE2ee = options?.requireSenderReceiverAccessForE2ee ?? false;
  }

  private async collectRelaySampleFromTransport(
    transport: mediasoupTypes.Transport | null,
  ): Promise<RelaySelectionEvent | null> {
    if (!transport) return null;
    try {
      const stats = await transport.getStats();
      const sample = extractRelayMetrics(stats as unknown as Iterable<[string, Record<string, unknown>]>);
      if (sample) {
        this.relayStatsCollector.recordSample(sample);
      }
      return sample;
    } catch (error) {
      logger.warn('[SfuMediaManager] relay stats sample failed', error);
      return null;
    }
  }

  async sampleRelayMetrics(): Promise<{ send: RelaySelectionEvent | null; recv: RelaySelectionEvent | null; aggregate: RelayMetrics } | null> {
    if (!this.sendTransport && !this.recvTransport) return null;

    const [send, recv] = await Promise.all([
      this.collectRelaySampleFromTransport(this.sendTransport),
      this.collectRelaySampleFromTransport(this.recvTransport),
    ]);

    const aggregate = this.relayStatsCollector.getMetrics();
    const usesRelay = !!send?.isRelaySelected || !!recv?.isRelaySelected;
    const nextRoute = usesRelay ? "relay" : "p2p";

    if (nextRoute !== this.lastRelayRoute) {
      this.lastRelayRoute = nextRoute;
      logger.info('[SfuMediaManager] media route changed', {
        route: nextRoute,
        relayFallbackCount: aggregate.relay_fallback_count,
        relayUsageRate: aggregate.relay_usage_rate,
        totalSamples: aggregate.total_samples,
      });
    }

    return { send, recv, aggregate };
  }

  getRelayMetrics(): RelayMetrics {
    return this.relayStatsCollector.getMetrics();
  }

  get loaded(): boolean {
    return this.device.loaded;
  }

  get rtpCapabilities(): mediasoupTypes.RtpCapabilities | null {
    return this.device.loaded ? this.device.rtpCapabilities : null;
  }

  /**
   * Загрузить Device с routerRtpCapabilities от сервера.
   * Вызывать после получения ROOM_JOIN_OK.
   */
  async loadDevice(routerRtpCapabilities: mediasoupTypes.RtpCapabilities): Promise<void> {
    if (!this.device.loaded) {
      await this.device.load({ routerRtpCapabilities });
    }
  }

  /**
   * Создать send transport.
   * @param options — iceParameters, iceCandidates, dtlsParameters из TRANSPORT_CREATED
   * @param onConnect — callback для отправки TRANSPORT_CONNECT с реальными dtlsParameters
   * @param onProduce — callback для отправки PRODUCE с реальными rtpParameters
   */
  createSendTransport(
    options: {
      id: string;
      iceParameters: mediasoupTypes.IceParameters;
      iceCandidates: mediasoupTypes.IceCandidate[];
      dtlsParameters: mediasoupTypes.DtlsParameters;
      iceServers?: RTCIceServer[];
    },
    onConnect: (dtlsParameters: mediasoupTypes.DtlsParameters) => Promise<void>,
    onProduce: (params: {
      kind: mediasoupTypes.MediaKind;
      rtpParameters: mediasoupTypes.RtpParameters;
      appData: Record<string, unknown>;
    }) => Promise<string>
  ): mediasoupTypes.Transport {
    this.sendTransport = this.device.createSendTransport({
      id: options.id,
      iceParameters: options.iceParameters,
      iceCandidates: options.iceCandidates,
      dtlsParameters: options.dtlsParameters,
      ...(options.iceServers && options.iceServers.length > 0 ? { iceServers: options.iceServers } : {}),
    });

    this.sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      onConnect(dtlsParameters)
        .then(callback)
        .catch(errback);
    });

    this.sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
      onProduce({ kind, rtpParameters, appData })
        .then((producerId) => callback({ id: producerId }))
        .catch(errback);
    });

    this.sendTransport.on('connectionstatechange', (state: string) => {
      logger.debug(`[SfuMediaManager] sendTransport connectionstatechange: ${state}`);
      if (state === 'failed') {
        this.sendTransport?.close();
      }
    });

    return this.sendTransport;
  }

  /**
   * Создать recv transport.
   * @param options — параметры из TRANSPORT_CREATED
   * @param onConnect — callback для отправки TRANSPORT_CONNECT
   */
  createRecvTransport(
    options: {
      id: string;
      iceParameters: mediasoupTypes.IceParameters;
      iceCandidates: mediasoupTypes.IceCandidate[];
      dtlsParameters: mediasoupTypes.DtlsParameters;
      iceServers?: RTCIceServer[];
    },
    onConnect: (dtlsParameters: mediasoupTypes.DtlsParameters) => Promise<void>
  ): mediasoupTypes.Transport {
    this.recvTransport = this.device.createRecvTransport({
      id: options.id,
      iceParameters: options.iceParameters,
      iceCandidates: options.iceCandidates,
      dtlsParameters: options.dtlsParameters,
      ...(options.iceServers && options.iceServers.length > 0 ? { iceServers: options.iceServers } : {}),
    });

    this.recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
      onConnect(dtlsParameters)
        .then(callback)
        .catch(errback);
    });

    this.recvTransport.on('connectionstatechange', (state: string) => {
      logger.debug(`[SfuMediaManager] recvTransport connectionstatechange: ${state}`);
      if (state === 'failed') {
        this.recvTransport?.close();
      }
    });

    return this.recvTransport;
  }

  /**
   * Produce a track через sendTransport.
   * Вернёт producer, rtpParameters передаются через onProduce callback.
   */
  async produce(
    track: MediaStreamTrack,
    appData?: Record<string, unknown>
  ): Promise<mediasoupTypes.Producer> {
    if (!this.sendTransport) {
      throw new Error('sendTransport not created. Call createSendTransport first.');
    }

    const producer = await this.sendTransport.produce({
      track,
      appData: appData || {},
    });

    this.producers.set(producer.id, producer);

    // C-3: Cache RTCRtpSender for Insertable Streams E2EE.
    // Uses public producer.rtpSender API (mediasoup-client ≥3.6) instead of private _handler._pc.
    try {
      const sender = producer.rtpSender;
      if (!sender) {
        const error = new Error(
          `[SfuMediaManager] producer.rtpSender is undefined for ${producer.id} — ` +
          `E2EE transform cannot be applied. Aborting produce to prevent plaintext media.`
        );
        if (this.requireSenderReceiverAccessForE2ee) throw error;
        logger.warn(error.message);
        return producer;
      }
      this.producerSenders.set(producer.id, sender);
    } catch (e) {
      // Close producer immediately only in strict E2EE mode.
      if (!this.requireSenderReceiverAccessForE2ee) {
        logger.warn('[SfuMediaManager] Sender cache unavailable; continuing without E2EE transform', e);
        return producer;
      }
      if (!producer.closed) producer.close();
      this.producers.delete(producer.id);
      throw e;
    }

    producer.on('transportclose', () => {
      this.producers.delete(producer.id);
      this.producerSenders.delete(producer.id);
    });

    return producer;
  }

  /**
   * Consume a remote producer через recvTransport.
   * @param options — id, producerId, kind, rtpParameters из CONSUMED event
   */
  async consume(options: {
    id: string;
    producerId: string;
    kind: mediasoupTypes.MediaKind;
    rtpParameters: mediasoupTypes.RtpParameters;
  }): Promise<mediasoupTypes.Consumer> {
    if (!this.recvTransport) {
      throw new Error('recvTransport not created. Call createRecvTransport first.');
    }

    const consumer = await this.recvTransport.consume({
      id: options.id,
      producerId: options.producerId,
      kind: options.kind,
      rtpParameters: options.rtpParameters,
    });

    this.consumers.set(consumer.id, consumer);

    // C-3: Cache RTCRtpReceiver for Insertable Streams E2EE.
    // Uses public consumer.rtpReceiver API (mediasoup-client ≥3.6) instead of private _handler._pc.
    try {
      const receiver = consumer.rtpReceiver;
      if (!receiver) {
        const error = new Error(
          `[SfuMediaManager] consumer.rtpReceiver is undefined for ${consumer.id} — ` +
          `E2EE decrypt transform cannot be applied. Aborting consume.`
        );
        if (this.requireSenderReceiverAccessForE2ee) throw error;
        logger.warn(error.message);
        return consumer;
      }
      this.consumerReceivers.set(consumer.id, receiver);
    } catch (e) {
      // Close consumer immediately only in strict E2EE mode.
      if (!this.requireSenderReceiverAccessForE2ee) {
        logger.warn('[SfuMediaManager] Receiver cache unavailable; continuing without E2EE transform', e);
        return consumer;
      }
      if (!consumer.closed) consumer.close();
      this.consumers.delete(consumer.id);
      throw e;
    }

    consumer.on('transportclose', () => {
      this.consumers.delete(consumer.id);
      this.consumerReceivers.delete(consumer.id);
    });

    return consumer;
  }

  /** Получить remote track от consumer */
  getConsumerTrack(consumerId: string): MediaStreamTrack | null {
    const consumer = this.consumers.get(consumerId);
    return consumer?.track ?? null;
  }

  /** Получить все remote tracks */
  getAllRemoteTracks(): MediaStreamTrack[] {
    return Array.from(this.consumers.values())
      .filter((c) => !c.closed)
      .map((c) => c.track);
  }

  /** Resume consumer (после начального paused состояния) */
  async resumeConsumer(consumerId: string): Promise<void> {
    const consumer = this.consumers.get(consumerId);
    if (consumer && consumer.paused) {
      await consumer.resume();
    }
  }

  /**
   * C-3: Получить RTCRtpSender для Insertable Streams (E2EE).
   * Использует кешированный sender из produce() — не зависит от internal API mediasoup-client.
   */
  getProducerSender(producerId: string): RTCRtpSender | null {
    return this.producerSenders.get(producerId) ?? null;
  }

  /**
   * C-3: Получить RTCRtpReceiver для Insertable Streams (E2EE).
   * Использует кешированный receiver из consume() — не зависит от internal API mediasoup-client.
   */
  getConsumerReceiver(consumerId: string): RTCRtpReceiver | null {
    return this.consumerReceivers.get(consumerId) ?? null;
  }

  /**
   * Закрыть конкретный producer и вернуть его MediaStreamTrack (для recovery).
   * Track можно использовать для повторного produce().
   */
  closeProducer(producerId: string): MediaStreamTrack | null {
    const producer = this.producers.get(producerId);
    if (!producer) return null;
    const track = producer.track ?? null;
    if (!producer.closed) producer.close();
    this.producers.delete(producerId);
    this.producerSenders.delete(producerId);
    return track;
  }

  /**
   * Закрыть конкретный consumer (для recovery — перед повторным consume).
   */
  closeConsumer(consumerId: string): void {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) return;
    if (!consumer.closed) consumer.close();
    this.consumers.delete(consumerId);
    this.consumerReceivers.delete(consumerId);
  }

  /** Закрыть всё и освободить ресурсы. */
  close(): void {
    for (const producer of this.producers.values()) {
      if (!producer.closed) producer.close();
    }
    this.producers.clear();
    this.producerSenders.clear(); // C-3: cleanup cached senders

    for (const consumer of this.consumers.values()) {
      if (!consumer.closed) consumer.close();
    }
    this.consumers.clear();
    this.consumerReceivers.clear(); // C-3: cleanup cached receivers

    if (this.sendTransport && !this.sendTransport.closed) {
      this.sendTransport.close();
    }
    this.sendTransport = null;

    if (this.recvTransport && !this.recvTransport.closed) {
      this.recvTransport.close();
    }
    this.recvTransport = null;

    this.relayStatsCollector.reset();
    this.lastRelayRoute = "none";
  }
}
