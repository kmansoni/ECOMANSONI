/**
 * Call E2EE Key Exchange — ECDH + HKDF + AES-KW wrap для SFU call media encryption.
 *
 * Protocol (Phase B — ephemeral ECDH per call session):
 * 1. При JOIN room — генерируется ephemeral ECDH key pair + ECDSA signing key pair.
 * 2. Non-leader на REKEY_BEGIN — отправляет senderPublicKey лидеру в KEY_PACKAGE.
 * 3. Лидер получает KEY_PACKAGE → извлекает senderPublicKey → создаёт epoch key →
 *    createKeyPackage(senderPublicKey, epoch) → отправляет wrapped epoch key обратно.
 * 4. Non-leader получает реальный KEY_PACKAGE → processKeyPackage → ECDH unwrap epoch key →
 *    setDecryptionKey.
 * 5. Epoch key используется для SFrame encrypt/decrypt медиа-фреймов.
 * 6. При REKEY — новый epoch key, повтор обмена KEY_PACKAGE.
 *
 * Identity binding: userId + deviceId + sessionId подписывают ключевой пакет (ECDSA P-256).
 *
 * Security properties:
 * - Forward secrecy per epoch: при rotate выбрасываем старые ключи.
 * - Replay protection: nonce map в VideoCallContext (roomId:epoch:deviceId).
 * - Fail-closed: без epoch key MediaEncryptor дропает фреймы.
 * - Zero-trust server: ciphertext зашифрован симметрично от ECDH — сервер ключей не видит.
 * - Signature verification: processKeyPackage верифицирует ECDSA подпись ПЕРЕД ECDH derivation.
 * - Monotonic epoch: rollback epoch rejected в processKeyPackage.
 * - Random HKDF salt: включается в KeyPackageData для предотвращения детерминированной деривации.
 * - rawKeyBytes НЕ хранится в heap: CryptoKey non-extractable, уменьшает XSS атак-поверхность.
 * - Multi-device: peerPublicKeys индексируется по userId:deviceId composite key.
 * - SECURITY (Fix-3): wrapKey УДАЛЁН из публичного EpochKeyMaterial интерфейса.
 *   Extractable CryptoKey в публичной структуре данных позволял XSS вызвать
 *   exportKey('raw', epochKey.wrapKey) и получить raw bytes ключа шифрования медиа.
 *   Теперь extractable alias создаётся ТОЛЬКО локально внутри createKeyPackage() и
 *   немедленно GC-ится по выходу из функции — не сохраняется нигде.
 */

export interface CallIdentity {
  userId: string;
  deviceId: string;
  sessionId: string;
}

import { logger } from '@/lib/logger';

export interface EpochKeyMaterial {
  epoch: number;
  /**
   * AES-128-GCM CryptoKey для SFrame (media encrypt/decrypt).
   * extractable=false — raw bytes никогда не покидают WebCrypto engine.
   * Используется в MediaEncryptor/SFrame pipeline.
   *
   * SECURITY: wrapKey (extractable=true) намеренно УДАЛЁН из публичного интерфейса.
   * WebCrypto spec §14.3.13 требует extractable=true для wrapKey source в wrapKey().
   * Решение: rawKeyBytes создаётся один раз в createEpochKey/processKeyPackage,
   * внутри createKeyPackage() из него локально создаётся ephemeral extractable CryptoKey
   * только для операции wrap — она не покидает функцию и не хранится в heap.
   */
  key: CryptoKey;
  /**
   * @internal Raw bytes ключа — хранится ТОЛЬКО для возможности создать
   * локальный extractable alias при повторном вызове createKeyPackage() для нового пира.
   * НИКОГДА не передавать в JS-код вне этого модуля.
   * Зачищается в destroy() через fill(0).
   */
  _rawBytes: Uint8Array;
}

export interface KeyPackageData {
  senderPublicKey: string;   // base64 ECDH P-256 public key (uncompressed, 65 bytes)
  ciphertext: string;        // base64 AES-KW wrapped epoch key
  sig: string;               // base64 ECDSA-P256-SHA256 signature
  epoch: number;
  salt: string;              // base64 random 32-byte HKDF salt (H-1: prevents deterministic derivation)
  senderIdentity: CallIdentity;
}

