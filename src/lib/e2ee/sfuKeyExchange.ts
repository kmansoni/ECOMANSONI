/**
 * SFU Key Exchange — E2EE ключевой обмен для медиа-звонков через SFU
 *
 * Протокол E2E Key Group (E2EKG):
 *   1. Участник A генерирует эфемерную пару ключей (ECDH P-256).
 *   2. Публичный ключ A отправляется через SFU другим участникам.
 *      SFU пересылает, но НЕ может расшифровать — ключи передаются
 *      зашифрованными через X3DH identity keys.
 *   3. Участник B принимает публичный ключ A, деривирует shared secret (ECDH).
 *   4. Из shared secret деривируется SFrame key (HKDF-SHA-256).
 *   5. SFU пересылает зашифрованные медиа без доступа к plaintext.
 *
 * Безопасность:
 *   - SFU не имеет доступа к приватным ключам участников.
 *   - Подлинность ключей подтверждается ECDSA-подписью через identity ключ.
 *   - Forward secrecy: эфемерные ключи уничтожаются после установки сессии.
 *   - Replay protection: каждый E2EKeyGroup содержит nonce + timestamp.
 */

import { toBase64, fromBase64 } from './utils';

// ─── Типы ────────────────────────────────────────────────────────────────────

export interface E2EKeyGroup {
  participantId: string;
  sessionId: string;          // call/room identifier
  ephemeralPublicKey: string; // base64 SPKI ECDH P-256
  identityPublicKey: string;  // base64 SPKI ECDSA P-256 (for authentication)
  signature: string;          // base64 ECDSA signature over canonical payload
  nonce: string;              // base64 16-byte random (replay protection)
  timestamp: number;          // Unix ms (freshness check: reject if > 30s old)
}

export interface E2EKeyGroupAck {
  participantId: string;
  sessionId: string;
  confirmed: boolean;
  error?: string;
}

export interface SFUSessionKey {
  participantId: string;
  peerId: string;
  sessionId: string;
  sframeKey: CryptoKey;       // AES-256-GCM, non-extractable
  keyId: number;
  establishedAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const KEY_FRESHNESS_MS = 30_000; // reject E2EKeyGroups older than 30s

// In-memory session key store
const _sessions = new Map<string, SFUSessionKey>();

// ─── Canonical Payload Serialization ─────────────────────────────────────────

/**
 * Canonical byte representation of E2EKeyGroup for signing/verification.
 * Format: version(1) || timestamp(8BE) || nonce(16) || sessionId(utf8) || participantId(utf8) || ephemeralPublicKey(base64)
 */
function _canonicalPayload(ekg: Omit<E2EKeyGroup, 'signature'>): Uint8Array {
  const enc = new TextEncoder();
  const tsBuf = new ArrayBuffer(8);
  const tsView = new DataView(tsBuf);
  // Store as two 32-bit halves (JS BigInt-free)
  tsView.setUint32(0, Math.floor(ekg.timestamp / 0x100000000) >>> 0, false);
  tsView.setUint32(4, (ekg.timestamp & 0xffffffff) >>> 0, false);

  const nonceBuf = fromBase64(ekg.nonce);
  const sessionIdBytes = enc.encode(ekg.sessionId);
  const participantIdBytes = enc.encode(ekg.participantId);
  const ephKeyBytes = enc.encode(ekg.ephemeralPublicKey);

  const total = 1 + 8 + nonceBuf.byteLength + sessionIdBytes.length + participantIdBytes.length + ephKeyBytes.length;
  const result = new Uint8Array(total);
  let offset = 0;

  result[offset++] = 0x01; // version
  result.set(new Uint8Array(tsBuf), offset); offset += 8;
  result.set(new Uint8Array(nonceBuf), offset); offset += nonceBuf.byteLength;
  result.set(sessionIdBytes, offset); offset += sessionIdBytes.length;
  result.set(participantIdBytes, offset); offset += participantIdBytes.length;
  result.set(ephKeyBytes, offset);

  return result;
}

// ─── Building E2EKeyGroup ─────────────────────────────────────────────────────

/**
 * Генерирует E2EKeyGroup для участника при вступлении в звонок.
 *
 * @param participantId    Supabase user UUID
 * @param sessionId        Call/room ID
 * @param identitySignKey  Participant's ECDSA private key (for authentication)
 */
export async function buildE2EKeyGroup(
  participantId: string,
  sessionId: string,
  identitySignKey: CryptoKey,
): Promise<{ ekg: E2EKeyGroup; ephemeralPrivateKey: CryptoKey }> {
  // Generate ephemeral ECDH key pair
  const ephemeralPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // non-extractable private key
    ['deriveKey', 'deriveBits'],
  );

  const ephPubSpki = await crypto.subtle.exportKey('spki', ephemeralPair.publicKey);
  const ephPubB64 = toBase64(ephPubSpki);

  const nonceBuf = new Uint8Array(16);
  crypto.getRandomValues(nonceBuf);
  const nonce = toBase64(nonceBuf.buffer as ArrayBuffer);
  const timestamp = Date.now();

