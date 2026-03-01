import crypto from "node:crypto";

function uuid(prefix) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

const DEFAULT_MEDIA_CODECS = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

async function createFallbackController() {
  const rooms = new Map();

  function ensureRoom(roomId) {
    let room = rooms.get(roomId);
    if (room) return room;

    room = {
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      peerToTransportIds: new Map(),
      peerToProducerIds: new Map(),
    };
    rooms.set(roomId, room);
    return room;
  }

  return {
    mode: "fallback",

    async createRoom(roomId) {
      ensureRoom(roomId);
      return { routerRtpCapabilities: { codecs: [] } };
    },

    async closeRoom(roomId) {
      rooms.delete(roomId);
    },

    async createTransport(roomId, peerDeviceId, direction) {
      const room = ensureRoom(roomId);
      const id = uuid("tr");
      const transport = { id, peerDeviceId, direction, connected: false };
      room.transports.set(id, transport);
      const peerSet = room.peerToTransportIds.get(peerDeviceId) ?? new Set();
      peerSet.add(id);
      room.peerToTransportIds.set(peerDeviceId, peerSet);

      return {
        id,
        iceParameters: {},
        iceCandidates: [],
        dtlsParameters: {},
      };
    },

    async connectTransport(roomId, transportId) {
      const room = rooms.get(roomId);
      if (!room) throw new Error("ROOM_NOT_FOUND");
      const transport = room.transports.get(transportId);
      if (!transport) throw new Error("TRANSPORT_NOT_FOUND");
      transport.connected = true;
      return { ok: true };
    },

    async produce(roomId, peerDeviceId, transportId, kind, appData = {}) {
      const room = rooms.get(roomId);
      if (!room) throw new Error("ROOM_NOT_FOUND");
      if (!room.transports.has(transportId)) throw new Error("TRANSPORT_NOT_FOUND");

      const producerId = uuid("pr");
      room.producers.set(producerId, {
        id: producerId,
        peerDeviceId,
        transportId,
        kind,
        appData,
      });

      const peerSet = room.peerToProducerIds.get(peerDeviceId) ?? new Set();
      peerSet.add(producerId);
      room.peerToProducerIds.set(peerDeviceId, peerSet);

      return { id: producerId, kind };
    },

    async consume(roomId, peerDeviceId, producerId) {
      const room = rooms.get(roomId);
      if (!room) throw new Error("ROOM_NOT_FOUND");
      const producer = room.producers.get(producerId);
      if (!producer) throw new Error("PRODUCER_NOT_FOUND");

      const consumerId = uuid("cs");
      room.consumers.set(consumerId, {
        id: consumerId,
        peerDeviceId,
        producerId,
        kind: producer.kind,
      });

      return { id: consumerId, kind: producer.kind, rtpParameters: {} };
    },

    async removePeer(roomId, peerDeviceId) {
      const room = rooms.get(roomId);
      if (!room) return;

      const transportIds = room.peerToTransportIds.get(peerDeviceId) ?? new Set();
      transportIds.forEach((transportId) => room.transports.delete(transportId));
      room.peerToTransportIds.delete(peerDeviceId);

      const producerIds = room.peerToProducerIds.get(peerDeviceId) ?? new Set();
      producerIds.forEach((producerId) => room.producers.delete(producerId));
      room.peerToProducerIds.delete(peerDeviceId);

      for (const [consumerId, consumer] of room.consumers.entries()) {
        if (consumer.peerDeviceId === peerDeviceId || producerIds.has(consumer.producerId)) {
          room.consumers.delete(consumerId);
        }
      }
    },

    async listProducers(roomId) {
      const room = rooms.get(roomId);
      if (!room) return [];
      return Array.from(room.producers.values()).map((producer) => ({
        producerId: producer.id,
        peerDeviceId: producer.peerDeviceId,
        kind: producer.kind,
      }));
    },

    metrics() {
      let transportCount = 0;
      let producerCount = 0;
      let consumerCount = 0;
      for (const room of rooms.values()) {
        transportCount += room.transports.size;
        producerCount += room.producers.size;
        consumerCount += room.consumers.size;
      }
      return {
        mode: "fallback",
        roomCount: rooms.size,
        transportCount,
        producerCount,
        consumerCount,
        workerCount: 0,
      };
    },
  };
}

