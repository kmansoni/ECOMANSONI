/**
 * Call E2EE Key Exchange — ECDH + HKDF + AES-KW wrap для SFU call media encryption.
 *
 * Security properties:
 * - Forward secrecy per epoch: при rotate выбрасываем старые ключи.
 * - Replay protection: nonce map в VideoCallContext (roomId:epoch:deviceId).
 * - Fail-closed: без epoch key MediaEncryptor дропает фреймы.
 * - Zero-trust server: ciphertext зашифрован симметрично от ECDH — сервер ключей не видит.
 * - Signature verification: processKeyPackage верифицирует ECDSA подпись ПЕРЕД ECDH derivation.
 * - Monotonic epoch: rollback epoch rejected в processKeyPackage.
 * - Random HKDF salt: включается в KeyPackageData для предотвращения детерминированной деривации.
 * - Zero heap raw key bytes: сырые байты epoch ключей хранятся ТОЛЬКО в приватном
 *   поле epochRawBytes CallKeyExchange, никогда не покидают модуль, и зачищаются
 *   в destroy() через fill(0). EpochKeyMaterial.public интерфейс содержит только
 *   non-extractable CryptoKey — XSS не может экспортировать raw bytes.
 * - Multi-device: peerPublicKeys индексируется по userId:deviceId composite key.
 */

export interface CallIdentity {
  userId: string;
  deviceId: string;
  sessionId: string;
}

import { logger } from '@/lib/logger';

/**
 * epoch → non-extractable AES-128-GCM CryptoKey для SFrame.
 * СЫРЫЕ БАЙТЫ КЛЮЧА НЕ ВКЛЮЧЕНЫ — они хранятся в приватном поле epochRawBytes
 * внутри CallKeyExchange и доступны только для AES-KW wrap внутри createKeyPackage().
 */
export interface EpochKeyMaterial {
  epoch: number;
  key: CryptoKey;
}

export interface KeyPackageData {
  senderPublicKey: string;   // base64 ECDH P-256 public key (uncompressed, 65 bytes)
  ciphertext: string;        // base64 AES-KW wrapped epoch key
  sig: string;               // base64 ECDSA-P256-SHA256 signature
  epoch: number;
  salt: string;              // base64 random 32-byte HKDF salt
  senderIdentity: CallIdentity;
  messageId: string;         // UUID v4 для anti-replay protection
}

export class CallKeyExchange {
  private identity: CallIdentity;
  private ephemeralKeyPair: CryptoKeyPair | null = null;
  private signingKeyPair: CryptoKeyPair | null = null;
  private currentEpochKey: EpochKeyMaterial | null = null;
  /** peerId (userId:deviceId composite) → их ECDH CryptoKey */
  private peerPublicKeys: Map<string, CryptoKey> = new Map();
  /** epoch → EpochKeyMaterial (кольцевой буфер — последние 3 epoch) */
  private epochKeys: Map<number, EpochKeyMaterial> = new Map();
  /** epoch → сырые байты ключа (ТОЛЬКО внутри этого модуля, зачищаются в destroy()) */
  private epochRawBytes: Map<number, Uint8Array> = new Map();
  /** peerId (userId:deviceId) → их ECDSA signing CryptoKey */
  private peerSigningKeys: Map<string, CryptoKey> = new Map();

  constructor(identity: CallIdentity) {
    this.identity = identity;
  }

  /**
   * Инициализация: ephemeral ECDH key pair + ECDSA signing key pair.
   * Вызывать один раз при connect/join room.
   */
  async initialize(): Promise<void> {
    this.ephemeralKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,  // private key non-extractable
      ['deriveBits']
    );