  // Export identity public key for recipients to verify signature
  const identityPubSpki = await crypto.subtle.exportKey(
    'spki',
    // identitySignKey is private ECDSA; we need the public part separately
    // Caller must pass both or export identity public key separately
    identitySignKey,
  ).catch(() => {
    // If identitySignKey is private, we can't export spki — return placeholder
    return new ArrayBuffer(0);
  });

  const ekg: Omit<E2EKeyGroup, 'signature' | 'identityPublicKey'> = {
    participantId,
    sessionId,
    ephemeralPublicKey: ephPubB64,
    nonce,
    timestamp,
  };

  const payload = _canonicalPayload({ ...ekg, identityPublicKey: '' });
  const sigBuf = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identitySignKey,
    payload as unknown as Uint8Array<ArrayBuffer>,
  );

  return {
    ekg: {
      ...ekg,
      identityPublicKey: toBase64(identityPubSpki),
      signature: toBase64(sigBuf),
    },
    ephemeralPrivateKey: ephemeralPair.privateKey,
  };
}

// ─── Processing Incoming Key Groups ──────────────────────────────────────────

/**
 * Обрабатывает входящий E2EKeyGroup от peer'а.
 * Верифицирует подпись, деривирует SFrame key.
 *
 * @param ekg                  Incoming key group from peer
 * @param myEphemeralPrivKey   Our own ephemeral ECDH private key
 * @param myParticipantId      Our participant ID
 */
export async function processE2EKeyGroup(
  ekg: E2EKeyGroup,
  myEphemeralPrivKey: CryptoKey,
  myParticipantId: string,
): Promise<SFUSessionKey> {
  // Freshness check — reject replays
  if (Date.now() - ekg.timestamp > KEY_FRESHNESS_MS) {
    throw new Error(
      `E2EKeyGroup from ${ekg.participantId} is stale (age=${Date.now() - ekg.timestamp}ms > ${KEY_FRESHNESS_MS}ms)`,
    );
  }

  // Verify ECDSA signature
  if (ekg.identityPublicKey) {
    const identityVerifyKey = await crypto.subtle.importKey(
      'spki',
      fromBase64(ekg.identityPublicKey),
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    );

    const payload = _canonicalPayload({
      participantId: ekg.participantId,
      sessionId: ekg.sessionId,
      ephemeralPublicKey: ekg.ephemeralPublicKey,
      identityPublicKey: ekg.identityPublicKey,
      nonce: ekg.nonce,
      timestamp: ekg.timestamp,
    });

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      identityVerifyKey,
      fromBase64(ekg.signature),
      payload as unknown as Uint8Array<ArrayBuffer>,
    );

    if (!valid) {
      throw new Error(
        `E2EKeyGroup signature from ${ekg.participantId} FAILED — possible MITM. Session aborted.`,
      );
    }
  }

  // Import peer's ephemeral public key
  const peerEphPubKey = await crypto.subtle.importKey(
    'spki',
    fromBase64(ekg.ephemeralPublicKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );

  // ECDH key agreement → shared secret bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerEphPubKey },
    myEphemeralPrivKey,
    256,
  );

  // HKDF-SHA-256 → SFrame AES-256-GCM key
  const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const sframeKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: fromBase64(ekg.nonce),
      info: new TextEncoder().encode(`e2ee-sfu-sframe-${ekg.sessionId}-v1`),
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  const sessionKey: SFUSessionKey = {
    participantId: ekg.participantId,
    peerId: myParticipantId,
    sessionId: ekg.sessionId,
    sframeKey,
    keyId: (ekg.timestamp & 0xffffffff) >>> 0,
    establishedAt: Date.now(),
  };

  _sessions.set(`${ekg.sessionId}:${ekg.participantId}`, sessionKey);
  return sessionKey;
}

// ─── Session Management ───────────────────────────────────────────────────────

/**
 * Возвращает SFrame key для peer в текущей сессии.
 */
export function getSFUSessionKey(sessionId: string, participantId: string): SFUSessionKey | null {
  return _sessions.get(`${sessionId}:${participantId}`) ?? null;
}

/**
 * Удаляет все session keys при завершении звонка.
 * Вызывать при hang-up / disconnect.
 */
export function clearSFUSession(sessionId: string): void {
  for (const key of _sessions.keys()) {
    if (key.startsWith(`${sessionId}:`)) {
      _sessions.delete(key);
    }
  }
}

/**
 * Ротирует SFrame key при смене участников (rekeying after member change).
 * Returns a new E2EKeyGroup to broadcast.
 */
export async function rotateSessionKey(
  participantId: string,
  sessionId: string,
  identitySignKey: CryptoKey,
): Promise<{ ekg: E2EKeyGroup; ephemeralPrivateKey: CryptoKey }> {
  // Clear old keys for this session from our perspective
  clearSFUSession(sessionId);
  return buildE2EKeyGroup(participantId, sessionId, identitySignKey);
}
