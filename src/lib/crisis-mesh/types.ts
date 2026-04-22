/**
 * Crisis Mesh — доменная модель.
 * Offline-first mesh-мессенджер для кризисных ситуаций.
 */

// Branded types — защищают от смешивания ID разного назначения
export type PeerId = string & { readonly __brand: 'PeerId' };
export type MeshMessageId = string & { readonly __brand: 'MeshMessageId' };
export type DeviceId = string & { readonly __brand: 'DeviceId' };

export function asPeerId(s: string): PeerId {
  if (!s || s.length < 8 || s.length > 64) {
    throw new Error(`invalid peerId length: ${s?.length ?? 0}`);
  }
  return s as PeerId;
}

export function asMeshMessageId(s: string): MeshMessageId {
  if (!s) throw new Error('empty messageId');
  return s as MeshMessageId;
}

// ─── Peer ────────────────────────────────────────────────────────────────────

export type PeerStatus =
  | 'discovered'      // видим рядом, ещё не подключены
  | 'connecting'
  | 'online'          // активное соединение
  | 'offline'         // был, но исчез
  | 'blocked';        // пользователь заблокировал

export interface Peer {
  id: PeerId;                    // fingerprint Ed25519 pk (base58, 16 симв.)
  displayName: string;           // задаёт пользователь на устройстве
  deviceType: 'android' | 'ios' | 'web' | 'unknown';
  publicKey: Uint8Array;         // Ed25519 public key (32 байта)
  /** ECDH P-256 публичный ключ (SPKI base64). Появляется после handshake. */
  encryptionPublicKey?: string;
  /** unix ms — когда успешно завершён handshake и установлена E2EE-сессия. */
  handshakeCompletedAt?: number;
  status: PeerStatus;
  lastSeenAt: number;            // unix ms
  firstSeenAt: number;
  signalStrength: number | null; // RSSI, dBm (если доступно)
  hopDistance: number;           // 0 — прямой, >0 — через relay
  trustLevel: 'unknown' | 'verified' | 'trusted';
}

// ─── Message ─────────────────────────────────────────────────────────────────

export type MeshMessageKind =
  | 'text'
  | 'sos'
  | 'ack'           // подтверждение доставки
  | 'handshake'     // X3DH prekey exchange
  | 'presence'      // heartbeat
  | 'resolve-sos';  // разрешение SOS сигнала

export type MeshPriority = 0 | 1 | 2 | 3;
export const SOS_PRIORITY: MeshPriority = 3;
export const DEFAULT_PRIORITY: MeshPriority = 1;

export interface MeshMessageHeader {
  id: MeshMessageId;
  senderId: PeerId;
  recipientId: PeerId | 'broadcast';
  kind: MeshMessageKind;
  priority: MeshPriority;
  timestamp: number;              // unix ms
  hopCount: number;               // 0 у отправителя, +1 на каждом relay
  maxHops: number;                // default 10
  ttlMs: number;                  // default 24h
  routePath: PeerId[];            // все пиры через которые прошло (для loop prevention)
}

export interface MeshMessageEnvelope extends MeshMessageHeader {
  /** Зашифрованный payload (Double Ratchet output), base64 */
  ciphertext: string;
  /** Ed25519 подпись поверх header + ciphertext, base64 */
  signature: string;
  /** Nonce для anti-replay, base64 (12 байт) */
  nonce: string;
  /**
   * Proof-of-Work (Hashcash) для anti-Sybil / anti-flood.
   * Обязателен для SOS и для first-contact DM (когда получатель ещё не
   * установил сессию с отправителем). Для обычного трафика опционален.
   */
  pow?: PowProof;
}

/**
 * Hashcash-style PoW: SHA-256(challenge || nonce) имеет ≥ `bits` ведущих нулей.
 * `challenge` строится детерминированно из senderId, recipientId, timestamp и kind
 * — см. `buildFirstContactChallenge` / `buildSosChallenge`.
 */
export interface PowProof {
  /** base64(nonce, 16 байт) */
  nonce: string;
  /** Фактическое число нулевых бит, найденное отправителем. */
  bits: number;
  /** Разновидность challenge — определяет формулу построения на receiver'е. */
  kind: 'first-contact' | 'sos';
}

