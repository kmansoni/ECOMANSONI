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
import { logger } from '@/lib/logger';

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

      const result = await X3DH.initiatorKeyAgreement(
        identityEcdhKey,
        bundle
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
   * Принятие секретного чата (ответный)
   * Обрабатывает X3DH-раунд и инициализирует Double Ratchet
   */
  async acceptSecretChat(
    conversationId: string,
    initiatorId: string,
    initiatorEphemeralKey: string,
    initiatorIdentityKey: string
  ): Promise<AcceptSecretChatResult> {
    try {
      if (!this.userId) {
        throw new SecretChatError('Менеджер не инициализирован');
      }

      const sessionKey = `session:${conversationId}:${initiatorId}`;

      if (this.sessions.has(sessionKey)) {
        return { success: true, sessionId: sessionKey };
      }

      const identityKeyPair = await this.keyStore.getOrCreateIdentityKeyPair(this.userId);

      const ecdhPrivate = await this.keyStore.getKey(`identity:${this.userId}:private`);
      const ecdhPublic = await this.keyStore.getKey(`identity:${this.userId}:public`);

      if (!ecdhPrivate || !ecdhPublic) {
        throw new KeyNotFoundError('Identity key not found');
      }

      const { data: signedPreKey } = await supabase
        .from('user_encryption_keys')
        .select('public_key_raw')
        .eq('user_id', this.userId)
        .eq('type', 'signed_prekey')
        .single();

      const spkPrivate = await this.keyStore.getKey(`signed_prekey:${this.userId}:private`);
      const spkPublic = await this.keyStore.getKey(`signed_prekey:${this.userId}:public`);

      if (!spkPrivate || !spkPublic) {
        throw new KeyNotFoundError('Signed pre-key not found');
      }

      const { data: opkData } = await supabase
        .from('one_time_prekeys')
        .select('public_key_spki, id')
        .eq('user_id', this.userId)
        .limit(1)
        .single();

      const opkPrivate = opkData ? await this.keyStore.getKey(`opk:${this.userId}:${opkData.id}:private`) : null;

      const sharedSecret = await X3DH.responderKeyAgreement({
        identityKeyPair: { privateKey: ecdhPrivate, publicKey: ecdhPublic },
        signedPreKeyPair: { privateKey: spkPrivate, publicKey: spkPublic },
        oneTimePreKeyPair: opkPrivate ? {
          privateKey: opkPrivate,
          publicKey: await crypto.subtle.importKey('spki', fromBase64(initiatorEphemeralKey), { name: 'ECDH', namedCurve: 'P-256' }, true, []),
        } : null,
        oneTimePreKeyWasUsed: !!opkPrivate,
        ephemeralPublicKey: initiatorEphemeralKey,
        initiatorIdentityPublicKey: initiatorIdentityKey,
      });

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

      if (opkData) {
        await this.keyStore.deleteKey(`opk:${this.userId}:${opkData.id}`);
        await supabase
          .from('one_time_prekeys')
          .delete()
          .eq('id', opkData.id);
      }

      logger.info('[SecretChatManager] acceptSecretChat', {
        conversationId,
        initiatorId,
        sessionId: sessionKey,
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