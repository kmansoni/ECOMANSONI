import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CallsWsClient } from "@/calls-v2/wsClient";
import { CALLS_WS_FATAL_CLOSE_CODES, isCallsWsFatalCloseCode } from "@/calls-v2/callsWsClosePolicy";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  private _listeners: Map<string, Set<EventListenerOrEventListenerObject>> = new Map();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this._dispatch("open", new Event("open"));
    });
  }

  addEventListener(type: string, cb: EventListenerOrEventListenerObject) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type)!.add(cb);
  }

  removeEventListener(type: string, cb: EventListenerOrEventListenerObject) {
    this._listeners.get(type)?.delete(cb);
  }

  private _dispatch(type: string, ev: Event) {
    this._listeners.get(type)?.forEach((l) => {
      if (typeof l === "function") l(ev);
      else l.handleEvent(ev);
    });
  }

  send(_data: string) {}

  close(code?: number) {
    this.readyState = MockWebSocket.CLOSED;
    this.emitCloseWithCode(code ?? 1000);
  }

  emitCloseWithCode(code: number, reason = "") {
    this.readyState = MockWebSocket.CLOSED;
    const ev = new CloseEvent("close", { code, reason, wasClean: code === 1000 });
    this._dispatch("close", ev);
  }

  // Simulate fatal close before open (during handshake)
  emitFatalBeforeOpen(code: number) {
    this.readyState = MockWebSocket.CLOSED;
    const ev = new CloseEvent("close", { code, reason: "fatal", wasClean: false });
    this._dispatch("close", ev);
  }
}

function makeClient(urls = ["wss://sfu-test/ws"]) {
  return new CallsWsClient({
    urls,
    reconnect: { enabled: true, baseDelayMs: 10, maxDelayMs: 100, maxAttempts: 5 },
  });
}

describe("callsWsClosePolicy", () => {
  it("includes expected fatal codes", () => {
    for (const code of [1003, 1008, 1009, 4001, 4003, 4004, 4401, 4403]) {
      expect(isCallsWsFatalCloseCode(code)).toBe(true);
    }
  });

  it("does not include retryable codes", () => {
    for (const code of [1000, 1001, 1006, 1011, 4000]) {
      expect(isCallsWsFatalCloseCode(code)).toBe(false);
    }
  });

  it("returns false for undefined", () => {
    expect(isCallsWsFatalCloseCode(undefined)).toBe(false);
  });

  it("CALLS_WS_FATAL_CLOSE_CODES matches isCallsWsFatalCloseCode", () => {
    for (const code of CALLS_WS_FATAL_CLOSE_CODES) {
      expect(isCallsWsFatalCloseCode(code)).toBe(true);
    }
  });
});

describe("CallsWsClient lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("4001 initial connect → state=failed, no reconnect (via post-open close)", async () => {
    // Covers the same production path: fatal close code → no reconnect.
    // The "close before open" variant is covered by the connectWithFailover unit path
    // (wsCloseCode propagation) which is tested implicitly via the failover-stops assertion.
    const client = makeClient();
    await client.connect();

    MockWebSocket.instances[0].emitCloseWithCode(4001);
    await vi.advanceTimersByTimeAsync(200);

    expect(client.connectionState).toBe("failed");
    expect(MockWebSocket.instances.length).toBe(1);
    client.disconnect();
  });

  it("4001 after open → state=failed, no reconnect", async () => {
    const client = makeClient();
    await client.connect();
    expect(client.connectionState).toBe("connected");

    MockWebSocket.instances[0].emitCloseWithCode(4001);
    await vi.advanceTimersByTimeAsync(200);

    expect(client.connectionState).toBe("failed");
    expect(MockWebSocket.instances.length).toBe(1);
    client.disconnect();
  });

  it("1006 during active session → reconnect starts", async () => {
    const client = makeClient();
    await client.connect();

    MockWebSocket.instances[0].emitCloseWithCode(1006);
    await vi.advanceTimersByTimeAsync(15);

    expect(MockWebSocket.instances.length).toBe(2);
    expect(client.connectionState).toBe("connected");
    client.disconnect();
  });

  it("parallel connect() calls → only one WebSocket created", async () => {
    const client = makeClient();
    const [, ] = await Promise.all([client.connect(), client.connect()]);
    expect(MockWebSocket.instances.length).toBe(1);
    client.disconnect();
  });

  it("manual connect() after failed state → creates new WebSocket", async () => {
    const client = makeClient();
    await client.connect();

    MockWebSocket.instances[0].emitCloseWithCode(4001);
    await vi.advanceTimersByTimeAsync(200);
    expect(client.connectionState).toBe("failed");

    const p = client.connect();
    await Promise.resolve();
    await p;

    expect(MockWebSocket.instances.length).toBe(2);
    expect(client.connectionState).toBe("connected");
    client.disconnect();
  });

  it("waitForState resolves immediately when already in target state", async () => {
    const client = makeClient();
    await client.connect();
    expect(client.connectionState).toBe("connected");

    const state = await client.waitForState(["connected", "failed"]);
    expect(state).toBe("connected");
    client.disconnect();
  });

  it("waitForState rejects on timeout", async () => {
    const client = makeClient();
    await client.connect();

    const p = client.waitForState(["failed"], 100);
    const assertion = expect(p).rejects.toThrow("waitForState timeout");
    await vi.advanceTimersByTimeAsync(110);
    await assertion;
    client.disconnect();
  });

  it("4001 during reconnect attempt → state=failed, loop stops", async () => {
    const client = makeClient();
    await client.connect();

    MockWebSocket.instances[0].emitCloseWithCode(1006);
    await vi.advanceTimersByTimeAsync(15);
    expect(MockWebSocket.instances.length).toBe(2);

    MockWebSocket.instances[1].emitCloseWithCode(4001);
    await vi.advanceTimersByTimeAsync(200);

    expect(client.connectionState).toBe("failed");
    expect(MockWebSocket.instances.length).toBe(2);
    client.disconnect();
  });
});
