/**
 * CrisisMeshEngine — ядро mesh-сети.
 *
 * Связывает: Transport (BLE/Wi-Fi Direct) ↔ Router (dedup/TTL/loops) ↔
 * Crypto (Ed25519) ↔ Storage (IndexedDB).
 *
 * Ответственности:
 *   - Подписывать и отправлять исходящие сообщения
 *   - Принимать входящие, валидировать подпись, решать deliver/relay/drop
 *   - Управлять outbox для store-and-forward
 *   - Эмитить события подписчикам (UI)
 *
 * P0 ограничение: ciphertext = base64(plaintext). Подпись Ed25519 защищает
 * от spoofing/tampering на relay. Шифрование payload уровня Double Ratchet —
 * P1, использует существующий `src/lib/e2ee/` без изменений.
 */

import { toBase64, fromBase64 } from '@/lib/e2ee/utils';

import { signEnvelope, verifyEnvelope } from './crypto/signing';
import {
  asMeshMessageId,
  CrisisMeshError,
  DEFAULT_CONFIG,
  DEFAULT_PRIORITY,
  SOS_PRIORITY,
} from './types';
import type {
  CrisisMeshConfig,
  DecryptedMeshMessage,
  EmergencyLevel,
  EmergencySignal,
  LocalIdentity,
  MeshMessageEnvelope,
  MeshMessageId,
  MeshMessageKind,
  MeshPriority,
  Peer,
  PeerId,
  SignalType,
  TransportEvent,
} from './types';
import {
  computeMessageId,
  MeshRouter,
  validateEnvelope,
  type RouterDropReason,
} from './routing/router';
import type { MeshTransportBridge } from './transport/bridge';
import {
  enqueueOutbox,
  getIdentity,
  listIdentities,
  listOutbox,
  removeFromOutbox,
  saveMessage,
  saveSos,
  updateOutboxAttempt,
  upsertIdentity,
  type StoredOutboxItem,
} from './storage/mesh-db';

export type EngineState = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

export type EngineEventDropReason = RouterDropReason | 'invalid-signature' | 'malformed';

export type EngineEvent =
  | { type: 'peer-update'; peer: Peer }
  | { type: 'peer-lost'; peerId: PeerId }
  | { type: 'message-received'; message: DecryptedMeshMessage }
  | { type: 'message-sent'; messageId: MeshMessageId }
  | {
      type: 'message-dropped';
      messageId: MeshMessageId;
      reason: EngineEventDropReason;
      detail?: string;
    }
  | { type: 'sos-received'; signal: EmergencySignal }
  | { type: 'transport-error'; error: string }
  | { type: 'state-change'; state: EngineState };

export type EngineListener = (event: EngineEvent) => void;

export interface EngineOptions {
  identity: LocalIdentity;
  /** Ed25519 CryptoKey (private, non-extractable) */
  privateKey: CryptoKey;
  transport: MeshTransportBridge;
  config?: Partial<CrisisMeshConfig>;
}

interface PlaintextPayload {
  kind: MeshMessageKind;
  text: string;
  metadata?: Record<string, unknown>;
}

export class CrisisMeshEngine {
  readonly identity: LocalIdentity;
  readonly privateKey: CryptoKey;
  readonly transport: MeshTransportBridge;
  readonly config: CrisisMeshConfig;

