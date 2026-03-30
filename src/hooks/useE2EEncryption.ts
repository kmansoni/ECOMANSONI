/**
 * useE2EEncryption — хук для управления E2E-шифрованием беседы.
 * ФАЗА 2: ECDH identity keys, AES-KW key distribution, IndexedDB key store.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  encryptWithAAD,
  decryptWithAAD,
  generateMessageKey,
  exportPublicKey,
  importPublicKey,
  computeSafetyNumber,
} from '@/lib/e2ee/crypto';
import type { EncryptedPayload, SafetyNumber } from '@/lib/e2ee/crypto';
import { E2EEKeyStore } from '@/lib/e2ee/keyStore';
import {
  publishIdentityKey,
  distributeGroupKey,
  receiveGroupKey,
  rotateGroupKey,
  getParticipantPublicKey,
  clearPublicKeyCache,
  GROUP_KEY_EXPIRES_OFFSET_MS,
  MITMDetectedError,
} from '@/lib/e2ee/keyDistribution';
import {
  generateSenderKey,
  getOrLoadSenderKeyState,
  buildSenderKeyMessage,
  processSenderKeyMessage,
  encryptGroupMessage,
  decryptGroupMessage,
  type EncryptedGroupMessage,
  type SenderKeyMessage,
} from '@/lib/e2ee/senderKeys';
import { e2eeDb } from '@/lib/e2ee/db-types';
import { logger } from '@/lib/logger';

// ─── Публичные типы ───────────────────────────────────────────────────────────

export type { EncryptedPayload, SafetyNumber };

export interface UseE2EEncryptionReturn {
  // Состояние
  isEncrypted: boolean;
  /** @deprecated используй isEncrypted */
  encryptionEnabled: boolean;
  isLoading: boolean;
  /** @deprecated используй isLoading */
  isReady: boolean;
  error: string | null;
  currentKeyVersion: number | null;

  // Управление шифрованием
  enableEncryption: () => Promise<void>;
  disableEncryption: () => Promise<void>;
  rotateKey: () => Promise<void>;

  // Шифрование/расшифровка
  encryptContent: (content: string) => Promise<EncryptedPayload | null>;
  decryptContent: (payload: EncryptedPayload, senderId: string) => Promise<string | null>;

  // Верификация
  getSafetyNumber: (remoteUserId: string) => Promise<SafetyNumber | null>;

  // Identity
  getFingerprint: () => Promise<string | null>;
}

// ─── Хук ─────────────────────────────────────────────────────────────────────

