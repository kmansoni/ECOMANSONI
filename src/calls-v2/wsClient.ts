import type {
  CallsWsConfig,
  CallsWsEvent,
  CallsWsEventHandler,
  ConnectionState,
  ConnectionStateHandler,
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
  CallSignalInvitePayload,
  CallSignalStatePayload,
} from "./types";

import { logger } from '@/lib/logger';

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
      try { h(state); } catch (err) { logger.warn('[CallsWsClient] connectionStateHandler error', { err }); }
    });
  }

  connect(): Promise<void> {
    this.manualClose = false;

    // WSS enforcement: ws:// разрешён только для localhost (dev-режим).
    // Продакшен non-localhost endpoints обязаны использовать wss://.
    if (this.config.requireWss !== false) {
      const endpoints = this.getEndpoints();
      const hasNonLocalInsecure = endpoints.some((ep) => {
        if (!ep.startsWith('ws://')) return false;
        try {
          const { hostname } = new URL(ep);
          return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1';
        } catch {
          return true;
        }
      });
      if (hasNonLocalInsecure) {
        return Promise.reject(new Error(
          '[CallsWsClient] WSS enforcement: non-localhost endpoints must use wss:// protocol. ' +
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
      if (!url) continue;
      try {
        await this.connectSingle(url);
        this.endpointIndex = idx;
        this.reconnectAttempts = 0;
        return;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        logger.warn('[CallsWsClient] endpoint failed, trying next', { url, err });
      }
    }

    throw lastError ?? new Error('All WS endpoints failed');
  }

  private connectSingle(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      let settled = false;

      const cleanup = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        ws.removeEventListener('close', onClose);
      };

      const onOpen = () => {
        if (settled) return;
        settled = true;
        cleanup();
        this.ws = ws;
        ws.addEventListener('close', this.onWsClose);
        ws.addEventListener('message', (ev) => this.onMessage(ev.data));
        this.setConnectionState('connected');
        this.startHeartbeat();
        resolve();
      };

      const onError = (ev: Event) => {
        if (settled) return;
        settled = true;
        cleanup();
        ws.close();
        reject(new Error(`WebSocket error connecting to ${url}: ${(ev as ErrorEvent).message ?? 'unknown'}`));
      };

      const onClose = (ev: CloseEvent) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(`WebSocket closed before open: code=${ev.code} reason=${ev.reason}`));
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
    });
  }

  private onWsClose = () => {
    if (!this.ws) return; // уже очищено
    this.ws = null;
    this.handleDisconnect();
  };

  private handleDisconnect() {
    this.stopHeartbeat();

    if (this.manualClose) {
      this.setConnectionState('disconnected');
      return;
    }

    // Переходим к следующему эндпоинту при каждом reconnect
    const endpoints = this.getEndpoints();
    if (endpoints.length > 1) {
      this.endpointIndex = (this.endpointIndex + 1) % endpoints.length;
    }

    const maxAttempts = this.config.reconnect?.maxAttempts ?? this.config.maxReconnectAttempts ?? 12;
    if (this.reconnectAttempts >= maxAttempts) {
      logger.error('[CallsWsClient] reconnect exhausted', { maxAttempts });
      this.setConnectionState('failed');
      return;
    }

    this.setConnectionState('reconnecting');
    this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;

    const base = this.config.reconnect?.baseDelayMs ?? this.config.reconnectBaseMs ?? 500;
    const max = this.config.reconnect?.maxDelayMs ?? this.config.reconnectMaxMs ?? 10_000;
    const delay = Math.min(max, base * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts += 1;

    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        this.setConnectionState('connecting');
        await this.connectWithFailover();
      } catch {
        this.handleDisconnect();
      }
    }, delay);
  }

  disconnect(): void {
    this.manualClose = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeEventListener('close', this.onWsClose);
      this.ws.close();
      this.ws = null;
    }
    this.setConnectionState('disconnected');
  }

  private getEndpoints(): string[] {
    const cfg = this.config;
    if (cfg.endpoints && cfg.endpoints.length > 0) return cfg.endpoints;
    if (cfg.urls && cfg.urls.length > 0) return cfg.urls;
    if (cfg.url) return [cfg.url];
    return [];
  }

  // ----------- Public send helpers -----------

  auth(payload: AuthPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('AUTH', payload, timeoutMs);
  }

  hello(payload: HelloPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('HELLO', payload, timeoutMs);
  }

  roomCreate(payload: RoomCreatePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('ROOM_CREATE', payload, timeoutMs);
  }

  roomJoin(payload: RoomJoinPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('ROOM_JOIN', payload, timeoutMs);
  }

  roomLeave(payload: RoomLeavePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('ROOM_LEAVE', payload, timeoutMs);
  }

  transportCreate(payload: TransportCreatePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('TRANSPORT_CREATE', payload, timeoutMs);
  }

  transportConnect(payload: TransportConnectPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('TRANSPORT_CONNECT', payload, timeoutMs);
  }

  produce(payload: ProducePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('PRODUCE', payload, timeoutMs);
  }

  consume(payload: ConsumePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('CONSUME', payload, timeoutMs);
  }

  consumerResume(payload: ConsumerResumePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('CONSUMER_RESUME', payload, timeoutMs);
  }

  iceRestart(payload: IceRestartPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('ICE_RESTART', payload, timeoutMs);
  }

  sendOffer(payload: OfferPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('OFFER', payload, timeoutMs);
  }

  sendAnswer(payload: AnswerPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('ANSWER', payload, timeoutMs);
  }

  sendIceCandidate(payload: IceCandidatePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('ICE_CANDIDATE', payload, timeoutMs);
  }

  e2eeCaps(payload: E2EECapsPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('E2EE_CAPS', payload, timeoutMs);
  }

  e2eeReady(payload: E2EEReadyPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('E2EE_READY', payload, timeoutMs);
  }

  rekeyBegin(payload: RekeyBeginPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('REKEY_BEGIN', payload, timeoutMs);
  }

  rekeyCommit(payload: RekeyCommitPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('REKEY_COMMIT', payload, timeoutMs);
  }

  keyPackage(payload: KeyPackagePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('KEY_PACKAGE', payload, timeoutMs);
  }

  keyAck(payload: KeyAckPayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('KEY_ACK', payload, timeoutMs);
  }

  getRouterRtpCapabilities(payload: GetRouterRtpCapabilitiesPayload | string, timeoutMs?: number): Promise<void> {
    const p = typeof payload === 'string' ? { roomId: payload } : payload;
    return this.sendOrderedAcked('GET_ROUTER_RTP_CAPABILITIES', p, timeoutMs);
  }

  // ----------- Call signaling helpers -----------

  callInvite(payload: CallSignalInvitePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('call.invite', payload, timeoutMs);
  }

  callAccept(payload: CallSignalStatePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('call.accept', payload, timeoutMs);
  }

  callDecline(payload: CallSignalStatePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('call.decline', payload, timeoutMs);
  }

  callHangup(payload: CallSignalStatePayload, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked('call.hangup', payload, timeoutMs);
  }

  // Алиас disconnect() для обратной совместимости
  close(): void {
    this.disconnect();
  }

  sendRaw(type: string, payload: object, timeoutMs?: number): Promise<void> {
    return this.sendOrderedAcked(type, payload, timeoutMs);
  }

  on(event: CallsWsEvent, handler: CallsWsEventHandler): () => void {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers!.delete(handler);
    };
  }

  waitFor(
    event: CallsWsEvent,
    predicate?: (frame: WsEnvelopeV1) => boolean,
    { timeoutMs = 10_000, acceptRecent = false }: WaitForOptions = {},
  ): Promise<WsEnvelopeV1> {
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
      } catch (err) { logger.warn('[CallsWsClient] event handler error', { event, err }); }
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
