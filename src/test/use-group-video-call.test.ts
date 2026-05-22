import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const sfuMockState = vi.hoisted(() => ({
  loadDevice: vi.fn(),
  createSendTransport: vi.fn(),
  createRecvTransport: vi.fn(),
  produce: vi.fn(),
  consume: vi.fn(),
  resumeConsumer: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@/calls-v2/sfuMediaManager", () => {
  class SfuMediaManager {
    get rtpCapabilities() {
      return {
        codecs: [{ mimeType: "audio/opus", clockRate: 48000 }],
      };
    }

    async loadDevice(...args: unknown[]) {
      sfuMockState.loadDevice(...args);
    }

    createSendTransport(...args: unknown[]) {
      sfuMockState.createSendTransport(...args);
      return {};
    }

    createRecvTransport(...args: unknown[]) {
      sfuMockState.createRecvTransport(...args);
      return {};
    }

    async produce(...args: unknown[]) {
      sfuMockState.produce(...args);
      return { id: "producer-local-video-1" };
    }

    async consume(...args: unknown[]) {
      sfuMockState.consume(...args);
      const track = {
        id: "remote-video-1",
        kind: "video",
        enabled: true,
        readyState: "live",
        stop: vi.fn(),
        clone: vi.fn(function clone() {
          return { ...this };
        }),
      } as unknown as MediaStreamTrack;
      return { id: "consumer-1", track };
    }

    async resumeConsumer(...args: unknown[]) {
      sfuMockState.resumeConsumer(...args);
    }

    close() {
      sfuMockState.close();
    }
  }

  return { SfuMediaManager };
});

class TestMediaStream {
  private audioTracks: MediaStreamTrack[];
  private videoTracks: MediaStreamTrack[];

  constructor({ audio = 0, video = 1 }: { audio?: number; video?: number } = {}) {
    this.audioTracks = Array.from({ length: audio }, (_, idx) => ({
      id: `audio-${idx}`,
      kind: "audio",
      enabled: true,
      readyState: "live",
      stop: vi.fn(),
    })) as unknown as MediaStreamTrack[];
    this.videoTracks = Array.from({ length: video }, (_, idx) => ({
      id: `video-${idx}`,
      kind: "video",
      enabled: true,
      readyState: "live",
      stop: vi.fn(),
    })) as unknown as MediaStreamTrack[];
  }

  getTracks() {
    return [...this.audioTracks, ...this.videoTracks];
  }

  getAudioTracks() {
    return [...this.audioTracks];
  }

  getVideoTracks() {
    return [...this.videoTracks];
  }

  addTrack(track: MediaStreamTrack) {
    if (track.kind === "audio") {
      this.audioTracks = [...this.audioTracks, track];
      return;
    }
    if (track.kind === "video") {
      this.videoTracks = [...this.videoTracks, track];
    }
  }

  removeTrack(track: MediaStreamTrack) {
    if (track.kind === "audio") {
      this.audioTracks = this.audioTracks.filter((item) => item !== track);
      return;
    }
    if (track.kind === "video") {
      this.videoTracks = this.videoTracks.filter((item) => item !== track);
    }
  }
}

function makeScreenTrack(id: string) {
  return {
    id,
    kind: "video",
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
    onended: null as null | (() => void),
  } as unknown as MediaStreamTrack;
}

function makeScreenStream(track: MediaStreamTrack) {
  return {
    getTracks: () => [track],
    getAudioTracks: () => [],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
}

const authState = { user: { id: "u-group-test" } as null | { id: string } };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: authState.user }) }));

const channelMock = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockResolvedValue(undefined),
  track: vi.fn(),
  untrack: vi.fn(),
  presenceState: vi.fn(() => ({})),
};

const supabaseMock = {
  channel: vi.fn(() => channelMock),
  removeChannel: vi.fn(),
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "token-123" } } }),
  },
  functions: {
    invoke: vi.fn(),
  },
};

vi.mock("@/integrations/supabase/client", () => ({ supabase: supabaseMock }));

type OpenHandler = ((event: Event) => void) | null;

class InstantOpenWebSocket {
  static OPEN = 1;
  static instances: InstantOpenWebSocket[] = [];

