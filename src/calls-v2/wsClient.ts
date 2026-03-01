import type { CallsWsAuth, CallsWsConfig, CallsWsEvent, CallsWsEventHandler, WsEnvelopeV1 } from "./types";

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
  frame: WsEnvelopeV1;
  timeoutMs: number;
  retries: number;
  maxRetries: number;
};

type WaitForOptions = {
  timeoutMs?: number;
  acceptRecent?: boolean;
};

export class CallsWsClient {
  private ws: WebSocket | null = null;
  private expectedSeq = 1;
  private lastServerSeq = 0;
  private readonly seenServerMsgIds = new Set<string>();
  private readonly seenServerMsgIdQueue: string[] = [];
  private heartbeatTimer: number | null = null;
  private readonly pendingAcks = new Map<string, PendingAck>();
  private readonly listeners = new Map<CallsWsEvent, Set<CallsWsEventHandler>>();
  private readonly recentEvents = new Map<CallsWsEvent, WsEnvelopeV1[]>();
  private endpointIndex = 0;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private manualClose = false;

  constructor(private readonly config: CallsWsConfig) {}

  connect(): Promise<void> {
    this.manualClose = false;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }

    if (this.connectPromise) return this.connectPromise;

    const endpoints = this.getEndpoints();
    if (endpoints.length === 0) {
      return Promise.reject(new Error("No WS endpoints configured"));
    }

    this.connectPromise = this.connectWithFailover();
    this.connectPromise.finally(() => {
      this.connectPromise = null;
    });

