/**
 * SecretChatManager — главный оркестратор E2EE для секретных чатов
 *
 * Управляет жизненным циклом секретных чатов:
 * - Инициализация и управление сессиями
 * - X3DH-раунд для установления shared secret
 * - Double Ratchet для шифрования сообщений
 * - RLS-совместимые операции с базой данных
 */

import { supabase } from '@/integrations/supabase/client';
import { e2eeDb, ChatEncryptionKeyRow, ConversationRow } from './db-types';
import { X3DH, PreKeyBundle, InitiatorResult } from './x3dh';
import { DoubleRatchetE2E, RatchetState, RatchetHeader } from './doubleRatchet';
import { E2EEKeyStore } from './keyStore';
import { toBase64, fromBase64 } from './utils';
import { encryptForStorage, decryptFromStorage } from '@/auth/localStorageCrypto';
import { logger } from '@/lib/logger';

// ─── Secret blob IndexedDB storage ─────────────────────────────────────────
// Shared between SecretChatManager and useSecretChat.
// Kept in sync via the same IndexedDB store + same encryption keys.

const SECRET_CHAT_DB = 'secret-chat-e2ee-v1';
const SECRET_CHAT_STORE = 'kv';

function openSecretChatDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SECRET_CHAT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SECRET_CHAT_STORE)) {
        db.createObjectStore(SECRET_CHAT_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readSecretBlob(id: string): Promise<string | null> {
  try {
    const db = await openSecretChatDb();
    const value = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(SECRET_CHAT_STORE, 'readonly');
      const store = tx.objectStore(SECRET_CHAT_STORE);
      const req = store.get(id);
      req.onsuccess = () => {
        const row = req.result as { id: string; value: string } | undefined;
        resolve(row?.value ?? null);
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (value) return value;
  } catch { /* best-effort */ }

  try {
    return localStorage.getItem(id);
  } catch { return null; }
}

async function writeSecretBlob(id: string, value: string): Promise<void> {
  try {
    const db = await openSecretChatDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SECRET_CHAT_STORE, 'readwrite');
      const store = tx.objectStore(SECRET_CHAT_STORE);
      const req = store.put({ id, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch { /* best-effort */ }
}

async function deleteSecretBlob(id: string): Promise<void> {
  try {
    const db = await openSecretChatDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(SECRET_CHAT_STORE, 'readwrite');
      const store = tx.objectStore(SECRET_CHAT_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    db.close();
  } catch { /* best-effort */ }
  try {
    localStorage.removeItem(id);
  } catch { /* best-effort */ }
}

// ─── OPK helpers ────────────────────────────────────────────────────────────────

const IK_STORAGE_KEY = (userId: string) => `e2ee_ik_${userId}`;

interface StoredIdentityKeys {
  oneTimePreKeys?: Array<{ publicKey: string; privateKey: string }>;
}

async function findOpkPrivateBySpki(
  userId: string,
  opkSpki: string,
): Promise<CryptoKeyPair | null> {
  const stored = await readSecretBlob(IK_STORAGE_KEY(userId));
  if (!stored) return null;

  try {
    const decrypted = await decryptFromStorage(stored);
    if (!decrypted) return null;

    const parsed = JSON.parse(decrypted) as StoredIdentityKeys;
    const match = (parsed.oneTimePreKeys ?? []).find(
      (entry) => entry.publicKey === opkSpki,
    );
    if (!match) return null;

    return await X3DH.importEcdhKeyPair(match.publicKey, match.privateKey);
  } catch {
    return null;
  }
}

async function removeOpkFromSecretBlob(
  userId: string,
  opkSpki: string,
): Promise<void> {
  const stored = await readSecretBlob(IK_STORAGE_KEY(userId));
  if (!stored) return;

  try {
    const decrypted = await decryptFromStorage(stored);
    if (!decrypted) return;

    const parsed = JSON.parse(decrypted) as StoredIdentityKeys;
    parsed.oneTimePreKeys = (parsed.oneTimePreKeys ?? []).filter(
      (entry) => entry.publicKey !== opkSpki,
    );

    const reEncrypted = await encryptForStorage(JSON.stringify(parsed));
    await writeSecretBlob(IK_STORAGE_KEY(userId), reEncrypted);
  } catch { /* best-effort */ }
}

// ─── Типы ───────────────────────────────────────────────────────────────────

export interface SecretChatSession {
  id: string;
  conversationId: string;
  participantId: string;
  state: RatchetState | null;
  remotePublicKey: string | null;
  isActive: boolean;
  createdAt: number;
  lastActivity: number;
}

export interface EncryptedMessage {
  ciphertext: string;
  header: RatchetHeader;
  timestamp: number;
  sessionId: string;
}

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface ReceiveMessageResult {
  success: boolean;
  plaintext?: string;
  error?: string;
}

export interface InitSecretChatResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface AcceptSecretChatResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export interface SecretChatConfig {
  keyStore?: E2EEKeyStore;
  maxSessions?: number;
}

// ─── Ошибки ───────────────────────────────────────────────────────────────

export class SecretChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretChatError';
  }
}

export class SessionNotFoundError extends SecretChatError {
  constructor(conversationId: string) {
    super(`Сессия не найдена для беседы ${conversationId}`);
  }
}

export class KeyNotFoundError extends SecretChatError {
  constructor(message: string) {
    super(`Ключ не найден: ${message}`);
  }
}

export class DecryptionError extends SecretChatError {
  constructor(reason: string) {
    super(`Ошибка расшифровки: ${reason}`);
  }
}

// ─── SecretChatManager ───────────────────────────────────────────────────

export class SecretChatManager {
  private keyStore: E2EEKeyStore;
  private sessions: Map<string, SecretChatSession>;
  private userId: string | null;
  private maxSessions: number;

  constructor(config: SecretChatConfig = {}) {
    this.keyStore = config.keyStore ?? new E2EEKeyStore();
    this.sessions = new Map();
    this.userId = null;
    this.maxSessions = config.maxSessions ?? 100;
  }

  /**
   * Инициализация менеджера
   * Загружает идентификатор пользователя и инициализирует хранилище ключей
   */
  async init(): Promise<void> {
    await this.keyStore.init();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new SecretChatError('Пользователь не аутентифицирован');
    }
    this.userId = user.id;

    logger.info('[SecretChatManager] initialized', { userId: this.userId });
  }

  /**
   * Запуск секретного чата (инициатор)
   * Выполняет X3DH-раунд и инициализирует Double Ratchet
   */
  async startSecretChat(
    conversationId: string,
    recipientId: string,
    bundle: PreKeyBundle
  ): Promise<InitSecretChatResult> {
    try {
      if (!this.userId) {
        throw new SecretChatError('Менеджер не инициализирован');
      }

      const sessionKey = `session:${conversationId}:${recipientId}`;

      if (this.sessions.has(sessionKey)) {
        return { success: true, sessionId: sessionKey };
      }

      const identityKeyPair = await this.keyStore.getOrCreateIdentityKeyPair(this.userId);

      let identitySigningKey: CryptoKeyPair;
      let identityEcdhKey: CryptoKeyPair;

      const ecdhPrivate = await this.keyStore.getKey(`identity:${this.userId}:private`);
      const ecdhPublic = await this.keyStore.getKey(`identity:${this.userId}:public`);

      if (!ecdhPrivate || !ecdhPublic) {
        throw new KeyNotFoundError('Identity key not found');
      }

      identityEcdhKey = { privateKey: ecdhPrivate, publicKey: ecdhPublic };

      const { data: signingData } = await supabase
        .from('user_encryption_keys')
        .select('public_key_raw, fingerprint')
        .eq('user_id', this.userId)
        .single();

      if (!signingData?.fingerprint) {
        throw new KeyNotFoundError('Identity signing key not found');
      }

      // Fetch Bob's bundle for identity signing public key
      const { data: bobBundleData } = await supabase
        .from('prekey_bundles')
        .select('identity_signing_public')
        .eq('user_id', recipientId)
        .single();

      if (!bobBundleData?.identity_signing_public) {
        throw new KeyNotFoundError('Bob bundle not found');
      }

      const result = await X3DH.initiatorKeyAgreement(
        identityEcdhKey,
        bundle,
        bobBundleData.identity_signing_public
      );

      const bobPublicKey = await crypto.subtle.importKey(
        'spki',
        fromBase64(bundle.signedPreKeyPublic),
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        []
      );

      const ratchetState = await DoubleRatchetE2E.initAlice(
        result.sharedSecret,
        bobPublicKey
      );

      const session: SecretChatSession = {
        id: sessionKey,
        conversationId,
        participantId: recipientId,
        state: ratchetState,
        remotePublicKey: bundle.identityKeyPublic,
        isActive: true,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      this.sessions.set(sessionKey, session);

      logger.info('[SecretChatManager] startSecretChat', {
        conversationId,
        recipientId,
        sessionId: sessionKey,
      });

      return { success: true, sessionId: sessionKey };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[SecretChatManager] startSecretChat error', { error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Принятие секретного чата (Responder / Bob).
   * Выполняет X3DH responder handshake и инициализирует Double Ratchet.
   *
   * SECURITY (STORAGE-1 fix):
   *   1. Атомарно потребляем OPK в БД через consume_opk_by_spki RPC.
   *      RPC выполняет DELETE + RETURNING в одной транзакции — предотвращает race
   *      когда два concurrent инициатора пытаются использовать один OPK.
   *      Второй инициатор получает null → OPK не задействован → reduced secrecy,
   *      но сессия не сломана.
   *   2. Приватный ключ OPK читается из secretBlob по SPKI.
   *   3. Полная CryptoKeyPair (включая приватный ключ) передаётся в X3DH для DH4.
   *   4. Приватный ключ удаляется из secretBlob ПОСЛЕ завершения X3DH.
   *
   * @param opkSpki  base64 SPKI потреблённого OPK (от инициатора: initiator_used_one_time_prekey_public)
   */
  async acceptSecretChat(
    conversationId: string,
    initiatorId: string,
    initiatorEphemeralKey: string,
    initiatorIdentityKey: string,
    opkSpki?: string | null,
  ): Promise<AcceptSecretChatResult> {
    try {
      if (!this.userId) {
        throw new SecretChatError('Менеджер не инициализирован');
      }

      const sessionKey = `session:${conversationId}:${initiatorId}`;
      if (this.sessions.has(sessionKey)) {
        return { success: true, sessionId: sessionKey };
      }

      const ecdhPrivate = await this.keyStore.getKey(`identity:${this.userId}:private`);
      const ecdhPublic = await this.keyStore.getKey(`identity:${this.userId}:public`);

      if (!ecdhPrivate || !ecdhPublic) {
        throw new KeyNotFoundError('Identity key not found');
      }

      const spkPrivate = await this.keyStore.getKey(`signed_prekey:${this.userId}:private`);
      const spkPublic = await this.keyStore.getKey(`signed_prekey:${this.userId}:public`);

      if (!spkPrivate || !spkPublic) {
        throw new KeyNotFoundError('Signed pre-key not found');
      }

      // ── STORAGE-1: atomic OPK consumption ───────────────────────────────────
      // consume_opk_by_spki atomically DELETEs OPK from DB and returns its SPKI.
      // Null = OPK already consumed by concurrent handshake (DB-enforced rollback).
      let opkKeyPair: CryptoKeyPair | null = null;
      if (opkSpki) {
        const consumeResult = await e2eeDb.rpc.consumeOPKBySpki(opkSpki, this.userId);
        if (consumeResult.data) {
          // DB deleted OPK — now read private key from secretBlob
          opkKeyPair = await findOpkPrivateBySpki(this.userId, consumeResult.data);
        }
      }

      // ── X3DH responder key agreement ───────────────────────────────────────
      // DH4 = DH(OPK_B.priv, EK_A.pub) — private key IS required for DH4
      const sharedSecret = await X3DH.responderKeyAgreement({
        identityKeyPair: { privateKey: ecdhPrivate, publicKey: ecdhPublic },
        signedPreKeyPair: { privateKey: spkPrivate, publicKey: spkPublic },
        oneTimePreKeyPair: opkKeyPair,
        oneTimePreKeyWasUsed: !!opkKeyPair,
        ephemeralPublicKey: initiatorEphemeralKey,
        initiatorIdentityPublicKey: initiatorIdentityKey,
      });

      // ── Remove consumed OPK private key from secretBlob ─────────────────────
      // After X3DH so DH4 derivation succeeded; best-effort so UI never breaks
      if (opkSpki) {
        await removeOpkFromSecretBlob(this.userId, opkSpki);
      }

      const ratchetState = await DoubleRatchetE2E.initBob(sharedSecret);

      const session: SecretChatSession = {
        id: sessionKey,
        conversationId,
        participantId: initiatorId,
        state: ratchetState,
        remotePublicKey: initiatorIdentityKey,
        isActive: true,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };

      this.sessions.set(sessionKey, session);

      logger.info('[SecretChatManager] acceptSecretChat', {
        conversationId,
        initiatorId,
        sessionId: sessionKey,
        opkUsed: !!opkKeyPair,
      });

      return { success: true, sessionId: sessionKey };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[SecretChatManager] acceptSecretChat error', { error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Отправка зашифрованного сообщения
   */
  async sendMessage(
    conversationId: string,
    plaintext: string
  ): Promise<SendMessageResult> {
    try {
      const session = this.getSessionByConversation(conversationId);
      if (!session || !session.isActive || !session.state) {
        throw new SessionNotFoundError(conversationId);
      }

      const { ciphertext, header } = await DoubleRatchetE2E.encrypt(
        session.state,
        plaintext
      );

      session.lastActivity = Date.now();

      const encryptedMsg: EncryptedMessage = {
        ciphertext,
        header,
        timestamp: Date.now(),
        sessionId: session.id,
      };

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: JSON.stringify(encryptedMsg),
          sender_id: this.userId,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        throw new SecretChatError(`Ошибка отправки сообщения: ${error.message}`);
      }

      logger.info('[SecretChatManager] sendMessage', {
        conversationId,
        messageId: data.id,
      });

      return { success: true, messageId: data.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[SecretChatManager] sendMessage error', { error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Приём и расшифровка сообщения
   */
  async receiveMessage(
    conversationId: string,
    encryptedMsg: EncryptedMessage
  ): Promise<ReceiveMessageResult> {
    try {
      const session = this.getSessionByConversation(conversationId);
      if (!session || !session.isActive || !session.state) {
        throw new SessionNotFoundError(conversationId);
      }

      const plaintext = await DoubleRatchetE2E.decrypt(
        session.state,
        encryptedMsg.ciphertext,
        encryptedMsg.header
      );

      session.lastActivity = Date.now();

      logger.info('[SecretChatManager] receiveMessage', {
        conversationId,
      });

      return { success: true, plaintext };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('[SecretChatManager] receiveMessage error', { error: message });
      return { success: false, error: message };
    }
  }

  /**
   * Закрытие секретного чата
   */
  async closeSecretChat(conversationId: string): Promise<void> {
    const sessionKey = `session:${conversationId}:${this.userId}`;
    const session = this.sessions.get(sessionKey);

    if (session) {
      session.isActive = false;
      this.sessions.delete(sessionKey);
    }

    logger.info('[SecretChatManager] closeSecretChat', { conversationId });
  }

  /**
   * Получение сессии по ID беседы
   */
  getSessionByConversation(conversationId: string): SecretChatSession | null {
    for (const session of this.sessions.values()) {
      if (session.conversationId === conversationId) {
        return session;
      }
    }
    return null;
  }

  /**
   * Проверка активности секретного чата
   */
  isSecretChatActive(conversationId: string): boolean {
    const session = this.getSessionByConversation(conversationId);
    return session?.isActive ?? false;
  }

  /**
   * Очистка старых сессий (cleanup)
   */
  async cleanupSessions(): Promise<void> {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000;
    const sessionsToDelete: string[] = [];

    for (const [key, session] of this.sessions) {
      if (now - session.lastActivity > maxAge) {
        sessionsToDelete.push(key);
      }
    }

    for (const key of sessionsToDelete) {
      this.sessions.delete(key);
    }

    if (sessionsToDelete.length > 0) {
      logger.info('[SecretChatManager] cleanupSessions', {
        removed: sessionsToDelete.length,
      });
    }
  }

  /**
   * Получение всех активных сессий
   */
  getActiveSessions(): SecretChatSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }
}

// ─── Экспорт синглтона ─────────────────────────────────────────────────────

let defaultManager: SecretChatManager | null = null;

export function getSecretChatManager(config?: SecretChatConfig): SecretChatManager {
  if (!defaultManager) {
    defaultManager = new SecretChatManager(config);
  }
  return defaultManager;
}