  readyState = InstantOpenWebSocket.OPEN;
  sent: string[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  private _onopen: OpenHandler = null;

  constructor(public readonly url: string) {
    InstantOpenWebSocket.instances.push(this);
  }

  set onopen(handler: OpenHandler) {
    this._onopen = handler;
    if (handler) {
      queueMicrotask(() => {
        handler(new Event("open"));
      });
    }
  }

  get onopen() {
    return this._onopen;
  }

  send(data: string) {
    this.sent.push(data);

    try {
      const parsed = JSON.parse(data) as { type?: string; payload?: { roomId?: string; direction?: string } };
      if (parsed.type === "AUTH") {
        this.onmessage?.({
          data: {
            v: 1,
            type: "AUTH_OK",
            msgId: "auth-ok-test",
            ts: Date.now(),
            payload: {},
          },
        } as unknown as MessageEvent);
      }
      if (parsed.type === "ROOM_JOIN") {
        this.onmessage?.({
          data: {
            v: 1,
            type: "ROOM_JOIN_OK",
            msgId: "room-join-ok-test",
            ts: Date.now(),
            payload: {
              roomId: parsed.payload?.roomId,
              mediasoup: {
                routerRtpCapabilities: {
                  codecs: [
                    { mimeType: "audio/opus", kind: "audio", clockRate: 48000, channels: 2 },
                    { mimeType: "video/VP8", kind: "video", clockRate: 90000 },
                  ],
                },
              },
            },
          },
        } as unknown as MessageEvent);
      }
      if (parsed.type === "TRANSPORT_CREATE") {
        this.onmessage?.({
          data: {
            v: 1,
            type: "TRANSPORT_CREATED",
            msgId: `transport-created-${parsed.payload?.direction ?? "send"}`,
            ts: Date.now(),
            payload: {
              roomId: parsed.payload?.roomId,
              direction: parsed.payload?.direction ?? "send",
              transportId: `transport-${parsed.payload?.direction ?? "send"}`,
              iceParameters: {
                usernameFragment: "ufrag",
                password: "pwd",
                iceLite: false,
              },
              iceCandidates: [],
              dtlsParameters: {
                role: "auto",
                fingerprints: [
                  { algorithm: "sha-256", value: "00:11" },
                ],
              },
            },
          },
        } as unknown as MessageEvent);
      }
    } catch {
      // ignore malformed test payloads
    }
  }

  close() {
    this.readyState = 3;
  }
}

describe("useGroupVideoCall", () => {
  let acquiredStream: TestMediaStream;

  beforeEach(() => {
    vi.clearAllMocks();
    sfuMockState.loadDevice.mockReset();
    sfuMockState.createSendTransport.mockReset();
    sfuMockState.createRecvTransport.mockReset();
    sfuMockState.produce.mockReset();
    sfuMockState.consume.mockReset();
    sfuMockState.resumeConsumer.mockReset();
    sfuMockState.close.mockReset();
    authState.user = { id: "u-group-test" };
    InstantOpenWebSocket.instances = [];
    acquiredStream = new TestMediaStream({ audio: 0, video: 1 });
    Object.defineProperty(globalThis, "MediaStream", {
      configurable: true,
      value: TestMediaStream,
    });
    const defaultScreenTrack = makeScreenTrack("screen-default");
    const defaultScreenStream = makeScreenStream(defaultScreenTrack);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(acquiredStream),
        getDisplayMedia: vi.fn().mockResolvedValue(defaultScreenStream),
      },
    });
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      value: InstantOpenWebSocket,
    });
  });

  it("sends calls-v2 HELLO/AUTH/ROOM_JOIN envelopes when socket opens immediately", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-race-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    expect(result.current.isJoined).toBe(true);
    expect(InstantOpenWebSocket.instances.length).toBe(1);

    const sent = InstantOpenWebSocket.instances[0].sent.map((raw) => JSON.parse(raw) as {
      v?: number;
      type?: string;
      seq?: number;
      msgId?: string;
      ts?: number;
      payload?: { roomId?: string; accessToken?: string };
    });

    expect(sent.some((msg) => msg.v === 1 && msg.type === "HELLO" && typeof msg.seq === "number")).toBe(true);
    expect(sent.some((msg) => msg.type === "AUTH" && msg.payload?.accessToken === "token-123")).toBe(true);
    expect(sent.some((msg) => msg.type === "ROOM_JOIN" && msg.payload?.roomId === "room-race-1")).toBe(true);
  });

  it("consumes remote producer and upserts participant stream from CONSUMER_ADDED", async () => {
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: class RTCPeerConnectionMock {},
    });

    try {
      const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
      const { result } = renderHook(() => useGroupVideoCall("room-media-1"));

      await act(async () => {
        await result.current.joinCall();
      });

      const ws = InstantOpenWebSocket.instances[0];

      act(() => {
        ws.onmessage?.({
          data: {
            v: 1,
            type: "PRODUCER_ADDED",
            payload: {
              roomId: "room-media-1",
              producerId: "producer-remote-1",
              peerDeviceId: "peer-device-1",
            },
          },
        } as unknown as MessageEvent);
      });

      act(() => {
        ws.onmessage?.({
          data: {
            v: 1,
            type: "CONSUMER_ADDED",
            payload: {
              roomId: "room-media-1",
              consumerId: "consumer-1",
              producerId: "producer-remote-1",
              kind: "video",
              rtpParameters: { codecs: [] },
              peerId: "peer-user-1:peer-device-1",
            },
          },
        } as unknown as MessageEvent);
      });

      await act(async () => {
        await Promise.resolve();
      });

      const participant = result.current.participants.find((p) => p.id === "peer-user-1") ?? null;
      expect(participant).not.toBeNull();
      expect(participant?.stream).not.toBeNull();
      expect(participant?.isCameraOff).toBe(false);

      const sent = ws.sent.map((raw) => JSON.parse(raw) as { type?: string; payload?: { producerId?: string; consumerId?: string } });
      expect(sent.some((msg) => msg.type === "CONSUME" && msg.payload?.producerId === "producer-remote-1")).toBe(true);
      expect(sent.some((msg) => msg.type === "CONSUMER_RESUME" && msg.payload?.consumerId === "consumer-1")).toBe(true);
      expect(sfuMockState.consume).toHaveBeenCalled();
      expect(sfuMockState.resumeConsumer).toHaveBeenCalledWith("consumer-1");
    } finally {
      Reflect.deleteProperty(globalThis, "RTCPeerConnection");
    }
  });

  it("cleans local runtime when socket closes unexpectedly", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-close-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    expect(result.current.isJoined).toBe(true);
    expect(result.current.localStream).not.toBeNull();

    const ws = InstantOpenWebSocket.instances[0];
    await act(async () => {
      ws.onclose?.(new Event("close") as unknown as CloseEvent);
    });

    expect(result.current.isJoined).toBe(false);
    expect(result.current.localStream).toBeNull();
    expect(result.current.screenStream).toBeNull();
    expect(result.current.error).toBe("Соединение с сервером звонков разорвано");
    expect(supabaseMock.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("keeps error empty on manual leave", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-leave-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    act(() => {
      result.current.leaveCall();
    });

    expect(result.current.isJoined).toBe(false);
    expect(result.current.localStream).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("syncs participant stream into participants state on participant-stream message", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-stream-sync-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    const ws = InstantOpenWebSocket.instances[0];
    const incomingStream = new TestMediaStream({ audio: 1, video: 1 }) as unknown as MediaStream;

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-stream",
          participantId: "peer-stream-1",
          stream: incomingStream,
        },
      } as unknown as MessageEvent);
    });

    const participant = result.current.participants.find((p) => p.id === "peer-stream-1") ?? null;
    expect(participant).not.toBeNull();
    expect(participant?.stream).toBe(incomingStream);
    expect(participant?.isCameraOff).toBe(false);
  });

  it("clears participant stream when participant-stream payload contains null stream", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-stream-clear-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    const ws = InstantOpenWebSocket.instances[0];
    const incomingStream = new TestMediaStream({ audio: 1, video: 1 }) as unknown as MediaStream;

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-stream",
          participantId: "peer-stream-2",
          stream: incomingStream,
        },
      } as unknown as MessageEvent);
    });

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-stream",
          participantId: "peer-stream-2",
          stream: null,
        },
      } as unknown as MessageEvent);
    });

    const participant = result.current.participants.find((p) => p.id === "peer-stream-2") ?? null;
    expect(participant).not.toBeNull();
    expect(participant?.stream).toBeNull();
    expect(participant?.isCameraOff).toBe(true);
  });

  it("supports JSON participant-stream remove action without MediaStream object", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-stream-json-remove-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    const ws = InstantOpenWebSocket.instances[0];
    const incomingStream = new TestMediaStream({ audio: 1, video: 1 }) as unknown as MediaStream;

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-stream",
          participantId: "peer-stream-json-1",
          stream: incomingStream,
        },
      } as unknown as MessageEvent);
    });

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          type: "participant-stream",
          participantId: "peer-stream-json-1",
          streamAction: "remove",
          hasVideo: false,
        }),
      } as unknown as MessageEvent);
    });

    const participant = result.current.participants.find((p) => p.id === "peer-stream-json-1") ?? null;
    expect(participant).not.toBeNull();
    expect(participant?.stream).toBeNull();
    expect(participant?.isCameraOff).toBe(true);
  });

  it("upserts participant from envelope payload metadata without MediaStream object", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-stream-json-upsert-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    const ws = InstantOpenWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({
        data: JSON.stringify({
          v: 1,
          type: "participant-stream",
          payload: {
            participantId: "peer-stream-json-upsert-1",
            streamAction: "upsert",
            hasVideo: true,
          },
        }),
      } as unknown as MessageEvent);
    });

    const participant = result.current.participants.find((p) => p.id === "peer-stream-json-upsert-1") ?? null;
    expect(participant).not.toBeNull();
    expect(participant?.stream).toBeNull();
    expect(participant?.isCameraOff).toBe(false);
  });

  it("ignores malformed participant-speaking payload without valid types", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-speaking-invalid-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    const ws = InstantOpenWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-speaking",
          participantId: 42,
          speaking: "yes",
        },
      } as unknown as MessageEvent);
    });

    expect(result.current.activeSpeakerId).toBeNull();
    expect(result.current.participants.some((p) => p.id === "42")).toBe(false);
  });

  it("ignores participant-stream payload without stream metadata", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-stream-invalid-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    const ws = InstantOpenWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-stream",
          participantId: "peer-invalid-stream-1",
        },
      } as unknown as MessageEvent);
    });

    expect(result.current.participants.some((p) => p.id === "peer-invalid-stream-1")).toBe(false);
  });

  it("resets activeSpeakerId when current active participant stops speaking", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-speaking-reset-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    const ws = InstantOpenWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-speaking",
          participantId: "peer-speaking-1",
          speaking: true,
        },
      } as unknown as MessageEvent);
    });

    expect(result.current.activeSpeakerId).toBe("peer-speaking-1");

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-speaking",
          participantId: "peer-speaking-1",
          speaking: false,
        },
      } as unknown as MessageEvent);
    });

    expect(result.current.activeSpeakerId).toBeNull();
  });

  it("upserts participant when speaking event arrives before presence join", async () => {
    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-speaking-upsert-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    const ws = InstantOpenWebSocket.instances[0];

    act(() => {
      ws.onmessage?.({
        data: {
          type: "participant-speaking",
          participantId: "peer-speaking-upsert-1",
          speaking: true,
        },
      } as unknown as MessageEvent);
    });

    const participant = result.current.participants.find((p) => p.id === "peer-speaking-upsert-1") ?? null;
    expect(participant).not.toBeNull();
    expect(participant?.isSpeaking).toBe(true);
    expect(result.current.activeSpeakerId).toBe("peer-speaking-upsert-1");
  });

  it("keeps new screen share active when stale previous onended fires", async () => {
    const firstTrack = makeScreenTrack("screen-1");
    const secondTrack = makeScreenTrack("screen-2");
    const firstStream = makeScreenStream(firstTrack);
    const secondStream = makeScreenStream(secondTrack);

    const getDisplayMediaMock = vi.fn()
      .mockResolvedValueOnce(firstStream)
      .mockResolvedValueOnce(secondStream);

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(acquiredStream),
        getDisplayMedia: getDisplayMediaMock,
      },
    });

    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-screen-race-1"));

    await act(async () => {
      await result.current.joinCall();
    });

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(result.current.isScreenSharing).toBe(true);
    expect(result.current.screenStream).toBe(firstStream);

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(result.current.isScreenSharing).toBe(false);

    await act(async () => {
      await result.current.toggleScreenShare();
    });

    expect(result.current.isScreenSharing).toBe(true);
    expect(result.current.screenStream).toBe(secondStream);

    act(() => {
      firstTrack.onended?.();
    });

    expect(result.current.isScreenSharing).toBe(true);
    expect(result.current.screenStream).toBe(secondStream);
  });

  it("releases media and presence when joinCall fails mid-bootstrap", async () => {
    channelMock.subscribe.mockRejectedValueOnce(new Error("subscribe failed"));

    const { useGroupVideoCall } = await import("@/hooks/useGroupVideoCall");
    const { result } = renderHook(() => useGroupVideoCall("room-fail-join"));

    await act(async () => {
      await result.current.joinCall();
    });

    expect(result.current.isJoined).toBe(false);
    expect(result.current.isJoining).toBe(false);
    expect(result.current.localStream).toBeNull();
    expect(result.current.error).toContain("subscribe failed");
    expect(supabaseMock.removeChannel).toHaveBeenCalledTimes(1);

    acquiredStream.getTracks().forEach((track) => {
      expect(track.stop).toHaveBeenCalledTimes(1);
    });
  });
});