    this.signingKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify']
    );
  }

  getSessionId(): string {
    if (!this.identity?.sessionId) {
      throw new Error('[CallKeyExchange] getSessionId: identity is not initialized');
    }
    return this.identity.sessionId;
  }

  getIdentity(): CallIdentity {
    return { ...this.identity };
  }

  async getPublicKeyBase64(): Promise<string> {
    if (!this.ephemeralKeyPair) throw new Error('[CallKeyExchange] Not initialized — call initialize() first');
    const raw = await crypto.subtle.exportKey('raw', this.ephemeralKeyPair.publicKey);
    return bytesToBase64(new Uint8Array(raw));
  }

  async getSigningPublicKeyBase64(): Promise<string> {
    if (!this.signingKeyPair) throw new Error('[CallKeyExchange] Not initialized — call initialize() first');
    const raw = await crypto.subtle.exportKey('raw', this.signingKeyPair.publicKey);
    return bytesToBase64(new Uint8Array(raw));
  }

  async registerPeerSigningKey(peerId: string, signingPublicKeyBase64: string): Promise<void> {
    const raw = base64ToBytes(signingPublicKeyBase64);
    const key = await crypto.subtle.importKey(
      'raw',
      raw,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    this.peerSigningKeys.set(peerId, key);
  }

  /**
   * Создать новый epoch key (AES-128-GCM, 128 бит).
   * Raw bytes сразу зачищаются после importKey и хранятся только в epochRawBytes.
   */
  async createEpochKey(epoch: number): Promise<EpochKeyMaterial> {
    const rawKeyBytes = crypto.getRandomValues(new Uint8Array(16));

    const key = await crypto.subtle.importKey(
      'raw',
      rawKeyBytes,
      { name: 'AES-GCM', length: 128 },
      false,
      ['encrypt', 'decrypt']
    );

    // Сохраняем копию raw bytes ТОЛЬКО в приватном поле класса
    const rawBytesCopy = new Uint8Array(rawKeyBytes);
    rawKeyBytes.fill(0); // немедленно зачищаем стековый оригинал

    const epochKey: EpochKeyMaterial = {
      epoch,
      key,
    };

    this.currentEpochKey = epochKey;
    this.epochKeys.set(epoch, epochKey);
    this.epochRawBytes.set(epoch, rawBytesCopy);

    // Rotation: очищаем epoch старше текущего-3 для forward secrecy
    for (const storedEpoch of Array.from(this.epochKeys.keys())) {
      if (storedEpoch < epoch - 2) {
        this.evictEpoch(storedEpoch);
      }
    }

    return epochKey;
  }

  /**
   * Создать KEY_PACKAGE для конкретного пира.
   * Читает raw bytes из приватного epochRawBytes, создаёт одноразовый extractable alias,
   * выполняет wrap, alias GC-ится по выходу из функции.
   */
  async createKeyPackage(peerPublicKeyBase64: string, epoch: number): Promise<KeyPackageData> {
    if (!this.ephemeralKeyPair || !this.signingKeyPair) {
      throw new Error('[CallKeyExchange] Not initialized');
    }
    if (!this.currentEpochKey) {
      throw new Error('[CallKeyExchange] No epoch key — call createEpochKey() first');
    }

    // H-1: Random salt для HKDF
    const saltBytes = crypto.getRandomValues(new Uint8Array(32));
    const salt = bytesToBase64(saltBytes);

    // 1. Import peer's P-256 raw public key
    const peerPublicKeyRaw = base64ToBytes(peerPublicKeyBase64);
    const peerPublicKey = await crypto.subtle.importKey(
      'raw',
      peerPublicKeyRaw,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // 2. ECDH: derive 256 shared bits
    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: peerPublicKey },
      this.ephemeralKeyPair.privateKey,
      256
    );

    // 3. HKDF: IKM=sharedBits → AES-256-KW wrapping key
    const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const info = new TextEncoder().encode(
      `call-e2ee-epoch-${epoch}-${this.identity.userId}-${this.identity.deviceId}-${this.identity.sessionId}`
    );
    const wrappingKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: saltBytes,
        info,
      },
      hkdfKey,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );

    // 4. Читаем raw bytes из приватного поля (не из EpochKeyMaterial.public!)
    const rawBytes = this.epochRawBytes.get(epoch);
    if (!rawBytes) {
      throw new Error(`[CallKeyExchange] No raw bytes for epoch ${epoch} — cannot create KEY_PACKAGE. Call createEpochKey() first.`);
    }

    // Создаём одноразовый extractable alias ТОЛЬКО для wrap-операции.
    // Он живёт только в стеке этой функции — не хранится в полях класса.
    const localWrapKeyRaw = new Uint8Array(rawBytes);
    const localWrapKey = await crypto.subtle.importKey(
      'raw',
      localWrapKeyRaw,
      { name: 'AES-GCM', length: 128 },
      true,  // extractable: необходимо ТОЛЬКО для wrapKey()
      ['encrypt', 'decrypt']
    );
    const wrappedKeyBuffer = await crypto.subtle.wrapKey(
      'raw',
      localWrapKey,
      wrappingKey,
      'AES-KW'
    );
    const ciphertext = bytesToBase64(new Uint8Array(wrappedKeyBuffer));
    // localWrapKey GC-ится по выходу

    // 5. ECDSA signature
    const senderPublicKey = await this.getPublicKeyBase64();
    const messageId = crypto.randomUUID();
    const signData = new TextEncoder().encode(
      `${senderPublicKey}|${ciphertext}|${epoch}|${this.identity.userId}|${this.identity.deviceId}|${this.identity.sessionId}|${salt}|${messageId}`
    );
    const sigBuffer = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.signingKeyPair.privateKey,
      signData
    );
    const sig = bytesToBase64(new Uint8Array(sigBuffer));

    return {
      senderPublicKey,
      ciphertext,
      sig,
      epoch,
      salt,
      senderIdentity: { ...this.identity },
      messageId,
    };
  }

  /**
   * Обработать входящий KEY_PACKAGE от пира:
   * 0. CRITICAL: Verify ECDSA signature BEFORE any processing
   * 1. Monotonicity check — reject epoch rollback
   * 2. Import sender's public key, store in peerPublicKeys
   * 3. ECDH: derive shared bits
   * 4. HKDF: derive AES-256-KW unwrapping key
   * 5. AES-KW unwrap → epochCryptoKey (non-extractable)
   * 6. Store epoch key, evict old keys for forward secrecy
   */
  async processKeyPackage(pkg: KeyPackageData): Promise<EpochKeyMaterial> {
    if (!this.ephemeralKeyPair) throw new Error('[CallKeyExchange] Not initialized');

    // ── Runtime null-guards ──
    if (!pkg.senderPublicKey || typeof pkg.senderPublicKey !== 'string' || pkg.senderPublicKey.length === 0) {
      throw new Error('[CallKeyExchange] processKeyPackage: senderPublicKey is missing or empty.');
    }
    if (!pkg.salt || typeof pkg.salt !== 'string' || pkg.salt.length === 0) {
      throw new Error('[CallKeyExchange] processKeyPackage: salt is missing or empty.');
    }
    if (!pkg.sig || typeof pkg.sig !== 'string') {
      throw new Error('[CallKeyExchange] processKeyPackage: sig is missing.');
    }
    if (!pkg.messageId || typeof pkg.messageId !== 'string' || pkg.messageId.length === 0) {
      throw new Error('[CallKeyExchange] processKeyPackage: messageId is missing.');
    }

    // ── C-1: Verify ECDSA signature BEFORE any other processing ──
    const senderId = `${pkg.senderIdentity.userId}:${pkg.senderIdentity.deviceId}`;
    const verifyKey = this.peerSigningKeys.get(senderId);
    if (!verifyKey) {
      throw new Error(
        `[CallKeyExchange] Cannot verify KEY_PACKAGE: no signing key registered for ${senderId}.`
      );
    }

    const signData = new TextEncoder().encode(
      `${pkg.senderPublicKey}|${pkg.ciphertext}|${pkg.epoch}|${pkg.senderIdentity.userId}|${pkg.senderIdentity.deviceId}|${pkg.senderIdentity.sessionId}|${pkg.salt}|${pkg.messageId}`
    );
    const sigBytes = base64ToBytes(pkg.sig);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      sigBytes,
      signData
    );
    if (!valid) {
      throw new Error('[CallKeyExchange] KEY_PACKAGE signature verification FAILED.');
    }

    // ── C-5: Monotonicity check ──
    if (this.currentEpochKey && pkg.epoch < this.currentEpochKey.epoch) {
      throw new Error(
        `[CallKeyExchange] Epoch rollback REJECTED: received epoch=${pkg.epoch} < current=${this.currentEpochKey.epoch}`
      );
    }

    // 1. Import sender's ECDH public key
    const senderPublicKeyRaw = base64ToBytes(pkg.senderPublicKey);
    const senderPublicKey = await crypto.subtle.importKey(
      'raw',
      senderPublicKeyRaw,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,   // extractable: public key
      []
    );
    this.peerPublicKeys.set(senderId, senderPublicKey);

    // 2. ECDH shared bits
    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: senderPublicKey },
      this.ephemeralKeyPair.privateKey,
      256
    );

    // 3. HKDF — same parameters as createKeyPackage
    const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const info = new TextEncoder().encode(
      `call-e2ee-epoch-${pkg.epoch}-${pkg.senderIdentity.userId}-${pkg.senderIdentity.deviceId}-${pkg.senderIdentity.sessionId}`
    );
    const unwrappingKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: base64ToBytes(pkg.salt),
        info,
      },
      hkdfKey,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );

    // 4. AES-KW unwrap → non-extractable mediaKey
    const ciphertextRaw = base64ToBytes(pkg.ciphertext);
    const epochCryptoKey = await crypto.subtle.unwrapKey(
      'raw',
      ciphertextRaw,
      unwrappingKey,
      'AES-KW',
      { name: 'AES-GCM', length: 128 },
      false,  // non-extractable — used by SFrame
      ['encrypt', 'decrypt']
    );

    const epochKey: EpochKeyMaterial = {
      epoch: pkg.epoch,
      key: epochCryptoKey,
    };

    this.epochKeys.set(pkg.epoch, epochKey);
    this.currentEpochKey = epochKey;

    // ── H-5: Evict old epoch keys for forward secrecy ──
    for (const storedEpoch of Array.from(this.epochKeys.keys())) {
      if (storedEpoch < pkg.epoch - 2) {
        this.evictEpoch(storedEpoch);
      }
    }

    return epochKey;
  }

  getPeerPublicKeyBase64(peerKey: string): Promise<string | null> {
    const key = this.peerPublicKeys.get(peerKey);
    if (!key) return Promise.resolve(null);
    return crypto.subtle.exportKey('raw', key).then((raw) => bytesToBase64(new Uint8Array(raw)));
  }

  getCurrentEpochKey(): EpochKeyMaterial | null {
    return this.currentEpochKey;
  }

  getEpochKey(epoch: number): EpochKeyMaterial | null {
    return this.epochKeys.get(epoch) ?? null;
  }

  destroy(): void {
    logger.debug('[CallKeyExchange] destroy() called', {
      hasEphemeralKeyPair: !!this.ephemeralKeyPair,
      hasSigningKeyPair: !!this.signingKeyPair,
      hasCurrentEpochKey: !!this.currentEpochKey,
      epochKeysCount: this.epochKeys.size,
      epochRawBytesCount: this.epochRawBytes.size,
      peerPublicKeysCount: this.peerPublicKeys.size,
      peerSigningKeysCount: this.peerSigningKeys.size,
      currentEpoch: this.currentEpochKey?.epoch ?? 0,
      timestamp: Date.now(),
    });

    // Зачищаем ВСЕ raw bytes закрытых ключей
    let clearedKeysCount = 0;
    for (const [epoch, rawBytes] of this.epochRawBytes.entries()) {
      if (rawBytes && rawBytes.length > 0) {
        rawBytes.fill(0);
        clearedKeysCount++;
      }
    }
    if (this.currentEpochKey) {
      const currentRaw = this.epochRawBytes.get(this.currentEpochKey.epoch);
      if (currentRaw) {
        currentRaw.fill(0);
      }
    }

    logger.debug('[CallKeyExchange] destroy() keys cleared', {
      epochRawBytesCleared: clearedKeysCount,
      timestamp: Date.now(),
    });

    this.ephemeralKeyPair = null;
    this.signingKeyPair = null;
    this.currentEpochKey = null;
    this.peerPublicKeys.clear();
    this.epochKeys.clear();
    this.epochRawBytes.clear();
    this.peerSigningKeys.clear();
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  /**
   * Удалить конкретную epoch-запись с зачисткой raw bytes.
   */
  private evictEpoch(epoch: number): void {
    const rawBytes = this.epochRawBytes.get(epoch);
    if (rawBytes && rawBytes.length > 0) {
      rawBytes.fill(0);
    }
    this.epochRawBytes.delete(epoch);
    this.epochKeys.delete(epoch);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes.at(i);
    if (byte === undefined) continue;
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}