async function createMediasoupController() {
  const mediasoup = await import("mediasoup");
  const worker = await mediasoup.createWorker({
    rtcMinPort: Number(process.env.SFU_RTC_MIN_PORT ?? "40000"),
    rtcMaxPort: Number(process.env.SFU_RTC_MAX_PORT ?? "49999"),
    logLevel: process.env.SFU_MEDIASOUP_LOG_LEVEL ?? "warn",
  });

  const rooms = new Map();

  function ensureRoom(roomId) {
    let room = rooms.get(roomId);
    if (room) return room;
    room = {
      router: null,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
      peerToTransportIds: new Map(),
      peerToProducerIds: new Map(),
    };
    rooms.set(roomId, room);
    return room;
  }

  async function ensureRouter(roomId) {
    const room = ensureRoom(roomId);
    if (room.router) return room.router;

    room.router = await worker.createRouter({ mediaCodecs: DEFAULT_MEDIA_CODECS });
    return room.router;
  }

  async function createTransport(roomId, peerDeviceId, direction) {
    const room = ensureRoom(roomId);
    const router = await ensureRouter(roomId);

    const transport = await router.createWebRtcTransport({
      listenIps: [{ ip: "0.0.0.0", announcedIp: process.env.SFU_ANNOUNCED_IP || undefined }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      appData: { peerDeviceId, direction },
    });

    const peerSet = room.peerToTransportIds.get(peerDeviceId) ?? new Set();
    peerSet.add(transport.id);
    room.peerToTransportIds.set(peerDeviceId, peerSet);
    room.transports.set(transport.id, transport);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  return {
    mode: "mediasoup",

    async createRoom(roomId) {
      const router = await ensureRouter(roomId);
      return { routerRtpCapabilities: router.rtpCapabilities };
    },

    async closeRoom(roomId) {
      const room = rooms.get(roomId);
      if (!room) return;

      for (const transport of room.transports.values()) {
        transport.close();
      }
      if (room.router) room.router.close();
      rooms.delete(roomId);
    },

    createTransport,

    async connectTransport(roomId, transportId, dtlsParameters = {}) {
      const room = rooms.get(roomId);
      if (!room) throw new Error("ROOM_NOT_FOUND");
      const transport = room.transports.get(transportId);
      if (!transport) throw new Error("TRANSPORT_NOT_FOUND");
      await transport.connect({ dtlsParameters });
      return { ok: true };
    },

    async produce(roomId, peerDeviceId, transportId, kind, rtpParameters = {}, appData = {}) {
      const room = rooms.get(roomId);
      if (!room) throw new Error("ROOM_NOT_FOUND");
      const transport = room.transports.get(transportId);
      if (!transport) throw new Error("TRANSPORT_NOT_FOUND");

      const producer = await transport.produce({ kind, rtpParameters, appData });
      room.producers.set(producer.id, producer);

      const peerSet = room.peerToProducerIds.get(peerDeviceId) ?? new Set();
      peerSet.add(producer.id);
      room.peerToProducerIds.set(peerDeviceId, peerSet);

      return { id: producer.id, kind: producer.kind };
    },

    async consume(roomId, peerDeviceId, producerId, rtpCapabilities = null) {
      const room = rooms.get(roomId);
      if (!room) throw new Error("ROOM_NOT_FOUND");
      const producer = room.producers.get(producerId);
      if (!producer) throw new Error("PRODUCER_NOT_FOUND");

      const peerTransportIds = room.peerToTransportIds.get(peerDeviceId) ?? new Set();
      const recvTransport = Array.from(peerTransportIds)
        .map((id) => room.transports.get(id))
        .find((transport) => transport?.appData?.direction === "recv");

      if (!recvTransport) {
        throw new Error("RECV_TRANSPORT_NOT_FOUND");
      }

      if (!rtpCapabilities || !room.router.canConsume({ producerId, rtpCapabilities })) {
        return { id: uuid("cs"), kind: producer.kind, rtpParameters: {} };
      }

      const consumer = await recvTransport.consume({
        producerId,
        rtpCapabilities,
        paused: false,
        appData: { producerOwner: producer.appData?.peerDeviceId },
      });

      room.consumers.set(consumer.id, consumer);
      return {
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      };
    },

    async removePeer(roomId, peerDeviceId) {
      const room = rooms.get(roomId);
      if (!room) return;

      const transportIds = room.peerToTransportIds.get(peerDeviceId) ?? new Set();
      transportIds.forEach((transportId) => {
        const transport = room.transports.get(transportId);
        if (transport) transport.close();
        room.transports.delete(transportId);
      });
      room.peerToTransportIds.delete(peerDeviceId);

      const producerIds = room.peerToProducerIds.get(peerDeviceId) ?? new Set();
      producerIds.forEach((producerId) => {
        const producer = room.producers.get(producerId);
        if (producer) producer.close();
        room.producers.delete(producerId);
      });
      room.peerToProducerIds.delete(peerDeviceId);

      for (const [consumerId, consumer] of room.consumers.entries()) {
        if (producerIds.has(consumer.producerId) || consumer.appData?.peerDeviceId === peerDeviceId) {
          consumer.close();
          room.consumers.delete(consumerId);
        }
      }
    },

    async listProducers(roomId) {
      const room = rooms.get(roomId);
      if (!room) return [];
      return Array.from(room.producers.values()).map((producer) => ({
        producerId: producer.id,
        peerDeviceId: producer.appData?.peerDeviceId,
        kind: producer.kind,
      }));
    },

    metrics() {
      let transportCount = 0;
      let producerCount = 0;
      let consumerCount = 0;
      for (const room of rooms.values()) {
        transportCount += room.transports.size;
        producerCount += room.producers.size;
        consumerCount += room.consumers.size;
      }
      return {
        mode: "mediasoup",
        roomCount: rooms.size,
        transportCount,
        producerCount,
        consumerCount,
        workerCount: 1,
      };
    },
  };
}

export async function createMediaPlaneController(options = {}) {
  const requireMediasoup = options?.requireMediasoup === true;
  const enableMediasoup = process.env.SFU_ENABLE_MEDIASOUP === "1";
  if (!enableMediasoup) {
    if (requireMediasoup) {
      throw new Error("SFU mediasoup is required in this environment, but SFU_ENABLE_MEDIASOUP is not enabled");
    }
    return createFallbackController();
  }

  try {
    return await createMediasoupController();
  } catch (error) {
    if (requireMediasoup) {
      throw error;
    }
    console.warn("[sfu] mediasoup unavailable, falling back to control-plane mode", error?.message ?? error);
    return createFallbackController();
  }
}