export interface DecryptedMeshMessage {
  header: MeshMessageHeader;
  /** Расшифрованный plaintext */
  plaintext: string;
  /** Дополнительные метаданные (например, координаты для SOS) */
  metadata?: Record<string, unknown>;
  /** Статус доставки на стороне получателя */
  localStatus: 'received' | 'read';
}

// ─── Emergency Signal (SOS) ──────────────────────────────────────────────────

export type EmergencyLevel = 'info' | 'warning' | 'urgent' | 'critical';
export type SignalType =
  | 'medical'
  | 'fire'
  | 'earthquake'
  | 'flood'
  | 'violence'
  | 'trapped'
  | 'need-help'
  | 'safe';

export interface EmergencySignal {
  id: MeshMessageId;
  senderId: PeerId;
  senderDisplayName: string;
  type: SignalType;
  level: EmergencyLevel;
  timestamp: number;
  message: string;
  coordinates: {
    latitude: number;
    longitude: number;
    accuracyM: number;
  } | null;
  hopCount: number;
  routePath: PeerId[];
  status: 'active' | 'resolved' | 'expired';
  resolvedBy?: PeerId;
  resolvedAt?: number;
}

// ─── Identity (локальная) ────────────────────────────────────────────────────

export interface LocalIdentity {
  peerId: PeerId;
  displayName: string;
  publicKey: Uint8Array;          // Ed25519 32 bytes (raw)
  /**
   * ECDH P-256 публичный ключ (SPKI base64).
   * Используется для установки сессий Double Ratchet с пирами.
   * Привязывается к Ed25519 identity через подпись в handshake.
   */
  ecdhPublicKey: string;
  // Приватные ключи НЕ в этом объекте — лежат в hardwareKeyStorage.
  createdAt: number;
}

// ─── Transport events ────────────────────────────────────────────────────────

export type TransportEvent =
  | { type: 'peer-found'; peerId: PeerId; displayName: string; deviceType: Peer['deviceType']; rssi: number | null }
  | { type: 'peer-lost'; peerId: PeerId }
  | { type: 'payload-received'; from: PeerId; data: Uint8Array }
  | { type: 'connection-state'; peerId: PeerId; state: 'connecting' | 'connected' | 'disconnected' | 'failed'; error?: string }
  | { type: 'transport-error'; error: string };

// ─── Config ──────────────────────────────────────────────────────────────────

export interface CrisisMeshConfig {
  maxHops: number;
  ttlMs: number;
  dedupCacheSize: number;
  messageRateLimitPerMin: number;
  sosRateLimitPerFiveMin: number;
  pow: {
    bitsFirstContact: number;     // 20 бит ≈ 1 сек
    bitsSos: number;              // 24 бит ≈ 10 сек
  };
  outbox: {
    maxSize: number;
    ttlMs: number;
  };
  transport: {
    serviceId: string;
    advertiseName: string;
  };
}

export const DEFAULT_CONFIG: CrisisMeshConfig = {
  maxHops: 10,
  ttlMs: 24 * 60 * 60 * 1000,
  dedupCacheSize: 10_000,
  messageRateLimitPerMin: 10,
  sosRateLimitPerFiveMin: 1,
  pow: {
    bitsFirstContact: 20,
    bitsSos: 24,
  },
  outbox: {
    maxSize: 1000,
    ttlMs: 7 * 24 * 60 * 60 * 1000,
  },
  transport: {
    serviceId: 'app.mansoni.mesh',
    advertiseName: 'mansoni-mesh',
  },
};

// ─── Error types ─────────────────────────────────────────────────────────────

export class CrisisMeshError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_SIGNATURE'
      | 'REPLAY_DETECTED'
      | 'TTL_EXPIRED'
      | 'MAX_HOPS_EXCEEDED'
      | 'LOOP_DETECTED'
      | 'RATE_LIMITED'
      | 'POW_FAILED'
      | 'TRANSPORT_UNAVAILABLE'
      | 'PEER_NOT_FOUND'
      | 'DECRYPTION_FAILED'
      | 'PERMISSION_DENIED'
      | 'NOT_INITIALIZED',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'CrisisMeshError';
  }
}
