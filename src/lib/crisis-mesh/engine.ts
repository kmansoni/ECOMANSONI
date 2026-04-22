/**
 * CrisisMeshEngine — ядро mesh-сети.
 *
 * Связывает: Transport (BLE/Wi-Fi Direct) ↔ Router (dedup/TTL/loops) ↔
 * Crypto (Ed25519 + Double Ratchet) ↔ Storage (IndexedDB).
 *
 * Фазы для каждого сообщения:
 *
 *   SEND (DM):
 *     1. Если нет сессии с recipient — требуется handshake. Ставим payload
 *        в outbox до завершения handshake, отправляем handshake-envelope.
 *     2. Сессия готова и canSend → encryptWithSession(plaintext) → ratchet ciphertext.
 *     3. При first-contact прикладываем PoW (anti-flood).
 *     4. Ed25519.sign(canonical header + ciphertext).
 *
 *   SEND (broadcast text): signed-only, payload = base64(JSON(plaintext)),
 *   (не DM — broadcast всё равно читают все в radius, нет смысла в Ratchet).
 *
 *   SEND (SOS): всегда broadcast, signed + PoW kind='sos' (более тяжёлый
 *   challenge ~24 бит, защита от флуда SOS).
 *
 *   RECEIVE:
 *     1. Parse envelope, validateEnvelope (schema).
 *     2. Если kind='handshake' → специальный path через handshake-verify,
 *        не трогая обычный verifyEnvelope (у нас ещё нет pubkey sender'а).
 *     3. Иначе — verifyEnvelope с pubkey из stored peer.
 *     4. Router: dedup / TTL / hop / loop / rate-limit.
 *     5. Если SOS — verify PoW (obligatory).
 *     6. Если DM и нет session — verify PoW (first-contact).
 *     7. Если DM и session есть — decryptWithSession.
 *     8. Иначе — base64 plaintext (broadcast text).
 */

import { toBase64, fromBase64 } from '@/lib/e2ee/utils';

import {
  buildHandshakePayload,
  verifyHandshakePayload,
} from './crypto/handshake';
import {
  canSend,
  decryptWithSession,
  deserializeSession,
  encryptWithSession,
  initSession,
  serializeSession,
  type SessionRecord,
} from './crypto/session';
import { signEnvelope, verifyEnvelope } from './crypto/signing';
import {
  buildFirstContactChallenge,
  buildSosChallenge,
  findProofOfWork,
  verifyProofOfWork,
} from './crypto/proof-of-work';
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
  PowProof,
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
  deleteSession,
  enqueueOutbox,
  getIdentity,
  getSession,
  listIdentities,
  listOutbox,
  listSessions,
  removeFromOutbox,
  saveMessage,
  saveSos,
  updateOutboxAttempt,
  upsertIdentity,
  upsertSession,
  type StoredOutboxItem,
  type StoredSession,
} from './storage/mesh-db';

export type EngineState = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

export type EngineEventDropReason =
  | RouterDropReason
  | 'invalid-signature'
  | 'invalid-handshake'
  | 'invalid-pow'
  | 'no-session'
  | 'decrypt-failed'
  | 'malformed';

export type EngineEvent =
  | { type: 'peer-update'; peer: Peer }
  | { type: 'peer-lost'; peerId: PeerId }
  | { type: 'message-received'; message: DecryptedMeshMessage }
  | { type: 'message-sent'; messageId: MeshMessageId }
  | { type: 'handshake-completed'; peerId: PeerId; peer: Peer }
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
  /** Ed25519 CryptoKey для подписи envelope'ов. */
  privateKey: CryptoKey;
  /** ECDH P-256 приватный ключ для Double Ratchet. */
  ecdhPrivateKey: CryptoKey;
  transport: MeshTransportBridge;
  config?: Partial<CrisisMeshConfig>;
  /**
   * deviceType, попадающий в handshake. По умолчанию 'web'.
   * В мобильной обёртке нужно явно передать 'android' / 'ios'.
   */
  deviceType?: Peer['deviceType'];
}

interface PlaintextPayload {
  kind: MeshMessageKind;
  text: string;
  metadata?: Record<string, unknown>;
}

export class CrisisMeshEngine {
  readonly identity: LocalIdentity;
  readonly privateKey: CryptoKey;
  readonly ecdhPrivateKey: CryptoKey;
  readonly transport: MeshTransportBridge;
  readonly config: CrisisMeshConfig;
  readonly deviceType: Peer['deviceType'];

