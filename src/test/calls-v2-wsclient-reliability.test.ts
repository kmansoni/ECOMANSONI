import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallsWsClient } from "@/calls-v2/wsClient";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  onclose: ((ev: CloseEvent) => unknown) | null = null;
  onmessage: ((ev: MessageEvent) => unknown) | null = null;

  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);

    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event("open"));
    });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  emitClose() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  emitMessage(payload: unknown) {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    this.onmessage?.(event);
  }
}

describe("CallsWsClient reliability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rotates endpoint on reconnect after close", async () => {
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);

    const client = new CallsWsClient({
      urls: ["ws://region-a/ws", "ws://region-b/ws"],
      reconnect: { enabled: true, baseDelayMs: 10, maxDelayMs: 10, maxAttempts: 3 },
    });

    await client.connect();
    expect(MockWebSocket.instances.length).toBe(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://region-a/ws");

    MockWebSocket.instances[0].emitClose();
    await vi.advanceTimersByTimeAsync(12);

    expect(MockWebSocket.instances.length).toBe(2);
    expect(MockWebSocket.instances[1].url).toBe("ws://region-b/ws");

    client.close();
    randomSpy.mockRestore();
  });

  it("retries ACK with the same message id (idempotent)", async () => {
    const client = new CallsWsClient({
      url: "ws://single/ws",
      ackRetry: { maxRetries: 1, retryDelayMs: 0 },
    });

    await client.connect();
    const ws = MockWebSocket.instances[0];

    const pending = client.roomCreate({ roomId: "room-1", callId: "call-1" });

    expect(ws.sent.length).toBe(1);
    const first = JSON.parse(ws.sent[0]) as { msgId: string; type: string };
    expect(first.type).toBe("ROOM_CREATE");

    await vi.advanceTimersByTimeAsync(5001);
    expect(ws.sent.length).toBe(2);

    const second = JSON.parse(ws.sent[1]) as { msgId: string; type: string };
    expect(second.type).toBe("ROOM_CREATE");
    expect(second.msgId).toBe(first.msgId);

    ws.emitMessage({
      v: 1,
      type: "ACK",
      msgId: "ack-msg",
      ts: Date.now(),
      ack: { ackOfMsgId: first.msgId, ok: true },
      payload: {},
    });

    await expect(pending).resolves.toBeUndefined();
    client.close();
  });

  it("waitFor consumes recent buffered event", async () => {
    const client = new CallsWsClient({ url: "ws://single/ws" });
    await client.connect();

    const ws = MockWebSocket.instances[0];
    ws.emitMessage({
      v: 1,
      type: "ROOM_JOIN_OK",
      msgId: "msg-room-join-ok",
      ts: Date.now(),
      payload: { roomId: "room-1" },
    });

    const frame = await client.waitFor("ROOM_JOIN_OK", (f) => f.payload?.roomId === "room-1", {
      acceptRecent: true,
      timeoutMs: 500,
    });

    expect(frame.type).toBe("ROOM_JOIN_OK");
    expect((frame.payload as { roomId: string }).roomId).toBe("room-1");
    client.close();
  });

  it("drops duplicate msgId and non-monotonic seq frames", async () => {
    const client = new CallsWsClient({ url: "ws://single/ws" });
    await client.connect();

    const ws = MockWebSocket.instances[0];
    const received: string[] = [];
    const off = client.on("ROOM_CREATED", (frame) => {
      received.push(frame.msgId);
    });

    ws.emitMessage({
      v: 1,
      type: "ROOM_CREATED",
      msgId: "msg-1",
      ts: Date.now(),
      seq: 10,
      payload: { roomId: "room-1" },
    });

    ws.emitMessage({
      v: 1,
      type: "ROOM_CREATED",
      msgId: "msg-1",
      ts: Date.now(),
      seq: 10,
      payload: { roomId: "room-1" },
    });

    ws.emitMessage({
      v: 1,
      type: "ROOM_CREATED",
      msgId: "msg-2",
      ts: Date.now(),
      seq: 9,
      payload: { roomId: "room-2" },
    });

    expect(received).toEqual(["msg-1"]);
    off();
    client.close();
  });
});