export function useE2EEncryption(conversationId: string | null): UseE2EEncryptionReturn {
  const { user } = useAuth();

  const [isEncrypted, setIsEncrypted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentKeyVersion, setCurrentKeyVersion] = useState<number | null>(null);
  const [isGroupConversation, setIsGroupConversation] = useState(false);

  // Кеш расшифрованных групповых ключей: version → CryptoKey (forward secrecy)
  const groupKeyCacheRef = useRef<Map<number, CryptoKey>>(new Map());
  // Sender-key envelope is used only for 3+ participant conversations.
  const senderKeyEnvelopeEnabledRef = useRef(false);
  // Lazy-init E2EEKeyStore (singleton per hook instance)
  const keyStoreRef = useRef<E2EEKeyStore | null>(null);

  function getKeyStore(): E2EEKeyStore {
    if (!keyStoreRef.current) {
      keyStoreRef.current = new E2EEKeyStore({ dbName: 'e2ee-keystore-v2' });
    }
    return keyStoreRef.current;
  }

  // ─── Инициализация KeyStore ───────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const ks = getKeyStore();
    ks.init().catch((err) => {
      if (!cancelled) logger.warn('[useE2EEncryption] keyStore init error', { error: err });
    });
    return () => {
      cancelled = true;
      ks.close();
    };
  }, []);

  // ─── Загрузка статуса шифрования при монтировании ────────────────────────

  useEffect(() => {
    if (!conversationId) {
      setIsEncrypted(false);
      setCurrentKeyVersion(null);
      setIsLoading(false);
      groupKeyCacheRef.current.clear();
      clearPublicKeyCache();
      return;
    }
    const cid = conversationId;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    async function load() {
      try {
        const { data, error: convErr } = await e2eeDb.conversations.selectEncryptionEnabled(cid);

        if (cancelled) return;
        if (convErr || !data) {
          setIsEncrypted(false);
          return;
        }

        const enabled = !!data.encryption_enabled;
        setIsEncrypted(enabled);

        if (enabled) {
          const { data: keyData } = await e2eeDb.chatEncryptionKeys.selectActiveLatestVersion(cid);

          if (!cancelled && keyData) {
            setCurrentKeyVersion(keyData.key_version);
          }
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [conversationId]);

  // ─── Group conversation detection (for Sender Keys path) ─────────────────

  useEffect(() => {
    if (!conversationId || !user?.id) {
      setIsGroupConversation(false);
      senderKeyEnvelopeEnabledRef.current = false;
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error: pErr } = await e2eeDb.conversationParticipants.selectByConversation(conversationId);
      if (cancelled || pErr || !Array.isArray(data)) return;
      const isGroup = data.length >= 3;
      setIsGroupConversation(isGroup);
      senderKeyEnvelopeEnabledRef.current = isGroup;
    })().catch(() => {
      // Keep legacy mode on lookup failure.
      if (!cancelled) {
        setIsGroupConversation(false);
        senderKeyEnvelopeEnabledRef.current = false;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId, user?.id]);

  // ─── Получение/кеширование identity key pair ─────────────────────────────

  const getIdentityKeyPair = useCallback(async () => {
    const userId = user?.id ?? null;
    if (!userId) return null;
    const ks = getKeyStore();
    return ks.getOrCreateIdentityKeyPair(userId);
  }, [user?.id]);

  // ─── Получение группового ключа (с кешем) ────────────────────────────────

  const getGroupKey = useCallback(async (version: number): Promise<CryptoKey | null> => {
    const userId = user?.id ?? null;
    if (!conversationId || !userId) return null;

    // Проверяем in-memory кеш (forward secrecy: старые версии не удаляем)
    if (groupKeyCacheRef.current.has(version)) {
      return groupKeyCacheRef.current.get(version)!;
    }

    // Пробуем получить из keyStore
    const ks = getKeyStore();
    const stored = await ks.getKey(`group:${conversationId}:v${version}`);
    if (stored) {
      groupKeyCacheRef.current.set(version, stored);
      return stored;
    }

    // Получаем через key distribution (ECDH unwrap from Supabase)
    const identityKP = await getIdentityKeyPair();
    if (!identityKP) return null;

    try {
      const groupKey = await receiveGroupKey(
        conversationId,
        version,
        { publicKey: identityKP.publicKey, privateKey: identityKP.privateKey },
        userId,
      );
      if (!groupKey) return null;

      // Кешируем
      groupKeyCacheRef.current.set(version, groupKey);
      // Сохраняем в IndexedDB для следующих сессий
      const storedAt = Date.now();
      await ks.storeKey({
        id: `group:${conversationId}:v${version}`,
        key: groupKey,
        createdAt: storedAt,
        // SUGGESTION fix: TTL 90 дней — старые версии auto-cleanup в IndexedDB
        expiresAt: storedAt + GROUP_KEY_EXPIRES_OFFSET_MS,
        type: 'group',
        metadata: { conversationId, version: String(version) },
      });

      return groupKey;
    } catch (err) {
      if (err instanceof MITMDetectedError) {
        setError(`⚠️ Предупреждение безопасности: ${err.message}`);
      }
      return null;
    }
  }, [conversationId, user?.id, getIdentityKeyPair]);

  // ─── enableEncryption ────────────────────────────────────────────────────

  const enableEncryption = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    setIsLoading(true);
    setError(null);
    try {
      // 1. Получить/создать identity key pair
      const identityKP = await getIdentityKeyPair();
      if (!identityKP) throw new Error('Failed to get identity key pair');

      // Проверяем, есть ли уже активный ключ для этой беседы
      const { data: existingKey } = await e2eeDb.chatEncryptionKeys.selectActiveLatestVersion(conversationId);

      if (existingKey) {
        // Ключ уже создан другим участником — используем его
        const groupKey = await getGroupKey(existingKey.key_version);
        if (groupKey) {
          // Включаем шифрование серверным RPC (RLS-safe)
          const { data: enableResult, error: enableError } = await e2eeDb.rpc.enableConversationEncryption(
            conversationId,
            existingKey.key_version,
          );
          if (enableError || !enableResult?.ok) {
            throw new Error(
              `[enableEncryption] RPC enable failed: ${enableError?.message ?? enableResult?.error ?? 'unknown'}`,
            );
          }

          setCurrentKeyVersion(existingKey.key_version);
          setIsEncrypted(true);
          return; // не создаём новый ключ
        }
        // Если не удалось получить существующий ключ — продолжаем создание нового
      }

      // 2. Публикуем публичный ключ в Supabase
      const exported = await exportPublicKey(identityKP.publicKey);
      await publishIdentityKey(user.id, exported.raw, exported.fingerprint);

      // 3. Генерируем групповой ключ
      const groupKeyBundle = await generateMessageKey();
      const keyVersion = 1;

      // 4. Распространяем групповой ключ всем участникам
      const distResult = await distributeGroupKey(
        conversationId,
        groupKeyBundle.key,
        groupKeyBundle.rawBytes,
        keyVersion,
        { publicKey: identityKP.publicKey, privateKey: identityKP.privateKey },
        user.id,
        exported.raw,
      );

      // SECURITY: Очищаем raw key material после distribute
      groupKeyBundle.zeroRawBytes();

      if (distResult.distributed.length === 0) {
        throw new Error('Key distribution failed for all participants');
      }

      // 4b. Post-distribution race condition guard
      const { data: verifyKey } = await e2eeDb.chatEncryptionKeys.selectActiveVersionForRecipient(
        conversationId,
        keyVersion,
        user.id,
      );

      if (verifyKey && verifyKey.sender_id !== user.id) {
        // Другой участник создал ключ раньше — откатываем свой и принимаем его
        logger.warn('[useE2EEncryption] Race detected on key creation; accepting foreign key', {
          keyVersion,
          verifyKeySenderId: verifyKey.sender_id,
          currentUserId: user.id,
        });
        groupKeyCacheRef.current.delete(keyVersion);
        const foreignGroupKey = await getGroupKey(keyVersion);
        if (foreignGroupKey) {
          const { data: enableResult, error: enableError } = await e2eeDb.rpc.enableConversationEncryption(
            conversationId,
            keyVersion,
          );
          if (enableError || !enableResult?.ok) {
            throw new Error(
              `[enableEncryption] RPC enable failed: ${enableError?.message ?? enableResult?.error ?? 'unknown'}`,
            );
          }

          setCurrentKeyVersion(keyVersion);
          setIsEncrypted(true);
          return;
        }
        // Не удалось получить чужой ключ — продолжаем со своим
      }

      if (distResult.failed.length > 0) {
        logger.warn('[useE2EEncryption] Key distribution partial failure', {
          failedCount: distResult.failed.length,
          distributedCount: distResult.distributed.length,
          errors: distResult.errors,
        });
        // Уведомляем пользователя о частичном сбое (но продолжаем включение)
        setError(
          `Шифрование включено, но ${distResult.failed.length} участник(ов) не получили ключ. ` +
          `Они не смогут читать новые сообщения до повторной ротации ключа.`
        );
      }

      // 5. Включаем шифрование в беседе серверным RPC
      const { data: enableResult, error: enableError } = await e2eeDb.rpc.enableConversationEncryption(
        conversationId,
        keyVersion,
      );
      if (enableError || !enableResult?.ok) {
        throw new Error(
          `[enableEncryption] RPC enable failed: ${enableError?.message ?? enableResult?.error ?? 'unknown'}`,
        );
      }

      // 6. Кешируем групповой ключ локально
      groupKeyCacheRef.current.set(keyVersion, groupKeyBundle.key);
      const ks = getKeyStore();
      const now = Date.now();
      await ks.storeKey({
        id: `group:${conversationId}:v${keyVersion}`,
        key: groupKeyBundle.key,
        createdAt: now,
        // SUGGESTION fix: TTL 90 дней — старые версии auto-cleanup
        expiresAt: now + GROUP_KEY_EXPIRES_OFFSET_MS,
        type: 'group',
        metadata: { conversationId, version: String(keyVersion) },
      });

      setCurrentKeyVersion(keyVersion);
      setIsEncrypted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, user?.id, getIdentityKeyPair, getGroupKey]);

  // ─── disableEncryption ───────────────────────────────────────────────────

  const disableEncryption = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    setIsLoading(true);
    setError(null);
    try {
      // Server-side RPC: атомически проверяет, что вызывающий является создателем
      // беседы, деактивирует ВСЕ wrapped keys (всех отправителей, не только текущего),
      // и сбрасывает encryption_enabled. Заменяет клиентскую проверку created_by.
      const { data: rpcResult, error: rpcError } = await e2eeDb.rpc.disableConversationEncryption(conversationId);

      if (rpcError) {
        throw new Error(`[disableEncryption] RPC failed: ${rpcError.message}`);
      }

      if (!rpcResult?.ok) {
        const reason = rpcResult?.error ?? 'unknown';
        if (reason === 'forbidden') {
          throw new Error('Только создатель беседы может отключить шифрование');
        }
        if (reason === 'conversation_not_found') {
          throw new Error('Беседа не найдена');
        }
        throw new Error(`[disableEncryption] unexpected RPC error: ${reason}`);
      }

      groupKeyCacheRef.current.clear();
      setIsEncrypted(false);
      setCurrentKeyVersion(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, user?.id]);

  // ─── rotateKey ───────────────────────────────────────────────────────────

  const rotateKey = useCallback(async () => {
    if (!conversationId || !user?.id) return;

    setIsLoading(true);
    setError(null);
    try {
      const identityKP = await getIdentityKeyPair();
      if (!identityKP) throw new Error('Failed to get identity key pair');

      const exported = await exportPublicKey(identityKP.publicKey);
      const rotResult = await rotateGroupKey(
        conversationId,
        { publicKey: identityKP.publicKey, privateKey: identityKP.privateKey },
        user.id,
        exported.raw,
      );

      if (!rotResult) throw new Error('rotateGroupKey returned null');

      // Кешируем новый ключ
      const newKey = await getGroupKey(rotResult.keyVersion);
      if (newKey) {
        groupKeyCacheRef.current.set(rotResult.keyVersion, newKey);
      }

      setCurrentKeyVersion(rotResult.keyVersion);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, user?.id, getIdentityKeyPair, getGroupKey]);

  // ─── encryptContent ──────────────────────────────────────────────────────

  const encryptContent = useCallback(async (content: string): Promise<EncryptedPayload | null> => {
    if (!isEncrypted || currentKeyVersion === null || !user?.id || !conversationId) return null;

    // SECURITY: encryption failures MUST propagate to the caller.
    // Silently returning null risks sending plaintext in an encrypted conversation.
    const groupKey = await getGroupKey(currentKeyVersion);
    if (!groupKey) {
      const msg = 'Ключ шифрования недоступен — сообщение не может быть зашифровано';
      setError(msg);
      throw new Error(msg);
    }

    try {
      let plaintextForOuterLayer = content;

      // Sender Keys runtime integration for group conversations.
      // We keep existing outer group-key encryption for compatibility and transport stability.
      if (senderKeyEnvelopeEnabledRef.current) {
        let senderState = await getOrLoadSenderKeyState(conversationId, user.id);
        if (!senderState) {
          senderState = await generateSenderKey(conversationId, user.id);
        }

        const senderKeyMessage = await buildSenderKeyMessage(senderState);
        const encryptedInner = await encryptGroupMessage(
          conversationId,
          user.id,
          new TextEncoder().encode(content)
        );

        plaintextForOuterLayer = JSON.stringify({
          v: 1,
          mode: 'sender-key-envelope',
          senderKeyMessage,
          payload: encryptedInner,
        });
      }

      return await encryptWithAAD(groupKey, plaintextForOuterLayer, {
        conversationId,
        keyVersion: currentKeyVersion,
        senderId: user.id,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Ошибка шифрования: ${msg}`);
      throw err; // propagate — caller MUST NOT send plaintext
    }
  }, [isEncrypted, currentKeyVersion, user?.id, conversationId, getGroupKey]);

  // ─── decryptContent ──────────────────────────────────────────────────────

  const decryptContent = useCallback(async (payload: EncryptedPayload, senderId: string): Promise<string | null> => {
    if (!conversationId || !user?.id) return null;

    try {
      const version = payload.epoch;
      const groupKey = await getGroupKey(version);
      if (!groupKey) return null;

      const outerPlaintext = await decryptWithAAD(groupKey, payload, {
        conversationId,
        keyVersion: version,
        senderId,
      });

      // Backward compatible path: plain text messages from legacy flow
      if (!senderKeyEnvelopeEnabledRef.current) {
        return outerPlaintext;
      }

      // Sender-key envelope decode (if present). If parsing fails, treat as legacy plaintext.
      try {
        const parsed = JSON.parse(outerPlaintext) as {
          v?: number;
          mode?: string;
          senderKeyMessage?: SenderKeyMessage;
          payload?: EncryptedGroupMessage;
        };

        if (parsed?.v !== 1 || parsed?.mode !== 'sender-key-envelope' || !parsed.payload) {
          return outerPlaintext;
        }

        if (parsed.senderKeyMessage) {
          await processSenderKeyMessage(parsed.senderKeyMessage);
        }

        const inner = await decryptGroupMessage(parsed.payload);
        return new TextDecoder().decode(inner);
      } catch (error) {
        logger.debug('[useE2EEncryption] Sender-key envelope parse/decrypt failed; returning legacy plaintext', {
          error,
        });
        return outerPlaintext;
      }
    } catch (err) {
      if (err instanceof MITMDetectedError) {
        setError(`⚠️ Предупреждение безопасности: ${err.message}`);
      }
      logger.error('[useE2EEncryption] decryptContent error', { error: err });
      return null;
    }
  }, [conversationId, user?.id, getGroupKey]);

  // ─── getSafetyNumber ─────────────────────────────────────────────────────

  const getSafetyNumber = useCallback(async (remoteUserId: string): Promise<SafetyNumber | null> => {
    if (!user?.id) return null;

    try {
      const localKP = await getIdentityKeyPair();
      if (!localKP) return null;

      const remoteInfo = await getParticipantPublicKey(remoteUserId);
      if (!remoteInfo) return null;

      const remoteKey = await importPublicKey(remoteInfo.publicKeyRaw);

      return await computeSafetyNumber(
        localKP.publicKey,
        remoteKey,
        user.id,
        remoteUserId,
      );
    } catch (err) {
      logger.error('[useE2EEncryption] getSafetyNumber error', { error: err, remoteUserId });
      return null;
    }
  }, [user?.id, getIdentityKeyPair]);

  // ─── getFingerprint ──────────────────────────────────────────────────────

  const getFingerprint = useCallback(async (): Promise<string | null> => {
    try {
      const identityKP = await getIdentityKeyPair();
      if (!identityKP) return null;
      return identityKP.fingerprint;
    } catch (error) {
      logger.warn('[useE2EEncryption] getFingerprint failed', { error });
      return null;
    }
  }, [getIdentityKeyPair]);

  // ─── Return ───────────────────────────────────────────────────────────────

  return {
    // Состояние
    isEncrypted,
    encryptionEnabled: isEncrypted,   // backward compat
    isLoading,
    isReady: !isLoading,              // backward compat
    error,
    currentKeyVersion,

    // Управление
    enableEncryption,
    disableEncryption,
    rotateKey,

    // Крипто
    encryptContent,
    decryptContent,

    // Верификация
    getSafetyNumber,
    getFingerprint,
  };
}