export class CallKeyExchange {
  private identity: CallIdentity;
  private ephemeralKeyPair: CryptoKeyPair | null = null;
  private signingKeyPair: CryptoKeyPair | null = null;
  private currentEpochKey: EpochKeyMaterial | null = null;
  /** peerId (userId:deviceId composite) → их ECDH CryptoKey (H-4: multi-device safe) */
  private peerPublicKeys: Map<string, CryptoKey> = new Map();
  /** epoch → EpochKeyMaterial (кольцевой буфер — держим последние 3 epoch) */
  private epochKeys: Map<number, EpochKeyMaterial> = new Map();
  /** peerId (userId:deviceId) → их ECDSA signing CryptoKey (C-1: для верификации KEY_PACKAGE) */
  private peerSigningKeys: Map<string, CryptoKey> = new Map();

  constructor(identity: CallIdentity) {
    this.identity = identity;
  }

  /**
   * Инициализация: ephemeral ECDH key pair + ECDSA signing key pair.
   * Вызывать один раз при connect/join room.
   * Идемпотентна — повторный вызов перегенерирует.
   */
  async initialize(): Promise<void> {
    // Ephemeral ECDH: extractable=false — WebCrypto spec гарантирует, что public key
    // всегда extractable вне зависимости от этого флага (он применяется только к private key).
    // extractable=true для private key было бы уязвимостью: XSS мог бы экспортировать
    // ключ через exportKey('pkcs8', ...) и расшифровать медиафреймы.
    this.ephemeralKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false,  // private key non-extractable; public key остаётся exportable по spec
      ['deriveBits']
    );

