import { beforeEach, describe, expect, it, vi } from "vitest";

const transportState = vi.hoisted(() => {
  const makeTrack = (id: string, kind: "audio" | "video", readyState: MediaStreamTrackState = "live") => ({
    id,
    kind,
    readyState,
    enabled: true,
    stop: vi.fn(),
  });

  const makeProducer = (overrides: Record<string, unknown> = {}) => ({
    id: "producer-1",
    kind: "video",
    track: makeTrack("local-video-1", "video"),
    closed: false,
    close: vi.fn(function(this: { closed: boolean }) {
      this.closed = true;
    }),
    replaceTrack: vi.fn(async function(
      this: { track: unknown },
      { track }: { track: MediaStreamTrack },
    ) {
      this.track = track;
    }),
    on: vi.fn(),
    ...overrides,
  });

  const makeConsumer = (overrides: Record<string, unknown> = {}) => ({
    id: "consumer-1",
    closed: false,
    paused: false,
    track: makeTrack("remote-track-1", "audio"),
    close: vi.fn(function(this: { closed: boolean }) {
      this.closed = true;
    }),
    on: vi.fn(),
    ...overrides,
  });

  return {
    sendTransport: {
      _handler: {},
      closed: false,
      on: vi.fn(),
      close: vi.fn(),
      produce: vi.fn(),
    },
    recvTransport: {
      _handler: {},
      closed: false,
      on: vi.fn(),
      close: vi.fn(),
      consume: vi.fn(),
    },
    makeProducer,
    makeConsumer,
    makeTrack,
  };
});

vi.mock("mediasoup-client", () => {
  class Device {
    loaded = false;
    rtpCapabilities: unknown = null;

    async load({ routerRtpCapabilities }: { routerRtpCapabilities: unknown }) {
      this.loaded = true;
      this.rtpCapabilities = routerRtpCapabilities;
    }

    createSendTransport() {
      return transportState.sendTransport;
    }

    createRecvTransport() {
      return transportState.recvTransport;
    }
  }

  return {
    Device,
    types: {},
  };
});