  private router: MeshRouter;
  private listeners = new Set<EngineListener>();
  private transportUnsub: (() => void) | null = null;
  private state: EngineState = 'idle';
  private peers = new Map<PeerId, Peer>();
  private outboxTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: EngineOptions) {
    this.identity = opts.identity;
    this.privateKey = opts.privateKey;
    this.transport = opts.transport;
    this.config = { ...DEFAULT_CONFIG, ...opts.config };
    this.router = new MeshRouter(this.identity.peerId, this.config);
  }

  getState(): EngineState {
    return this.state;
  }

  getPeers(): Peer[] {
    return [...this.peers.values()];
  }

  on(listener: EngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') return;
    this.setState('starting');

    const stored = await listIdentities();
    for (const p of stored) this.peers.set(p.id, p);

    this.transportUnsub = this.transport.on((ev) => this.handleTransportEvent(ev));
    await this.transport.start({
      serviceId: this.config.transport.serviceId,
      advertiseName: this.identity.displayName,
    });

    this.outboxTimer = setInterval(() => {
      this.drainOutbox().catch((err) => this.emitError(describeError(err)));
    }, 5_000);

    this.setState('running');
  }

  async stop(): Promise<void> {
    if (this.state === 'idle' || this.state === 'stopping') return;
    this.setState('stopping');
    if (this.outboxTimer) {
      clearInterval(this.outboxTimer);
      this.outboxTimer = null;
    }
    if (this.transportUnsub) {
      this.transportUnsub();
      this.transportUnsub = null;
    }
    await this.transport.stop();
    this.setState('idle');
  }

  // ─── Public send API ───────────────────────────────────────────────────────

  async sendText(to: PeerId | 'broadcast', text: string): Promise<MeshMessageId> {
    return this.sendPayload(to, { kind: 'text', text }, DEFAULT_PRIORITY);
  }

  async sendSos(signal: {
    type: SignalType;
    level: EmergencyLevel;
    message: string;
    coordinates?: EmergencySignal['coordinates'];
  }): Promise<MeshMessageId> {
    const payload: PlaintextPayload = {
      kind: 'sos',
      text: signal.message,
      metadata: {
        type: signal.type,
        level: signal.level,
        coordinates: signal.coordinates ?? null,
      },
    };
    const id = await this.sendPayload('broadcast', payload, SOS_PRIORITY);

    const sosRecord: EmergencySignal = {
      id,
      senderId: this.identity.peerId,
      senderDisplayName: this.identity.displayName,
      type: signal.type,
      level: signal.level,
      timestamp: Date.now(),
      message: signal.message,
      coordinates: signal.coordinates ?? null,
      hopCount: 0,
      routePath: [],
      status: 'active',
    };
    await saveSos(sosRecord);
    return id;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async sendPayload(
    to: PeerId | 'broadcast',
    payload: PlaintextPayload,
    priority: MeshPriority,
  ): Promise<MeshMessageId> {
    if (this.state !== 'running') {
      throw new CrisisMeshError('NOT_INITIALIZED', 'engine not running');
    }

    const plaintext = JSON.stringify(payload);
    const nonce = randomNonceB64();
    const timestamp = Date.now();
    const messageId = await computeMessageId(this.identity.peerId, timestamp, nonce);

    const plainBytes = new TextEncoder().encode(plaintext);
    const ciphertext = toBase64(plainBytes);

    const headerForSign = {
      id: messageId,
      senderId: this.identity.peerId,
      recipientId: to,
      kind: payload.kind,
      priority,
      timestamp,
      maxHops: this.config.maxHops,
      ttlMs: this.config.ttlMs,
    };

    const signature = await signEnvelope(this.privateKey, headerForSign, nonce, ciphertext);

    const prepared = this.router.prepareOutgoing({
      ...headerForSign,
      ciphertext,
      nonce,
      signature,
    });

    if (to !== 'broadcast') {
      const self: DecryptedMeshMessage = {
        header: {
          id: messageId,
          senderId: this.identity.peerId,
          recipientId: to,
          kind: payload.kind,
          priority,
          timestamp,
          hopCount: 0,
          maxHops: this.config.maxHops,
          ttlMs: this.config.ttlMs,
          routePath: [this.identity.peerId],
        },
        plaintext,
        metadata: payload.metadata,
        localStatus: 'received',
      };
      await saveMessage(self);
    }

    await this.broadcastEnvelope(prepared);
    this.emit({ type: 'message-sent', messageId });
    return messageId;
  }

  private async broadcastEnvelope(envelope: MeshMessageEnvelope): Promise<void> {
    try {
      const data = new TextEncoder().encode(JSON.stringify(envelope));
      await this.transport.broadcast(data);
    } catch (err) {
      const item: StoredOutboxItem = {
        messageId: envelope.id,
        envelope,
        createdAt: Date.now(),
        attempts: 1,
        lastAttemptAt: Date.now(),
        nextAttemptAt: Date.now() + 5_000,
      };
      await enqueueOutbox(item);
      this.emitError(`broadcast failed, queued: ${describeError(err)}`);
    }
  }

  private handleTransportEvent(ev: TransportEvent): void {
    switch (ev.type) {
      case 'peer-found':
        void this.onPeerFound(ev);
        break;
      case 'peer-lost':
        void this.onPeerLost(ev.peerId);
        break;
      case 'payload-received':
        void this.onPayloadReceived(ev.from, ev.data);
        break;
      case 'connection-state':
        void this.onConnectionState(ev.peerId, ev.state);
        break;
      case 'transport-error':
        this.emitError(ev.error);
        break;
    }
  }

  private async onPeerFound(ev: Extract<TransportEvent, { type: 'peer-found' }>): Promise<void> {
    const now = Date.now();
    const existing = this.peers.get(ev.peerId) ?? (await getIdentity(ev.peerId));

    const peer: Peer = existing
      ? { ...existing, status: 'discovered', lastSeenAt: now, signalStrength: ev.rssi }
      : {
          id: ev.peerId,
          displayName: ev.displayName,
          deviceType: ev.deviceType,
          publicKey: new Uint8Array(0),
          status: 'discovered',
          firstSeenAt: now,
          lastSeenAt: now,
          signalStrength: ev.rssi,
          hopDistance: 0,
          trustLevel: 'unknown',
        };

    this.peers.set(peer.id, peer);
    await upsertIdentity(peer);
    this.emit({ type: 'peer-update', peer });
  }

  private async onPeerLost(peerId: PeerId): Promise<void> {
    const existing = this.peers.get(peerId);
    if (existing) {
      const updated: Peer = { ...existing, status: 'offline', lastSeenAt: Date.now() };
      this.peers.set(peerId, updated);
      await upsertIdentity(updated);
    }
    this.emit({ type: 'peer-lost', peerId });
  }

  private async onConnectionState(
    peerId: PeerId,
    state: 'connecting' | 'connected' | 'disconnected' | 'failed',
  ): Promise<void> {
    const existing = this.peers.get(peerId);
    if (!existing) return;
    const mapped: Peer['status'] =
      state === 'connected' ? 'online'
        : state === 'connecting' ? 'connecting'
        : 'offline';
    const updated: Peer = { ...existing, status: mapped, lastSeenAt: Date.now() };
    this.peers.set(peerId, updated);
    await upsertIdentity(updated);
    this.emit({ type: 'peer-update', peer: updated });
  }

  private async onPayloadReceived(from: PeerId, data: Uint8Array): Promise<void> {
    let envelope: MeshMessageEnvelope;
    try {
      const text = new TextDecoder().decode(data);
      const parsed: unknown = JSON.parse(text);
      if (!validateEnvelope(parsed)) {
        const pid = typeof (parsed as { id?: unknown } | null)?.id === 'string'
          ? asMeshMessageId((parsed as { id: string }).id)
          : asMeshMessageId('unknown-malformed');
        this.emit({ type: 'message-dropped', messageId: pid, reason: 'malformed' });
        return;
      }
      envelope = parsed;
    } catch {
      this.emitError('payload is not valid JSON');
      return;
    }

    const expectedId = await computeMessageId(
      envelope.senderId,
      envelope.timestamp,
      envelope.nonce,
    );
    if (envelope.id !== expectedId) {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'invalid-signature',
        detail: 'id mismatch',
      });
      return;
    }

    const senderPeer = await getIdentity(envelope.senderId);
    if (!senderPeer || senderPeer.publicKey.length === 0) {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'invalid-signature',
        detail: 'unknown sender pubkey',
      });
      return;
    }

    const sigOk = await verifyEnvelope(senderPeer.publicKey, envelope);
    if (!sigOk) {
      this.emit({ type: 'message-dropped', messageId: envelope.id, reason: 'invalid-signature' });
      return;
    }

    const decision = this.router.route(envelope);

    if (decision.action === 'drop') {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: decision.reason,
      });
      return;
    }

    if (decision.action === 'relay') {
      const bytes = new TextEncoder().encode(JSON.stringify(decision.envelope));
      try {
        await this.transport.broadcast(bytes);
      } catch (err) {
        this.emitError(`relay failed: ${describeError(err)}`);
      }
      if (decision.envelope.recipientId === 'broadcast') {
        await this.deliverLocally(envelope, from);
      }
    } else {
      await this.deliverLocally(envelope, from);
    }
  }

  private async deliverLocally(envelope: MeshMessageEnvelope, receivedFrom: PeerId): Promise<void> {
    let payload: PlaintextPayload;
    try {
      const raw = fromBase64(envelope.ciphertext);
      const text = new TextDecoder().decode(new Uint8Array(raw));
      payload = JSON.parse(text) as PlaintextPayload;
    } catch {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'malformed',
        detail: 'payload parse failed',
      });
      return;
    }

    const decrypted: DecryptedMeshMessage = {
      header: {
        id: envelope.id,
        senderId: envelope.senderId,
        recipientId: envelope.recipientId,
        kind: envelope.kind,
        priority: envelope.priority,
        timestamp: envelope.timestamp,
        hopCount: envelope.hopCount,
        maxHops: envelope.maxHops,
        ttlMs: envelope.ttlMs,
        routePath: envelope.routePath,
      },
      plaintext: payload.text,
      metadata: payload.metadata,
      localStatus: 'received',
    };

    await saveMessage(decrypted);

    if (payload.kind === 'sos') {
      const md = payload.metadata ?? {};
      const type = (md.type as SignalType | undefined) ?? 'need-help';
      const level = (md.level as EmergencyLevel | undefined) ?? 'urgent';
      const coords = (md.coordinates as EmergencySignal['coordinates'] | undefined) ?? null;
      const sender = await getIdentity(envelope.senderId);
      const signal: EmergencySignal = {
        id: envelope.id,
        senderId: envelope.senderId,
        senderDisplayName: sender?.displayName ?? envelope.senderId,
        type,
        level,
        timestamp: envelope.timestamp,
        message: payload.text,
        coordinates: coords,
        hopCount: envelope.hopCount,
        routePath: envelope.routePath,
        status: 'active',
      };
      await saveSos(signal);
      this.emit({ type: 'sos-received', signal });
    }

    this.emit({ type: 'message-received', message: decrypted });
    void receivedFrom;
  }

  private async drainOutbox(): Promise<void> {
    const items = await listOutbox();
    const now = Date.now();
    for (const item of items) {
      if (item.nextAttemptAt > now) continue;
      if (now - item.createdAt > this.config.outbox.ttlMs) {
        await removeFromOutbox(item.messageId);
        continue;
      }
      try {
        const data = new TextEncoder().encode(JSON.stringify(item.envelope));
        await this.transport.broadcast(data);
        await removeFromOutbox(item.messageId);
      } catch {
        const backoff = Math.min(60_000, 5_000 * 2 ** item.attempts);
        await updateOutboxAttempt(item.messageId, now + backoff);
      }
    }
  }

  // ─── helpers ───────────────────────────────────────────────────────────────

  private setState(next: EngineState): void {
    this.state = next;
    this.emit({ type: 'state-change', state: next });
  }

  private emit(ev: EngineEvent): void {
    for (const l of this.listeners) l(ev);
  }

  private emitError(msg: string): void {
    this.emit({ type: 'transport-error', error: msg });
  }
}

function randomNonceB64(): string {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  return toBase64(nonce.buffer);
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