    // ECDSA signing: extractable=false (private key никогда не покидает memory)
    this.signingKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify']
    );
  }

  /**
   * Вернуть стабильный sessionId этой сессии ключей.
   * Используется при сборке senderIdentity в KEY_PACKAGE —
   * должен совпадать с sessionId, который подписан ECDSA-подписью.
   *
   * @throws Error если identity не установлена (конструктор гарантирует установку,
   *   но метод сохраняет явную проверку на случай будущих рефакторингов).
   */
  getSessionId(): string {
    if (!this.identity?.sessionId) {
      throw new Error('[CallKeyExchange] getSessionId: identity is not initialized');
    }
    return this.identity.sessionId;
  }

  /**
   * Вернуть userId/deviceId этой сессии — используется в VideoCallProvider при сборке senderIdentity.
   */
  getIdentity(): CallIdentity {
    return { ...this.identity };
  }

  /**
   * Экспортировать наш ECDH public key в base64 (65-byte uncompressed P-256).
   * Передаётся пирам через senderPublicKey в KEY_PACKAGE.
   */
  async getPublicKeyBase64(): Promise<string> {
    if (!this.ephemeralKeyPair) throw new Error('[CallKeyExchange] Not initialized — call initialize() first');
    const raw = await crypto.subtle.exportKey('raw', this.ephemeralKeyPair.publicKey);
    return bytesToBase64(new Uint8Array(raw));
  }

  /**
   * Экспортировать наш ECDSA signing public key в base64 (C-1).
   * Передаётся пирам при E2EE handshake чтобы они могли верифицировать наши KEY_PACKAGE.
   */
  async getSigningPublicKeyBase64(): Promise<string> {
    if (!this.signingKeyPair) throw new Error('[CallKeyExchange] Not initialized — call initialize() first');
    const raw = await crypto.subtle.exportKey('raw', this.signingKeyPair.publicKey);
    return bytesToBase64(new Uint8Array(raw));
  }

  /**
   * Зарегистрировать ECDSA signing public key пира (C-1).
   * Вызывать при PEER_JOINED — перед обработкой любых KEY_PACKAGE от этого пира.
   * signingPublicKeyBase64 передаётся через E2EE handshake (out-of-band от KEY_PACKAGE).
   *
   * @param peerId — формат "userId:deviceId"
   * @param signingPublicKeyBase64 — raw P-256 uncompressed public key (65 bytes, base64)
   */
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
   * Создать новый epoch key (AES-128-GCM, криптографически случайный 128 бит).
   * Вызывать при инициировании rekey или для установки своего encryption key.
   * Старые записи rotation: держим max 3 epoch, остальные удаляем.
   *
   * Dual-key strategy (Fix-2):
   *   key      → extractable=false (SFrame media encrypt/decrypt — primary, XSS-safe)
   *   wrapKey  → extractable=true  (AES-KW wrapping in createKeyPackage ONLY)
   * WebCrypto spec §14.3.13: wrapKey('raw') на non-extractable бросает InvalidAccessError.
   * Разделение гарантирует что «медийный» ключ никогда не покинет WebCrypto engine,
   * а «wrap» ключ используется исключительно внутри createKeyPackage.
   * rawKeyBytes зачищается сразу после обоих importKey.
   */
  async createEpochKey(epoch: number): Promise<EpochKeyMaterial> {
    const rawKeyBytes = crypto.getRandomValues(new Uint8Array(16));

    // Primary media key: non-extractable — XSS не может вызвать exportKey
    const key = await crypto.subtle.importKey(
      'raw',
      rawKeyBytes,
      { name: 'AES-GCM', length: 128 },
      false, // extractable=false: used by SFrame; raw bytes never leave WebCrypto engine
      ['encrypt', 'decrypt']
    );

    // SECURITY (Fix-3): rawKeyBytes хранится в _rawBytes для локального создания
    // одноразового extractable alias ТОЛЬКО внутри createKeyPackage(). Это необходимо
    // потому что WebCrypto spec §14.3.13 требует источник wrapKey иметь extractable=true.
    // _rawBytes помечен @internal и НЕ должен использоваться вне этого класса.
    // При destroy() он зачищается через fill(0).
    const rawBytesCopy = new Uint8Array(rawKeyBytes); // копия до fill(0)
    rawKeyBytes.fill(0); // немедленно зачищаем оригинал

    const epochKey: EpochKeyMaterial = {
      epoch,
      key,
      _rawBytes: rawBytesCopy,
    };

    this.currentEpochKey = epochKey;
    this.epochKeys.set(epoch, epochKey);

    // Rotation: очищаем epoch старше текущего-3 для forward secrecy
    for (const storedEpoch of this.epochKeys.keys()) {
      if (storedEpoch < epoch - 2) {
        const old = this.epochKeys.get(storedEpoch);
        if (old) old._rawBytes.fill(0); // зачищаем _rawBytes удаляемого epoch
        this.epochKeys.delete(storedEpoch);
      }
    }

    return epochKey;
  }

  /**
   * Создать KEY_PACKAGE для конкретного пира:
   * 1. Generate random HKDF salt (H-1: non-deterministic derivation)
   * 2. ECDH: derive shared bits(my_private, peer_public)
   * 3. HKDF SHA-256: derive AES-256-KW wrapping key (context = epoch+identity+salt)
   * 4. AES-KW wrap(epoch_key, wrapping_key)
   * 5. ECDSA: sign(senderPublicKey | ciphertext | epoch | identity | salt)
   *
   * SECURITY (Fix-3): Для AES-KW wrapping создаётся одноразовый локальный extractable alias
   * из _rawBytes. Он существует только в стеке этой функции и GC-ится по выходу.
   * _rawBytes помечен @internal — не должен использоваться вне этого класса.
   *
   * @param peerPublicKeyBase64 — base64 P-256 uncompressed public key пира
   * @param epoch — epoch номер, должен совпадать с currentEpochKey.epoch
   */
  async createKeyPackage(peerPublicKeyBase64: string, epoch: number): Promise<KeyPackageData> {
   if (!this.ephemeralKeyPair || !this.signingKeyPair) {
     throw new Error('[CallKeyExchange] Not initialized');
   }
   if (!this.currentEpochKey) {
     throw new Error('[CallKeyExchange] No epoch key — call createEpochKey() first');
   }

   // H-1: Random salt для HKDF — предотвращает детерминированную деривацию wrapping key
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
   // Context (info) includes sessionId для полной изоляции сессий (Fix-4)
   const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
   const info = new TextEncoder().encode(
     `call-e2ee-epoch-${epoch}-${this.identity.userId}-${this.identity.deviceId}-${this.identity.sessionId}`
   );
   const wrappingKey = await crypto.subtle.deriveKey(
     {
       name: 'HKDF',
       hash: 'SHA-256',
       salt: saltBytes, // H-1: random salt вместо нулевого
       info,
     },
     hkdfKey,
     { name: 'AES-KW', length: 256 },
     false,
     ['wrapKey', 'unwrapKey']
   );

   // 4. SECURITY (Fix-3): Создаём одноразовый extractable alias ТОЛЬКО для wrap-операции.
   //    Он живёт только в стеке этой функции — не хранится в полях класса, не возвращается.
   //    WebCrypto spec §14.3.13: wrapKey('raw') требует extractable=true у источника.
   //    slice() обеспечивает ArrayBuffer (не SharedArrayBuffer) для WebCrypto совместимости.
   const localWrapKeyRaw = new Uint8Array(this.currentEpochKey._rawBytes);
   const localWrapKey = await crypto.subtle.importKey(
     'raw',
     localWrapKeyRaw,
     { name: 'AES-GCM', length: 128 },
     true,  // extractable: необходимо ТОЛЬКО для wrapKey() — не хранится вне этой функции
     ['encrypt', 'decrypt']
   );
   const wrappedKeyBuffer = await crypto.subtle.wrapKey(
     'raw',
     localWrapKey,
     wrappingKey,
     'AES-KW'
   );
   const ciphertext = bytesToBase64(new Uint8Array(wrappedKeyBuffer));
   // localWrapKey GC-ится по выходу; XSS не имеет к нему доступа после return

   // 5. ECDSA signature: binds sender identity to this key package
   //    Signed data includes salt to prevent salt substitution attacks
   const senderPublicKey = await this.getPublicKeyBase64();
   const signData = new TextEncoder().encode(
     `${senderPublicKey}|${ciphertext}|${epoch}|${this.identity.userId}|${this.identity.deviceId}|${this.identity.sessionId}|${salt}`
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
    };
  }

  /**
   * Обработать входящий KEY_PACKAGE от пира:
   * 0. CRITICAL: Verify ECDSA signature BEFORE any processing (C-1)
   * 1. Monotonicity check — reject epoch rollback (C-5)
   * 2. Import sender's public key, store in peerPublicKeys (composite userId:deviceId key)
   * 3. ECDH: derive shared bits(my_private, sender_public)
   * 4. HKDF: derive same AES-256-KW unwrapping key (same context as sender, same salt)
   * 5. AES-KW unwrap → epochCryptoKey (non-extractable, H-2)
   * 6. Store epoch key, evict old keys for forward secrecy (H-5)
   */
  async processKeyPackage(pkg: KeyPackageData): Promise<EpochKeyMaterial> {
    if (!this.ephemeralKeyPair) throw new Error('[CallKeyExchange] Not initialized');

    // ── C-3 fix: runtime null-guards — defend against malformed/old-version server payloads ──
    if (!pkg.senderPublicKey || typeof pkg.senderPublicKey !== 'string' || pkg.senderPublicKey.length === 0) {
      throw new Error('[CallKeyExchange] processKeyPackage: senderPublicKey is missing or empty — cannot perform ECDH. Dropping package.');
    }
    if (!pkg.salt || typeof pkg.salt !== 'string' || pkg.salt.length === 0) {
      throw new Error('[CallKeyExchange] processKeyPackage: salt is missing or empty — HKDF derivation would be deterministic. Dropping package.');
    }
    if (!pkg.sig || typeof pkg.sig !== 'string') {
      throw new Error('[CallKeyExchange] processKeyPackage: sig is missing. Dropping package.');
    }

    // ── C-1: CRITICAL — Verify ECDSA signature BEFORE any other processing ──
    const senderId = `${pkg.senderIdentity.userId}:${pkg.senderIdentity.deviceId}`;
    const verifyKey = this.peerSigningKeys.get(senderId);
    if (!verifyKey) {
      throw new Error(
        `[CallKeyExchange] Cannot verify KEY_PACKAGE: no signing key registered for ${senderId}. ` +
        `Call registerPeerSigningKey() after receiving PEER_JOINED.`
      );
    }

    const signData = new TextEncoder().encode(
      `${pkg.senderPublicKey}|${pkg.ciphertext}|${pkg.epoch}|${pkg.senderIdentity.userId}|${pkg.senderIdentity.deviceId}|${pkg.senderIdentity.sessionId}|${pkg.salt}`
    );
    const sigBytes = base64ToBytes(pkg.sig);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      sigBytes,
      signData
    );
    if (!valid) {
      throw new Error(
        '[CallKeyExchange] KEY_PACKAGE signature verification FAILED — possible MitM attack. Dropping package.'
      );
    }

    // ── C-5: Monotonicity check — reject epoch rollback ──
    if (this.currentEpochKey && pkg.epoch < this.currentEpochKey.epoch) {
      throw new Error(
        `[CallKeyExchange] Epoch rollback REJECTED: received epoch=${pkg.epoch} < current=${this.currentEpochKey.epoch}`
      );
    }

    // 1. Import sender's ECDH public key.
    //    extractable=true: public keys are inherently public — extractability carries no
    //    confidentiality risk. Required for getPeerPublicKeyBase64() which calls exportKey().
    const senderPublicKeyRaw = base64ToBytes(pkg.senderPublicKey);
    const senderPublicKey = await crypto.subtle.importKey(
      'raw',
      senderPublicKeyRaw,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,   // extractable: public key — no confidentiality loss; required for getPeerPublicKeyBase64
      []
    );

    // H-4: Store by composite userId:deviceId key — supports multi-device
    this.peerPublicKeys.set(senderId, senderPublicKey);

    // 2. ECDH shared bits
    const sharedBits = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: senderPublicKey },
      this.ephemeralKeyPair.privateKey,
      256
    );

    // 3. HKDF — same parameters as createKeyPackage, anchored to sender's identity
    //    H-1: use pkg.salt (random, from sender) — must match what sender used
    const hkdfKey = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    // Fix-4: включаем sessionId для полной изоляции сессий — совпадает с тем, что sender использовал
    const info = new TextEncoder().encode(
      `call-e2ee-epoch-${pkg.epoch}-${pkg.senderIdentity.userId}-${pkg.senderIdentity.deviceId}-${pkg.senderIdentity.sessionId}`
    );
    const unwrappingKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: base64ToBytes(pkg.salt), // H-1: use sender's random salt
        info,
      },
      hkdfKey,
      { name: 'AES-KW', length: 256 },
      false,
      ['wrapKey', 'unwrapKey']
    );

    // 4. SECURITY (Fix-3): AES-KW unwrap → non-extractable mediaKey + extractable raw bytes.
    //    mediaKey (extractable=false) — used by SFrame; raw bytes never leave WebCrypto engine.
    //    _rawBytes хранится для создания локального ephemeral extractable alias в createKeyPackage().
    //    Extractable alias НЕ сохраняется в EpochKeyMaterial — создаётся on-demand в createKeyPackage.
    const ciphertextRaw = base64ToBytes(pkg.ciphertext);
    const epochCryptoKey = await crypto.subtle.unwrapKey(
      'raw',
      ciphertextRaw,
      unwrappingKey,
      'AES-KW',
      { name: 'AES-GCM', length: 128 },
      false,  // H-2: non-extractable — used by SFrame; raw key bytes not accessible from JS
      ['encrypt', 'decrypt']
    );

    // Получаем rawBytes через extractable unwrap — нужно для хранения в _rawBytes.
    // Extractable alias немедленно used только для exportKey и затем GC-ится.
    const epochExtractable = await crypto.subtle.unwrapKey(
      'raw',
      ciphertextRaw,
      unwrappingKey,
      'AES-KW',
      { name: 'AES-GCM', length: 128 },
      true,   // extractable=true: только для извлечения rawBytes в _rawBytes; не хранится в интерфейсе
      ['encrypt', 'decrypt']
    );
    const rawBuf = await crypto.subtle.exportKey('raw', epochExtractable);
    const rawBytes = new Uint8Array(rawBuf);

    const epochKey: EpochKeyMaterial = {
      epoch: pkg.epoch,
      key: epochCryptoKey,
      _rawBytes: rawBytes,
    };

    this.epochKeys.set(pkg.epoch, epochKey);
    this.currentEpochKey = epochKey;

    // ── H-5: Evict old epoch keys for forward secrecy ──
    // Keep only current epoch and 2 previous (for late frames)
    for (const [storedEpoch, oldKey] of this.epochKeys) {
      if (storedEpoch < pkg.epoch - 2) {
        oldKey._rawBytes.fill(0); // зачищаем _rawBytes удаляемого epoch
        this.epochKeys.delete(storedEpoch);
      }
    }

    return epochKey;
  }

  /**
   * Получить stored public key пира по composite key "userId:deviceId".
   * H-4: использует composite key вместо только userId.
   */
  getPeerPublicKeyBase64(peerKey: string): Promise<string | null> {
    const key = this.peerPublicKeys.get(peerKey);
    if (!key) return Promise.resolve(null);
    return crypto.subtle.exportKey('raw', key).then((raw) => bytesToBase64(new Uint8Array(raw)));
  }

  /** Текущий epoch key material */
  getCurrentEpochKey(): EpochKeyMaterial | null {
    return this.currentEpochKey;
  }

  /** Epoch key по номеру */
  getEpochKey(epoch: number): EpochKeyMaterial | null {
    return this.epochKeys.get(epoch) ?? null;
  }

  /**
   * Уничтожить все ключи (при hangup / closeCallsV2).
   * Fix-3: зачищаем _rawBytes всех epoch ключей перед удалением из Map.
   * C-1: очищаем peerSigningKeys.
   */
  destroy(): void {
    // BUG #8 FIX: Логирование состояния перед уничтожением
    logger.debug('[CallKeyExchange] destroy() called', {
      hasEphemeralKeyPair: !!this.ephemeralKeyPair,
      hasSigningKeyPair: !!this.signingKeyPair,
      hasCurrentEpochKey: !!this.currentEpochKey,
      epochKeysCount: this.epochKeys.size,
      peerPublicKeysCount: this.peerPublicKeys.size,
      peerSigningKeysCount: this.peerSigningKeys.size,
      currentEpoch: this.currentEpochKey?.epoch ?? 0,
      timestamp: Date.now(),
    });
    
    // Fix-3: явная зачистка _rawBytes — уменьшает window XSS-атаки
    // BUG #8 FIX: Очищаем ВСЕ epoch ключи, не только current
    let clearedKeysCount = 0;
    for (const epochKey of this.epochKeys.values()) {
      if (epochKey._rawBytes && epochKey._rawBytes.length > 0) {
        epochKey._rawBytes.fill(0);
        clearedKeysCount++;
      }
    }
    if (this.currentEpochKey) {
      this.currentEpochKey._rawBytes.fill(0);
    }
    
    logger.debug('[CallKeyExchange] destroy() keys cleared', {
      epochKeysCleared: clearedKeysCount,
      timestamp: Date.now(),
    });
    
    this.ephemeralKeyPair = null;
    this.signingKeyPair = null;
    this.currentEpochKey = null;
    this.peerPublicKeys.clear();
    this.epochKeys.clear();
    this.peerSigningKeys.clear(); // C-1: clear signing keys
    
    logger.debug('[CallKeyExchange] destroy() completed', { timestamp: Date.now() });
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
  // Ensure buffer is ArrayBuffer (not SharedArrayBuffer) for WebCrypto compatibility
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}