describe("SfuMediaManager E2EE compatibility", () => {
  beforeEach(() => {
    transportState.sendTransport.on.mockReset();
    transportState.sendTransport.close.mockReset();
    transportState.recvTransport.on.mockReset();
    transportState.recvTransport.close.mockReset();
    transportState.sendTransport._handler = {};
    transportState.recvTransport._handler = {};
    transportState.sendTransport.produce.mockImplementation(async (options?: { appData?: Record<string, unknown> }) => (
      transportState.makeProducer({ id: String(options?.appData?.clientProducerId ?? "producer-1"), appData: options?.appData })
    ));
    transportState.recvTransport.consume.mockImplementation(async () => transportState.makeConsumer());
  });

  it("continues produce/consume when sender/receiver internals are unavailable and E2EE transforms are disabled", async () => {
    const { SfuMediaManager } = await import("@/calls-v2/sfuMediaManager");
    const manager = new SfuMediaManager({ requireSenderReceiverAccessForE2ee: false });

    await manager.loadDevice({ codecs: [{ mimeType: "audio/opus" }] } as never);
    manager.createSendTransport(
      { id: "send-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
      async () => "producer-1",
    );
    manager.createRecvTransport(
      { id: "recv-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
    );

    const producer = await manager.produce({ id: "local-track-1" } as MediaStreamTrack);
    const consumer = await manager.consume({
      id: "consumer-1",
      producerId: "producer-1",
      kind: "audio" as never,
      rtpParameters: {} as never,
    });

    expect(producer.id).toMatch(/^pr_/);
    expect(consumer.id).toBe("consumer-1");
    expect(manager.getProducerSender(producer.id)).toBeNull();
    expect(manager.getConsumerReceiver("consumer-1")).toBeNull();
  });

  it("keeps strict fail-closed behavior when E2EE transforms are required", async () => {
    const { SfuMediaManager } = await import("@/calls-v2/sfuMediaManager");
    const manager = new SfuMediaManager({ requireSenderReceiverAccessForE2ee: true });

    await manager.loadDevice({ codecs: [{ mimeType: "audio/opus" }] } as never);
    manager.createSendTransport(
      { id: "send-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
      async () => "producer-1",
    );

    await expect(manager.produce({ id: "local-track-1" } as MediaStreamTrack)).rejects.toThrow(
      /E2EE transform cannot be applied/
    );
  });

  it("captures sender and receiver via onRtpSender/onRtpReceiver callbacks", async () => {
    const sender = { id: "sender-1" } as unknown as RTCRtpSender;
    const receiver = { id: "receiver-1" } as unknown as RTCRtpReceiver;

    transportState.sendTransport.produce.mockImplementationOnce(async (options?: { onRtpSender?: (rtpSender: RTCRtpSender) => void; appData?: Record<string, unknown> }) => {
      options?.onRtpSender?.(sender);
      return {
        ...transportState.makeProducer({ id: String(options?.appData?.clientProducerId ?? "producer-1") }),
        rtpSender: undefined,
      };
    });

    transportState.recvTransport.consume.mockImplementationOnce(async (options?: { onRtpReceiver?: (rtpReceiver: RTCRtpReceiver) => void }) => {
      options?.onRtpReceiver?.(receiver);
      return {
        ...transportState.makeConsumer(),
        rtpReceiver: undefined,
      };
    });

    const { SfuMediaManager } = await import("@/calls-v2/sfuMediaManager");
    const manager = new SfuMediaManager({ requireSenderReceiverAccessForE2ee: true });

    await manager.loadDevice({ codecs: [{ mimeType: "audio/opus" }] } as never);
    manager.createSendTransport(
      { id: "send-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
      async () => "producer-1",
    );
    manager.createRecvTransport(
      { id: "recv-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
    );

    const producer = await manager.produce({ id: "local-track-1" } as MediaStreamTrack);
    const consumer = await manager.consume({
      id: "consumer-1",
      producerId: "producer-1",
      kind: "audio" as never,
      rtpParameters: {} as never,
    });

    expect(producer.id).toMatch(/^pr_/);
    expect(consumer.id).toBe("consumer-1");
    expect(manager.getProducerSender(producer.id)).toBe(sender);
    expect(manager.getConsumerReceiver("consumer-1")).toBe(receiver);
  });

  it("returns only live unpaused remote tracks", async () => {
    const remoteConsumers = [
      transportState.makeConsumer({ id: "live-audio", track: transportState.makeTrack("audio-live", "audio") }),
      transportState.makeConsumer({ id: "ended-video", track: transportState.makeTrack("video-ended", "video", "ended") }),
      transportState.makeConsumer({ id: "paused-audio", paused: true, track: transportState.makeTrack("audio-paused", "audio") }),
      transportState.makeConsumer({ id: "closed-video", closed: true, track: transportState.makeTrack("video-closed", "video") }),
    ];
    transportState.recvTransport.consume.mockImplementation(async () => remoteConsumers.shift());

    const { SfuMediaManager } = await import("@/calls-v2/sfuMediaManager");
    const manager = new SfuMediaManager({ requireSenderReceiverAccessForE2ee: false });

    await manager.loadDevice({ codecs: [{ mimeType: "audio/opus" }] } as never);
    manager.createRecvTransport(
      { id: "recv-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
    );

    for (const id of ["live-audio", "ended-video", "paused-audio", "closed-video"]) {
      await manager.consume({
        id,
        producerId: "producer-1",
        kind: "audio" as never,
        rtpParameters: {} as never,
      });
    }

    expect(manager.getAllRemoteTracks().map(track => track.id)).toEqual(["audio-live"]);
  });

  it("keeps source metadata for remote camera and screen tracks", async () => {
    const cameraTrack = transportState.makeTrack("camera-remote", "video");
    const screenTrack = transportState.makeTrack("screen-remote", "video");
    const remoteConsumers = [
      transportState.makeConsumer({ id: "camera-consumer", track: cameraTrack }),
      transportState.makeConsumer({ id: "screen-consumer", track: screenTrack }),
    ];
    transportState.recvTransport.consume.mockImplementation(async () => remoteConsumers.shift());

    const { SfuMediaManager } = await import("@/calls-v2/sfuMediaManager");
    const manager = new SfuMediaManager({ requireSenderReceiverAccessForE2ee: false });

    await manager.loadDevice({ codecs: [{ mimeType: "video/VP8" }] } as never);
    manager.createRecvTransport(
      { id: "recv-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
    );

    await manager.consume({
      id: "camera-consumer",
      producerId: "producer-camera",
      kind: "video" as never,
      rtpParameters: {} as never,
      source: "camera",
    });
    await manager.consume({
      id: "screen-consumer",
      producerId: "producer-screen",
      kind: "video" as never,
      rtpParameters: {} as never,
      source: "screen",
    });

    expect(manager.getRemoteTrackSource(cameraTrack as unknown as MediaStreamTrack)).toBe("camera");
    expect(manager.getRemoteTrackSource(screenTrack as unknown as MediaStreamTrack)).toBe("screen");
  });

  it("exposes producer appData copy for recovery", async () => {
    transportState.sendTransport.produce.mockImplementationOnce(async (options?: { appData?: Record<string, unknown> }) => (
      transportState.makeProducer({ id: String(options?.appData?.clientProducerId ?? "producer-screen"), appData: options?.appData })
    ));

    const { SfuMediaManager } = await import("@/calls-v2/sfuMediaManager");
    const manager = new SfuMediaManager({ requireSenderReceiverAccessForE2ee: false });

    await manager.loadDevice({ codecs: [{ mimeType: "video/VP8" }] } as never);
    manager.createSendTransport(
      { id: "send-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
      async () => "producer-screen",
    );

    const producer = await manager.produce(
      transportState.makeTrack("screen-track", "video") as unknown as MediaStreamTrack,
      { trackId: "screen-track", source: "screen" },
    );

    const appData = manager.getProducerAppData(producer.id);
    expect(appData).toEqual({ trackId: "screen-track", source: "screen" });

    if (appData) appData.source = "camera";
    expect(manager.getProducerAppData(producer.id)).toEqual({ trackId: "screen-track", source: "screen" });
  });

  it("rejects replaceProducerTrack for dead tracks and kind mismatches", async () => {
    const producer = transportState.makeProducer({ id: "producer-video" });
    transportState.sendTransport.produce.mockImplementationOnce(async (options?: { appData?: Record<string, unknown> }) => (
      transportState.makeProducer({
        id: String(options?.appData?.clientProducerId ?? "producer-video"),
        replaceTrack: producer.replaceTrack,
      })
    ));

    const { SfuMediaManager } = await import("@/calls-v2/sfuMediaManager");
    const manager = new SfuMediaManager({ requireSenderReceiverAccessForE2ee: false });

    await manager.loadDevice({ codecs: [{ mimeType: "video/VP8" }] } as never);
    manager.createSendTransport(
      { id: "send-1", iceParameters: {} as never, iceCandidates: [], dtlsParameters: {} as never },
      async () => undefined,
      async () => "producer-video",
    );

    const createdProducer = await manager.produce(transportState.makeTrack("camera-1", "video") as unknown as MediaStreamTrack);

    await expect(
      manager.replaceProducerTrack(createdProducer.id, transportState.makeTrack("camera-ended", "video", "ended") as unknown as MediaStreamTrack),
    ).rejects.toThrow(/expected live/);
    await expect(
      manager.replaceProducerTrack(createdProducer.id, transportState.makeTrack("mic-1", "audio") as unknown as MediaStreamTrack),
    ).rejects.toThrow(/cannot replace video producer with audio track/);

    const nextTrack = transportState.makeTrack("camera-2", "video") as unknown as MediaStreamTrack;
    await manager.replaceProducerTrack(createdProducer.id, nextTrack);

    expect(producer.replaceTrack).toHaveBeenCalledTimes(1);
    expect(producer.replaceTrack).toHaveBeenCalledWith({ track: nextTrack });
  });
});