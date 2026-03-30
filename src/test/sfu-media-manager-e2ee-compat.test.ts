import { beforeEach, describe, expect, it, vi } from "vitest";

const transportState = vi.hoisted(() => {
  const makeProducer = () => ({
    id: "producer-1",
    closed: false,
    close: vi.fn(function(this: { closed: boolean }) {
      this.closed = true;
    }),
    on: vi.fn(),
  });

  const makeConsumer = () => ({
    id: "consumer-1",
    closed: false,
    paused: false,
    track: { id: "remote-track-1" },
    close: vi.fn(function(this: { closed: boolean }) {
      this.closed = true;
    }),
    on: vi.fn(),
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
    transportState.sendTransport.produce.mockImplementation(async () => transportState.makeProducer());
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

    expect(producer.id).toBe("producer-1");
    expect(consumer.id).toBe("consumer-1");
    expect(manager.getProducerSender("producer-1")).toBeNull();
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
});