import { Device, types as mediasoupTypes } from 'mediasoup-client';

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
  /**
   * C-3: Кешируем RTCRtpSender/Receiver при produce/consume, пока track доступен.
   * Заменяет ненадёжный доступ к internal _rtpSender/_rtpReceiver mediasoup-client.
   */
  private producerSenders: Map<string, RTCRtpSender> = new Map();
  private consumerReceivers: Map<string, RTCRtpReceiver> = new Map();

  constructor() {
    this.device = new Device();
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
      console.log(`[SfuMediaManager] sendTransport connectionstatechange: ${state}`);
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
      console.log(`[SfuMediaManager] recvTransport connectionstatechange: ${state}`);
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

    // C-3: Cache RTCRtpSender while track is still accessible after produce()
    // Accesses mediasoup-client internal _handler._pc (undocumented). If absent in a
    // future mediasoup-client version, we throw immediately rather than continue
    // without E2EE (fail-closed: no sender = no transform = plaintext media).
    try {
      const pc = (this.sendTransport as any)._handler?._pc as RTCPeerConnection | undefined;
      if (!pc) {
        throw new Error(
          `[SfuMediaManager] Cannot locate RTCPeerConnection for sendTransport — ` +
          `mediasoup-client internal API may have changed. Cannot apply E2EE transform.`
        );
      }
      const sender = pc.getSenders().find((s) => s.track === track);
      if (!sender) {
        throw new Error(
          `[SfuMediaManager] RTCRtpSender not found for producer ${producer.id} after produce() — ` +
          `E2EE transform cannot be applied. Aborting produce to prevent plaintext media.`
        );
      }
      this.producerSenders.set(producer.id, sender);
    } catch (e) {
      // Close producer immediately — fail-closed: do not transmit without E2EE
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

    // C-3: Cache RTCRtpReceiver while track is still accessible after consume()
    // SECURITY: fail-closed — if receiver cannot be found, close consumer and throw.
    // Receiving plaintext from SFU without decrypt transform is a security violation.
    try {
      const pc = (this.recvTransport as any)._handler?._pc as RTCPeerConnection | undefined;
      if (!pc) {
        throw new Error(
          `[SfuMediaManager] Cannot locate RTCPeerConnection for recvTransport — ` +
          `mediasoup-client internal API may have changed. Cannot apply E2EE decrypt transform.`
        );
      }
      const receiver = pc.getReceivers().find((r) => r.track === consumer.track);
      if (!receiver) {
        throw new Error(
          `[SfuMediaManager] RTCRtpReceiver not found for consumer ${consumer.id} — ` +
          `E2EE decrypt transform cannot be applied. Aborting consume.`
        );
      }
      this.consumerReceivers.set(consumer.id, receiver);
    } catch (e) {
      // Close consumer — fail-closed: do not receive without E2EE decrypt
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
  }
}
