import type {
  CallsWsAuth,
  CallsWsConfig,
  CallsWsEvent,
  CallsWsEventHandler,
  ClientMessageMap,
  ConnectionState,
  ConnectionStateHandler,
  MessageHandler,
  WsEnvelopeV1,
  HelloPayload,
  AuthPayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomLeavePayload,
  TransportCreatePayload,
  TransportConnectPayload,
  ProducePayload,
  ConsumePayload,
  ConsumerResumePayload,
  IceRestartPayload,
  OfferPayload,
  AnswerPayload,
  IceCandidatePayload,
  E2EECapsPayload,
  E2EEReadyPayload,
  RekeyBeginPayload,
  RekeyCommitPayload,
  KeyPackagePayload,
  KeyAckPayload,
  GetRouterRtpCapabilitiesPayload,
} from "./types";

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
  private lastServerActivityAt = 0;
  private awaitingHeartbeatAckMsgId: string | null = null;
  private lastHeartbeatSentAt = 0;
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
  private _connectionState: ConnectionState = 'disconnected';
  private readonly connectionStateHandlers = new Set<ConnectionStateHandler>();

  constructor(private readonly config: CallsWsConfig) {}

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  onConnectionStateChange(handler: ConnectionStateHandler): () => void {
    this.connectionStateHandlers.add(handler);
    return () => {
      this.connectionStateHandlers.delete(handler);
    };
  }

  private setConnectionState(state: ConnectionState) {
    if (this._connectionState === state) return;
    this._connectionState = state;
    this.connectionStateHandlers.forEach((h) => {
      try { h(state); } catch { /* ignore */ }
    });
  }

  connect(): Promise<void> {
    this.manualClose = false;

    // WSS enforcement
    if (this.config.requireWss !== false) {
      const endpoints = this.getEndpoints();
      const hasInsecure = endpoints.some((ep) => ep.startsWith('ws://'));
      if (hasInsecure) {
        return Promise.reject(new Error(
          '[CallsWsClient] WSS enforcement: all endpoints must use wss:// protocol. ' +
          'Set requireWss: false in config to disable (NOT RECOMMENDED for production).'
        ));
      }
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return Promise.resolve();
    }

    if (this.connectPromise) return this.connectPromise;

    const endpoints = this.getEndpoints();
    if (endpoints.length === 0) {
      return Promise.reject(new Error("No WS endpoints configured"));
    }

    this.setConnectionState('connecting');
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
      if (!url) {
        continue;
      }
      try {
        await this.connectSingle(url);
        this.endpointIndex = idx;
        this.reconnectAttempts = 0;
        this.setConnectionState('connected');
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error("WS connection error");
      }
    }

    this.setConnectionState('failed');
    throw lastError ?? new Error("WS connection error");
  }

  private connectSingle(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        settled = true;
        // BUG #1 FIX: Логирование для диагностики sequence issues при переподключении
        console.log('[CallsWsClient] WebSocket connected', {
          previousLastServerSeq: this.lastServerSeq,
          wasReconnecting: this._connectionState === 'reconnecting',
          timestamp: nowMs(),
        });
        this.lastServerSeq = 0;
        this.lastServerActivityAt = nowMs();
        this.awaitingHeartbeatAckMsgId = null;
        this.lastHeartbeatSentAt = 0;
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
        if (this.manualClose) {
          this.setConnectionState('disconnected');
          return;
        }

        // If not yet resolved and socket closed early - fail current attempt.
        if (!settled) {
          settled = true;
          reject(new Error("WS closed during connect"));
          return;
        }

        this.setConnectionState('reconnecting');
        this.scheduleReconnect();
      };
      ws.onmessage = (evt) => this.onMessage(evt.data);
    });
  }

  close() {
    this.manualClose = true;
    // BUG #2 FIX: Логирование состояния перед закрытием
    console.log('[CallsWsClient] close() called', {
      pendingAcksCount: this.pendingAcks.size,
      pendingAcksMsgIds: Array.from(this.pendingAcks.keys()),
      awaitingHeartbeatAck: this.awaitingHeartbeatAckMsgId,
      reconnectAttempts: this.reconnectAttempts,
      timestamp: Date.now(),
    });
    
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    
    // BUG #2: Pending ACKs отклоняются, но нет механизма retry после переподключения
    // Клиент может зависнуть навсегда
    const rejectedAcks: string[] = [];
    this.pendingAcks.forEach((pending, msgId) => {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("WS closed"));
      rejectedAcks.push(msgId);
    });
    
    console.log('[CallsWsClient] close() rejected pending ACKs', {
      rejectedCount: rejectedAcks.length,
      msgIds: rejectedAcks,
      timestamp: Date.now(),
    });
    
    this.pendingAcks.clear();
    this.awaitingHeartbeatAckMsgId = null;
    this.lastHeartbeatSentAt = 0;
    this.lastServerActivityAt = 0;
    this.ws?.close();
    this.ws = null;
    this.setConnectionState('disconnected');
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.manualClose) return;
    const reconnectCfg = this.config.reconnect;
    if (reconnectCfg?.enabled === false) return;

    const maxAttempts = reconnectCfg?.maxAttempts ?? this.config.maxReconnectAttempts ?? 12;
    if (this.reconnectAttempts >= maxAttempts) {
      this.setConnectionState('failed');
      return;
    }

    const base = reconnectCfg?.baseDelayMs ?? this.config.reconnectBaseMs ?? 500;
    const max = reconnectCfg?.maxDelayMs ?? this.config.reconnectMaxMs ?? 10_000;
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
    if (Array.isArray(this.config.endpoints) && this.config.endpoints.length > 0) {
      return this.config.endpoints.filter((v) => typeof v === "string" && v.trim().length > 0);
    }
    if (Array.isArray(this.config.urls) && this.config.urls.length > 0) {
      return this.config.urls.filter((v) => typeof v === "string" && v.trim().length > 0);
    }
    if (this.config.url && this.config.url.trim().length > 0) {
      return [this.config.url.trim()];
    }
    return [];
  }

  // ----------- Typed send methods -----------

  private _send<T extends keyof ClientMessageMap>(
    type: T,
    payload: ClientMessageMap[T]
  ): Promise<void> {
    return this.sendOrderedAcked(type as string, payload as object);
  }

  async hello(payload: HelloPayload) {
    return this._send('HELLO', payload);
  }

  async auth(payloadOrLegacy: AuthPayload | CallsWsAuth) {
    // Support legacy CallsWsAuth shape { accessToken }
    if ('accessToken' in payloadOrLegacy) {
      return this.sendOrderedAcked('AUTH', { accessToken: payloadOrLegacy.accessToken });
    }
    return this._send('AUTH', payloadOrLegacy);
  }

  async roomCreate(payload: RoomCreatePayload) {
    return this._send('ROOM_CREATE', payload);
  }

  async roomJoin(payload: RoomJoinPayload) {
    return this._send('ROOM_JOIN', payload);
  }

  async getRouterRtpCapabilities(roomId: string) {
    const payload: GetRouterRtpCapabilitiesPayload = { roomId };
    return this._send('GET_ROUTER_RTP_CAPABILITIES', payload);
  }

  async roomLeave(payload: RoomLeavePayload) {
    return this._send('ROOM_LEAVE', payload);
  }

  async transportCreate(payload: TransportCreatePayload) {
    return this._send('TRANSPORT_CREATE', payload);
  }

  async transportConnect(payload: TransportConnectPayload) {
    return this._send('TRANSPORT_CONNECT', payload);
  }

  async produce(payload: ProducePayload) {
    return this._send('PRODUCE', payload);
  }

  async consume(payload: ConsumePayload) {
    return this._send('CONSUME', payload);
  }

  async consumerResume(payload: ConsumerResumePayload) {
    return this._send('CONSUMER_RESUME', payload);
  }

  async iceRestart(payload: IceRestartPayload) {
    return this._send('ICE_RESTART', payload);
  }

  async offer(payload: OfferPayload) {
    return this._send('OFFER', payload);
  }

  async answer(payload: AnswerPayload) {
    return this._send('ANSWER', payload);
  }

  async iceCandidate(payload: IceCandidatePayload) {
    return this._send('ICE_CANDIDATE', payload);
  }

  async e2eeCaps(payload: E2EECapsPayload) {
    return this._send('E2EE_CAPS', payload);
  }

  async e2eeReady(payload: E2EEReadyPayload) {
    return this._send('E2EE_READY', payload);
  }

  async rekeyBegin(payload: RekeyBeginPayload) {
    return this._send('REKEY_BEGIN', payload);
  }

  async rekeyCommit(payload: RekeyCommitPayload) {
    return this._send('REKEY_COMMIT', payload);
  }

  async keyPackage(payload: KeyPackagePayload) {
    return this._send('KEY_PACKAGE', payload);
  }

  async keyAck(payload: KeyAckPayload) {
    return this._send('KEY_ACK', payload);
  }

  // ----------- Call signaling relay -----------

  async callInvite(payload: import('./types').CallSignalInvitePayload) {
    return this._send('call.invite' as never, payload as never);
  }

  async callAccept(payload: import('./types').CallSignalStatePayload) {
    return this._send('call.accept' as never, payload as never);
  }

  async callDecline(payload: import('./types').CallSignalStatePayload) {
    return this._send('call.decline' as never, payload as never);
  }

  async callCancel(payload: import('./types').CallSignalStatePayload) {
    return this._send('call.cancel' as never, payload as never);
  }

  async callHangup(payload: import('./types').CallSignalStatePayload) {
    return this._send('call.hangup' as never, payload as never);
  }

  // ----------- Event subscription -----------

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

  /** Typed event subscription — returns unsubscribe fn */
  onEvent<E extends CallsWsEvent>(
    event: E,
    handler: MessageHandler
  ): () => void {
    return this.on(event, handler as CallsWsEventHandler);
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

  // ----------- Internal -----------

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
      const maxRetries = this.config.ackRetry?.maxRetries ?? this.config.ackMaxRetries ?? 1;
      const retryDelayMs = this.config.ackRetry?.retryDelayMs ?? this.config.ackRetryMs ?? 250;

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

  private onMessage(raw: unknown) {
    let msg: WsEnvelopeV1 | null = null;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer));
    } catch {
      return;
    }

    if (!msg) {
      return;
    }

    this.lastServerActivityAt = nowMs();
    this.awaitingHeartbeatAckMsgId = null;
    this.lastHeartbeatSentAt = 0;

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
      const dedupWindowSize = this.config.dedupWindowSize ?? 10_000;
      if (this.seenServerMsgIdQueue.length > dedupWindowSize) {
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
      } catch { /* ignore */ }
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    const ms = this.config.heartbeatMs ?? 10_000;
    const staleAfterMs = Math.max(ms * 2, 15_000);
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      const currentTime = nowMs();
      if (this.awaitingHeartbeatAckMsgId && this.lastHeartbeatSentAt > 0) {
        if (currentTime - Math.max(this.lastHeartbeatSentAt, this.lastServerActivityAt) >= staleAfterMs) {
          this.ws.close();
        }
        return;
      }

      const msgId = uuid();
      this.awaitingHeartbeatAckMsgId = msgId;
      this.lastHeartbeatSentAt = currentTime;
      this.send({ v: 1, type: "PING", msgId, ts: currentTime, seq: this.expectedSeq++, payload: {} });
    }, ms);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