    return this.connectPromise;
  }

  private async connectWithFailover(): Promise<void> {
    const endpoints = this.getEndpoints();
    const attempts = Math.max(1, endpoints.length);

    let lastError: Error | null = null;
    for (let i = 0; i < attempts; i++) {
      const idx = (this.endpointIndex + i) % endpoints.length;
      const url = endpoints[idx];
      try {
        await this.connectSingle(url);
        this.endpointIndex = idx;
        this.reconnectAttempts = 0;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error("WS connection error");
      }
    }

    throw lastError ?? new Error("WS connection error");
  }

  private connectSingle(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        settled = true;
        this.lastServerSeq = 0;
        this.seenServerMsgIds.clear();
        this.seenServerMsgIdQueue.length = 0;
        this.startHeartbeat();
        resolve();
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error("WS connection error"));
        }
      };
      ws.onclose = () => {
        this.stopHeartbeat();
        this.ws = null;
        if (this.manualClose) return;

        // If not yet resolved and socket closed early - fail current attempt.
        if (!settled) {
          settled = true;
          reject(new Error("WS closed during connect"));
          return;
        }

        this.scheduleReconnect();
      };
      ws.onmessage = (evt) => this.onMessage(evt.data);
    });
  }

  close() {
    this.manualClose = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.pendingAcks.forEach((pending) => {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("WS closed"));
    });
    this.pendingAcks.clear();
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.manualClose) return;
    const reconnectCfg = this.config.reconnect;
    if (reconnectCfg?.enabled === false) return;

    const maxAttempts = reconnectCfg?.maxAttempts ?? 12;
    if (this.reconnectAttempts >= maxAttempts) return;

    const base = reconnectCfg?.baseDelayMs ?? 500;
    const max = reconnectCfg?.maxDelayMs ?? 10_000;
    const exp = Math.min(max, base * Math.pow(2, this.reconnectAttempts));
    const jitter = Math.floor(Math.random() * Math.max(100, exp * 0.2));
    const delay = Math.min(max, exp + jitter);

    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        // Rotate endpoint before retry for multi-region failover.
        const endpoints = this.getEndpoints();
        if (endpoints.length > 1) {
          this.endpointIndex = (this.endpointIndex + 1) % endpoints.length;
        }
        await this.connectWithFailover();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  private getEndpoints(): string[] {
    if (Array.isArray(this.config.urls) && this.config.urls.length > 0) {
      return this.config.urls.filter((value) => typeof value === "string" && value.trim().length > 0);
    }
    if (this.config.url && this.config.url.trim().length > 0) {
      return [this.config.url.trim()];
    }
    return [];
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

  async e2eeReady(payload: any) {
    await this.sendOrderedAcked("E2EE_READY", payload);
  }

  async roomCreate(payload: any) {
    await this.sendOrderedAcked("ROOM_CREATE", payload);
  }

  async roomJoin(payload: any) {
    await this.sendOrderedAcked("ROOM_JOIN", payload);
  }

  async transportCreate(payload: any) {
    await this.sendOrderedAcked("TRANSPORT_CREATE", payload);
  }

  async transportConnect(payload: any) {
    await this.sendOrderedAcked("TRANSPORT_CONNECT", payload);
  }

  async produce(payload: any) {
    await this.sendOrderedAcked("PRODUCE", payload);
  }

  async consume(payload: any) {
    await this.sendOrderedAcked("CONSUME", payload);
  }

  async iceRestart(payload: any) {
    await this.sendOrderedAcked("ICE_RESTART", payload);
  }

  async rekeyBegin(payload: any) {
    await this.sendOrderedAcked("REKEY_BEGIN", payload);
  }

  async keyPackage(payload: any) {
    await this.sendOrderedAcked("KEY_PACKAGE", payload);
  }

  async keyAck(payload: any) {
    await this.sendOrderedAcked("KEY_ACK", payload);
  }

  async rekeyCommit(payload: any) {
    await this.sendOrderedAcked("REKEY_COMMIT", payload);
  }

  on(event: CallsWsEvent, handler: CallsWsEventHandler): () => void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
    return () => {
      const current = this.listeners.get(event);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.listeners.delete(event);
    };
  }

  waitFor(
    event: CallsWsEvent,
    predicate?: (frame: WsEnvelopeV1) => boolean,
    options: WaitForOptions = {}
  ): Promise<WsEnvelopeV1> {
    const timeoutMs = options.timeoutMs ?? 5000;
    const acceptRecent = options.acceptRecent ?? true;

    if (acceptRecent) {
      const recent = this.recentEvents.get(event);
      if (recent && recent.length > 0) {
        const match = predicate ? recent.find(predicate) : recent[recent.length - 1];
        if (match) {
          return Promise.resolve(match);
        }
      }
    }

    return new Promise((resolve, reject) => {
      const off = this.on(event, (frame) => {
        if (predicate && !predicate(frame)) return;
        off();
        window.clearTimeout(timer);
        resolve(frame);
      });

      const timer = window.setTimeout(() => {
        off();
        reject(new Error(`waitFor timeout for ${event}`));
      }, timeoutMs);
    });
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
      const maxRetries = this.config.ackRetry?.maxRetries ?? 1;
      const retryDelayMs = this.config.ackRetry?.retryDelayMs ?? 250;

      const scheduleTimeout = () =>
        window.setTimeout(() => {
          const pending = this.pendingAcks.get(msgId);
          if (!pending) return;

          if (pending.retries < pending.maxRetries) {
            pending.retries += 1;
            try {
              this.send(pending.frame);
              window.clearTimeout(pending.timer);
              pending.timer = window.setTimeout(onAckTimeout, pending.timeoutMs + retryDelayMs);
            } catch {
              this.pendingAcks.delete(msgId);
              reject(new Error(`ACK retry send failed for ${type}`));
            }
            return;
          }

          this.pendingAcks.delete(msgId);
          reject(new Error(`ACK timeout for ${type}`));
        }, timeoutMs);

      const onAckTimeout = () => {
        const pending = this.pendingAcks.get(msgId);
        if (!pending) return;

        if (pending.retries < pending.maxRetries) {
          pending.retries += 1;
          try {
            this.send(pending.frame);
            window.clearTimeout(pending.timer);
            pending.timer = scheduleTimeout();
          } catch {
            this.pendingAcks.delete(msgId);
            reject(new Error(`ACK retry send failed for ${type}`));
          }
          return;
        }

        this.pendingAcks.delete(msgId);
        reject(new Error(`ACK timeout for ${type}`));
      };

      const timer = scheduleTimeout();

      this.pendingAcks.set(msgId, {
        resolve,
        reject,
        timer,
        frame,
        timeoutMs,
        retries: 0,
        maxRetries,
      });
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

    if (typeof msg.msgId === "string") {
      if (this.seenServerMsgIds.has(msg.msgId)) {
        return;
      }
      this.seenServerMsgIds.add(msg.msgId);
      this.seenServerMsgIdQueue.push(msg.msgId);
      if (this.seenServerMsgIdQueue.length > 4000) {
        const stale = this.seenServerMsgIdQueue.shift();
        if (stale) this.seenServerMsgIds.delete(stale);
      }
    }

    if (typeof msg.seq === "number" && Number.isFinite(msg.seq)) {
      if (msg.seq <= this.lastServerSeq) {
        return;
      }
      this.lastServerSeq = msg.seq;
    }

    this.emit(msg.type as CallsWsEvent, msg);
  }

  private emit(event: CallsWsEvent, frame: WsEnvelopeV1) {
    const recent = this.recentEvents.get(event) ?? [];
    recent.push(frame);
    if (recent.length > 20) recent.shift();
    this.recentEvents.set(event, recent);

    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;
    handlers.forEach((handler) => {
      try {
        handler(frame);
      } catch {
      }
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    const ms = this.config.heartbeatMs ?? 10_000;
    this.heartbeatTimer = window.setInterval(() => {
      // Keep-alive frame (UNORDERED). Server may ignore.
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.send({ v: 1, type: "PING", msgId: uuid(), ts: nowMs(), seq: this.expectedSeq++, payload: {} });
    }, ms);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
