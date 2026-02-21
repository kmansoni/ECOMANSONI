import type { CallsWsAuth, CallsWsConfig, WsEnvelopeV1 } from "./types";

function nowMs() {
  return Date.now();
}

function uuid() {
  return crypto.randomUUID();
}

type PendingAck = {
  resolve: () => void;
  reject: (err: Error) => void;
  timer: number;
};

export class CallsWsClient {
  private ws: WebSocket | null = null;
  private expectedSeq = 1;
  private heartbeatTimer: number | null = null;
  private readonly pendingAcks = new Map<string, PendingAck>();

  constructor(private readonly config: CallsWsConfig) {}

  connect(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.config.url);
      this.ws = ws;

      ws.onopen = () => {
        this.startHeartbeat();
        resolve();
      };
      ws.onerror = () => reject(new Error("WS connection error"));
      ws.onclose = () => this.stopHeartbeat();
      ws.onmessage = (evt) => this.onMessage(evt.data);
    });
  }

  close() {
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  async hello(payload: any) {
    await this.sendOrderedAcked("HELLO", payload);
  }

  async auth(auth: CallsWsAuth) {
    await this.sendOrderedAcked("AUTH", { accessToken: auth.accessToken });
  }

  async e2eeCaps(payload: any) {
    await this.sendOrderedAcked("E2EE_CAPS", payload);
  }

  async roomCreate(payload: any) {
    await this.sendOrderedAcked("ROOM_CREATE", payload);
  }

  async roomJoin(payload: any) {
    await this.sendOrderedAcked("ROOM_JOIN", payload);
  }

  private send(frame: WsEnvelopeV1) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WS is not open");
    }
    this.ws.send(JSON.stringify(frame));
  }

  private sendOrderedAcked(type: string, payload: object, timeoutMs = 5000): Promise<void> {
    const msgId = uuid();
    const seq = this.expectedSeq++;

    const frame: WsEnvelopeV1 = {
      v: 1,
      type,
      msgId,
      ts: nowMs(),
      seq,
      payload,
    };

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingAcks.delete(msgId);
        reject(new Error(`ACK timeout for ${type}`));
      }, timeoutMs);

      this.pendingAcks.set(msgId, { resolve, reject, timer });
      this.send(frame);
    });
  }

  private onMessage(raw: any) {
    let msg: WsEnvelopeV1 | null = null;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }

    // ACK frame
    if (msg.ack?.ackOfMsgId) {
      const pending = this.pendingAcks.get(msg.ack.ackOfMsgId);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      this.pendingAcks.delete(msg.ack.ackOfMsgId);
      if (msg.ack.ok === false) pending.reject(new Error(msg.ack.error?.message ?? "ACK error"));
      else pending.resolve();
      return;
    }

    // Non-ACK events are handled by the future integration layer.
    // (e.g. ROOM_CREATED, ROOM_JOIN_OK, ROOM_SNAPSHOT, PRODUCER_ADDED, REKEY_BEGIN...)
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    const ms = this.config.heartbeatMs ?? 10_000;
    this.heartbeatTimer = window.setInterval(() => {
      // Keep-alive frame (UNORDERED). Server may ignore.
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.send({ v: 1, type: "PING", msgId: uuid(), ts: nowMs(), payload: {} });
    }, ms);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