  private router: MeshRouter;
  private listeners = new Set<EngineListener>();
  private transportUnsub: (() => void) | null = null;
  private state: EngineState = 'idle';
  private peers = new Map<PeerId, Peer>();
  private sessions = new Map<PeerId, SessionRecord>();
  /** Peers которым мы уже отправили handshake в этой сессии (anti-storm). */
  private handshakesSent = new Set<PeerId>();
  private outboxTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: EngineOptions) {
    this.identity = opts.identity;
    this.privateKey = opts.privateKey;
    this.ecdhPrivateKey = opts.ecdhPrivateKey;
    this.transport = opts.transport;
    this.config = { ...DEFAULT_CONFIG, ...opts.config };
    this.deviceType = opts.deviceType ?? 'web';
    this.router = new MeshRouter(this.identity.peerId, this.config);
  }

  getState(): EngineState {
    return this.state;
  }

  getPeers(): Peer[] {
    return [...this.peers.values()];
  }

  getPeer(peerId: PeerId): Peer | undefined {
    return this.peers.get(peerId);
  }

  hasSession(peerId: PeerId): boolean {
    return this.sessions.has(peerId);
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

    // Восстанавливаем ratchet-сессии.
    const storedSessions = await listSessions();
    for (const s of storedSessions) {
      try {
        const session = await deserializeSession(s.stateJson);
        this.sessions.set(s.peerId, session);
      } catch (err) {
        // Сломанная сессия — удаляем, handshake восстановит.
        await deleteSession(s.peerId);
        this.emitError(`session deserialize failed for ${s.peerId}: ${describeError(err)}`);
      }
    }

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
    this.handshakesSent.clear();
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

  /**
   * Форсировать handshake с peer'ом (например, по нажатию «Добавить контакт»).
   */
  async triggerHandshake(peerId: PeerId): Promise<void> {
    await this.sendHandshake(peerId);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async sendHandshake(to: PeerId | 'broadcast'): Promise<void> {
    // Не спамим handshake одному пиру многократно в одной сессии движка.
    if (to !== 'broadcast' && this.handshakesSent.has(to)) return;
    if (to !== 'broadcast') this.handshakesSent.add(to);

    const payload = await buildHandshakePayload({
      ed25519PublicKey: this.identity.publicKey,
      ed25519PrivateKey: this.privateKey,
      ecdhPublicKeyB64: this.identity.ecdhPublicKey,
      displayName: this.identity.displayName,
      deviceType: this.deviceType,
    });

    const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
    const ciphertext = toBase64(plainBytes);
    const nonce = randomNonceB64();
    const timestamp = Date.now();
    const messageId = await computeMessageId(this.identity.peerId, timestamp, nonce);

    const headerForSign = {
      id: messageId,
      senderId: this.identity.peerId,
      recipientId: to,
      kind: 'handshake' as MeshMessageKind,
      priority: DEFAULT_PRIORITY,
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

    await this.broadcastEnvelope(prepared);
  }

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

    // Выбираем путь шифрования.
    const { ciphertext, pow } = await this.buildCiphertext(
      to,
      plaintext,
      payload.kind,
      payload.metadata,
      timestamp,
    );

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
      ...(pow ? { pow } : {}),
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

  /**
   * Строит payload envelope'а + опциональный PoW.
   * - DM с готовой сессией: Double Ratchet ciphertext.
   * - DM без сессии: исключение (пытаемся сначала handshake, DM не отправляем).
   * - Broadcast text: signed-only base64.
   * - SOS: signed-only + PoW kind='sos'.
   */
  private async buildCiphertext(
    to: PeerId | 'broadcast',
    plaintext: string,
    kind: MeshMessageKind,
    metadata: Record<string, unknown> | undefined,
    timestamp: number,
  ): Promise<{ ciphertext: string; pow?: PowProof }> {
    // SOS — всегда broadcast, всегда с PoW.
    if (kind === 'sos') {
      const bytes = new TextEncoder().encode(plaintext);
      const type = (metadata?.type as string | undefined) ?? 'need-help';
      const challenge = buildSosChallenge(this.identity.peerId, timestamp, type);
      const pow = await findProofOfWork(challenge, this.config.pow.bitsSos, {
        maxIterations: 50_000_000,
      });
      return {
        ciphertext: toBase64(bytes),
        pow: {
          nonce: pow.nonce,
          bits: pow.bits,
          kind: 'sos',
        },
      };
    }

    // Broadcast — signed-only (все пиры в radius видят).
    if (to === 'broadcast') {
      const bytes = new TextEncoder().encode(plaintext);
      return { ciphertext: toBase64(bytes) };
    }

    // DM. Нужна сессия.
    const session = this.sessions.get(to);
    if (!session || !canSend(session)) {
      // Пытаемся ускорить handshake и просим caller'а повторить позже.
      if (!session) {
        void this.sendHandshake(to);
      }
      throw new CrisisMeshError(
        'NOT_INITIALIZED',
        session
          ? `сессия с ${to} в половинчатом состоянии (Bob ждёт сообщения от Alice)`
          : `сессия с ${to} не установлена — handshake выполняется, повторите через секунду`,
      );
    }

    const encrypted = await encryptWithSession(session, plaintext);
    await this.persistSession(session);

    // PoW first-contact: первое сообщение в этой сессии.
    let pow: PowProof | undefined;
    const peer = this.peers.get(to);
    if (peer && !peer.handshakeCompletedAt && session.role === 'alice') {
      // Слабый сигнал — handshake ещё не закреплён endpoint'ом. Прикладываем PoW.
      const challenge = buildFirstContactChallenge(this.identity.peerId, to, timestamp);
      const found = await findProofOfWork(challenge, this.config.pow.bitsFirstContact, {
        maxIterations: 20_000_000,
      });
      pow = { nonce: found.nonce, bits: found.bits, kind: 'first-contact' };
    }

    return { ciphertext: encrypted.ciphertext, ...(pow ? { pow } : {}) };
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

    // Если мы ещё не знаем их Ed25519 publicKey — шлём handshake первыми.
    // Обе стороны делают то же самое → обе получат handshake друг друга.
    if (peer.publicKey.length === 0 || !peer.encryptionPublicKey) {
      void this.sendHandshake(peer.id);
    }
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

    // Handshake — отдельный путь (до того как мы знаем publicKey отправителя).
    if (envelope.kind === 'handshake') {
      await this.onHandshakeReceived(envelope);
      return;
    }

    const senderPeer = await getIdentity(envelope.senderId);
    if (!senderPeer || senderPeer.publicKey.length === 0) {
      // Нет публичного ключа → не можем проверить подпись. Триггерим handshake.
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'invalid-signature',
        detail: 'unknown sender pubkey',
      });
      void this.sendHandshake(envelope.senderId);
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

  private async onHandshakeReceived(envelope: MeshMessageEnvelope): Promise<void> {
    // Парсим payload.
    let payload: unknown;
    try {
      const raw = fromBase64(envelope.ciphertext);
      const text = new TextDecoder().decode(new Uint8Array(raw));
      payload = JSON.parse(text);
    } catch {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'invalid-handshake',
        detail: 'payload parse failed',
      });
      return;
    }

    const verified = await verifyHandshakePayload(envelope.senderId, payload);
    if (!verified) {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'invalid-handshake',
      });
      return;
    }

    // Теперь можем проверить подпись envelope'а самим handshake'ом (anti-replay).
    const sigOk = await verifyEnvelope(verified.ed25519PublicKey, envelope);
    if (!sigOk) {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'invalid-signature',
        detail: 'handshake envelope signature',
      });
      return;
    }

    // TOFU: если это first-contact, принимаем. Если у нас уже был другой pub — alert.
    const existing = await getIdentity(envelope.senderId);
    if (
      existing &&
      existing.publicKey.length > 0 &&
      !uint8Equals(existing.publicKey, verified.ed25519PublicKey)
    ) {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'invalid-handshake',
        detail: 'publicKey mismatch (TOFU)',
      });
      return;
    }

    const now = Date.now();
    const peer: Peer = existing
      ? {
          ...existing,
          displayName: verified.displayName,
          deviceType: verified.deviceType,
          publicKey: verified.ed25519PublicKey,
          encryptionPublicKey: verified.ecdhPublicKeyB64,
          status: 'online',
          lastSeenAt: now,
        }
      : {
          id: envelope.senderId,
          displayName: verified.displayName,
          deviceType: verified.deviceType,
          publicKey: verified.ed25519PublicKey,
          encryptionPublicKey: verified.ecdhPublicKeyB64,
          status: 'online',
          firstSeenAt: now,
          lastSeenAt: now,
          signalStrength: null,
          hopDistance: 0,
          trustLevel: 'unknown',
        };

    // Инициализируем ratchet-сессию.
    try {
      const session = await initSession({
        selfPeerId: this.identity.peerId,
        peerPeerId: envelope.senderId,
        ourEcdhPrivate: this.ecdhPrivateKey,
        ourEcdhPublicKeyB64: this.identity.ecdhPublicKey,
        peerEcdhPublicKeyB64: verified.ecdhPublicKeyB64,
      });
      this.sessions.set(envelope.senderId, session);
      await this.persistSession(session);
      peer.handshakeCompletedAt = now;
    } catch (err) {
      this.emit({
        type: 'message-dropped',
        messageId: envelope.id,
        reason: 'invalid-handshake',
        detail: `session init failed: ${describeError(err)}`,
      });
      return;
    }

    this.peers.set(peer.id, peer);
    await upsertIdentity(peer);
    this.emit({ type: 'peer-update', peer });
    this.emit({ type: 'handshake-completed', peerId: peer.id, peer });

    // Отвечаем handshake'ом, если сами ещё не слали.
    if (!this.handshakesSent.has(peer.id)) {
      void this.sendHandshake(peer.id);
    }
  }

  private async deliverLocally(envelope: MeshMessageEnvelope, receivedFrom: PeerId): Promise<void> {
    // PoW для SOS — обязателен.
    if (envelope.kind === 'sos') {
      const ok = await this.verifyPow(envelope);
      if (!ok) {
        this.emit({
          type: 'message-dropped',
          messageId: envelope.id,
          reason: 'invalid-pow',
          detail: 'sos pow missing/invalid',
        });
        return;
      }
    }

    // Решаем: это DM для нас, DM для другого (broadcast payload внутри) или
    // настоящий broadcast.
    const isDirectDm = envelope.recipientId === this.identity.peerId;

    let plaintextStr: string;
    let payload: PlaintextPayload;

    if (isDirectDm) {
      // Для first-contact DM (session ещё не установлена) — PoW обязателен.
      const session = this.sessions.get(envelope.senderId);
      if (!session) {
        const powOk = await this.verifyPow(envelope);
        if (!powOk) {
          this.emit({
            type: 'message-dropped',
            messageId: envelope.id,
            reason: 'no-session',
            detail: 'DM без сессии и без валидного first-contact PoW',
          });
          return;
        }
        // Даже валидный PoW не даёт расшифровать — но может сообщить UI
        // что «вас хочет добавить peer X».
        this.emit({
          type: 'message-dropped',
          messageId: envelope.id,
          reason: 'no-session',
          detail: 'handshake ещё не завершён, сообщение отброшено',
        });
        void this.sendHandshake(envelope.senderId);
        return;
      }

      try {
        plaintextStr = await decryptWithSession(session, envelope.ciphertext);
        await this.persistSession(session);
      } catch (err) {
        this.emit({
          type: 'message-dropped',
          messageId: envelope.id,
          reason: 'decrypt-failed',
          detail: describeError(err),
        });
        return;
      }

      try {
        payload = JSON.parse(plaintextStr) as PlaintextPayload;
      } catch {
        this.emit({
          type: 'message-dropped',
          messageId: envelope.id,
          reason: 'malformed',
          detail: 'dm plaintext JSON parse failed',
        });
        return;
      }
    } else {
      // Broadcast / чужой recipient на котором мы просто delivered (broadcast).
      try {
        const raw = fromBase64(envelope.ciphertext);
        plaintextStr = new TextDecoder().decode(new Uint8Array(raw));
        payload = JSON.parse(plaintextStr) as PlaintextPayload;
      } catch {
        this.emit({
          type: 'message-dropped',
          messageId: envelope.id,
          reason: 'malformed',
          detail: 'broadcast payload parse failed',
        });
        return;
      }
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

  private async verifyPow(envelope: MeshMessageEnvelope): Promise<boolean> {
    if (!envelope.pow) return false;
    try {
      let challenge: Uint8Array;
      let bits: number;
      if (envelope.pow.kind === 'sos') {
        const md = (() => {
          try {
            const raw = fromBase64(envelope.ciphertext);
            const text = new TextDecoder().decode(new Uint8Array(raw));
            const parsed = JSON.parse(text) as PlaintextPayload;
            return (parsed.metadata as { type?: string } | undefined) ?? {};
          } catch {
            return {} as { type?: string };
          }
        })();
        const type = md.type ?? 'need-help';
        challenge = buildSosChallenge(envelope.senderId, envelope.timestamp, type);
        bits = this.config.pow.bitsSos;
      } else {
        challenge = buildFirstContactChallenge(
          envelope.senderId,
          envelope.recipientId,
          envelope.timestamp,
        );
        bits = this.config.pow.bitsFirstContact;
      }
      const nonce = new Uint8Array(fromBase64(envelope.pow.nonce));
      return await verifyProofOfWork(challenge, nonce, bits);
    } catch {
      return false;
    }
  }

  private async persistSession(session: SessionRecord): Promise<void> {
    try {
      const stateJson = await serializeSession(session);
      const row: StoredSession = {
        peerId: session.peerId,
        stateJson,
        role: session.role,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      };
      await upsertSession(row);
    } catch (err) {
      // Не роняем engine — ratchet state остаётся в памяти.
      this.emitError(`persist session failed: ${describeError(err)}`);
    }
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
  return toBase64(nonce);
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function uint8Equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
