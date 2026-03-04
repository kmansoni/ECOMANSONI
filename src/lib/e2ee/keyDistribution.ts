/**
 * E2EE Key Distribution Protocol v1
 * ECDH + AES-KW протокол распространения групповых ключей участникам беседы.
 * Каждый получатель получает групповой ключ, обёрнутый своим ECDH-derived wrapping key.
 */

import { supabase } from '@/integrations/supabase/client';
import { e2eeDb } from './db-types';
import { toBase64, fromBase64 } from './utils';
import {
  deriveSharedSecret,
  hkdfDerive,
  wrapKey,
  unwrapKey,
  importPublicKey,
  generateMessageKey,
  exportPublicKey,
} from './crypto';

// ─── Auto-clear module-level cache on logout ─────────────────────────────────
// publicKeyCache is module-level (shared across all call sites in the same JS
// context).  On account switch the stale keys from the previous user must be
// evicted immediately — otherwise MITM verification may use a cached key from
// a different principal for up to PUBLIC_KEY_CACHE_TTL_MS (5 min).
// NOTE: Placed after all imports to avoid confusing module evaluation order.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    publicKeyCache.clear();
  }
});

/**
 * Ошибка, сигнализирующая об обнаружении потенциальной MITM-атаки.
 * Пробрасывается наружу из receiveGroupKey для обработки в UI-слое.
 */
export class MITMDetectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MITMDetectedError';
  }
}

/** Константа TTL для кешированных записей group-ключей (90 дней) */
export const GROUP_KEY_EXPIRES_OFFSET_MS = 90 * 24 * 60 * 60 * 1000;

// ─── Типы ────────────────────────────────────────────────────────────────────

export interface ParticipantPublicKey {
  userId: string;
  publicKeyRaw: string;      // base64 raw ECDH P-256 public key
  fingerprint: string;
}

export interface WrappedGroupKey {
  recipientId: string;
  senderId: string;
  wrappedKey: string;         // base64 AES-KW wrapped group key
  keyVersion: number;
  conversationId: string;
  senderPublicKeyRaw: string; // для recipient, чтобы выполнить ECDH
  createdAt: number;
}

export interface KeyDistributionResult {
  success: boolean;
  distributed: string[];      // userId[] успешно получивших ключ
  failed: string[];           // userId[] неудачных
  errors: Array<{ userId: string; error: string }>;
}

// ─── Кеш публичных ключей (in-memory, per-session, TTL 5 min) ────────────────

const PUBLIC_KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const publicKeyCache = new Map<string, { key: CryptoKey; raw: string; fingerprint: string; cachedAt: number }>();

// ─── Утилиты ─────────────────────────────────────────────────────────────────

/**
 * Деривация HKDF salt из sorted(senderId + recipientId)
 * Гарантирует симметричность — тот же salt с обеих сторон
 */
async function deriveHkdfSalt(idA: string, idB: string): Promise<ArrayBuffer> {
  const sorted = [idA, idB].sort().join(':');
  const enc = new TextEncoder().encode(sorted);
  return crypto.subtle.digest('SHA-256', enc);
}

/**
 * Деривация wrapping key из ECDH shared secret
 */
async function deriveWrappingKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  localId: string,
  remoteId: string,
): Promise<CryptoKey> {
  const sharedSecret = await deriveSharedSecret(privateKey, publicKey);
  const salt = await deriveHkdfSalt(localId, remoteId);
  // hkdfDerive возвращает AES-GCM ключ; нам нужен AES-KW — делаем через deriveBits + importKey
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: new TextEncoder().encode('e2ee-group-key-wrap-v1'),
    },
    sharedSecret,
    256,
  );
  return crypto.subtle.importKey(
    'raw',
    bits,
    { name: 'AES-KW' },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

// ─── Публичные функции ────────────────────────────────────────────────────────

/**
 * Публикация своего identity public key в Supabase
 * Записывает в таблицу user_encryption_keys
 */
export async function publishIdentityKey(
  userId: string,
  publicKeyRaw: string,
  fingerprint: string,
): Promise<void> {
  const { error } = await e2eeDb.userEncryptionKeys.upsert(
    {
      user_id: userId,
      public_key_raw: publicKeyRaw,
      fingerprint,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    throw new Error(`[keyDistribution] publishIdentityKey failed: ${error.message}`);
  }
  // Обновляем кеш
  publicKeyCache.delete(userId);
}

/**
 * Получение публичного ключа участника
 * Сначала проверяет кеш, потом запрашивает из Supabase
 */
export async function getParticipantPublicKey(
  userId: string,
): Promise<ParticipantPublicKey | null> {
  // Проверяем кеш (с учётом TTL)
  const cached = publicKeyCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < PUBLIC_KEY_CACHE_TTL_MS) {
    return { userId, publicKeyRaw: cached.raw, fingerprint: cached.fingerprint };
  }

  const { data, error } = await e2eeDb.userEncryptionKeys.selectByUserId(userId);

  if (error || !data) return null;

  try {
    const key = await importPublicKey(data.public_key_raw);
    publicKeyCache.set(userId, { key, raw: data.public_key_raw, fingerprint: data.fingerprint, cachedAt: Date.now() });
    return { userId, publicKeyRaw: data.public_key_raw, fingerprint: data.fingerprint };
  } catch {
    return null;
  }
}

/**
 * Получение публичных ключей всех участников беседы.
 * SUGGESTION fix: батч-запрос для некешированных участников (устраняет N+1).
 */
export async function getConversationParticipantKeys(
  conversationId: string,
  excludeUserId?: string,
): Promise<ParticipantPublicKey[]> {
  const { data: participants, error } = await e2eeDb.conversationParticipants.selectByConversation(conversationId);

  if (error || !participants) return [];

  const userIds: string[] = participants
    .map((p: { user_id: string }) => p.user_id)
    .filter((id: string) => id !== excludeUserId);

  const results: ParticipantPublicKey[] = [];

  // Разделяем на кешированных (с актуальным TTL) и некешированных
  const uncachedIds: string[] = [];
  const now = Date.now();
  for (const userId of userIds) {
    const cached = publicKeyCache.get(userId);
    if (cached && now - cached.cachedAt < PUBLIC_KEY_CACHE_TTL_MS) {
      results.push({ userId, publicKeyRaw: cached.raw, fingerprint: cached.fingerprint });
    } else {
      uncachedIds.push(userId);
    }
  }

  if (uncachedIds.length === 0) return results;

  // Батч-запрос для некешированных участников
  const { data: keysData, error: keysErr } = await e2eeDb.userEncryptionKeys.selectByUserIds(uncachedIds);

  if (!keysErr && keysData) {
    // Дедупликация: берём последний ключ по user_id
    const seen = new Set<string>();
    for (const row of keysData) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      try {
        const key = await importPublicKey(row.public_key_raw);
        publicKeyCache.set(row.user_id, { key, raw: row.public_key_raw, fingerprint: row.fingerprint, cachedAt: Date.now() });
        results.push({ userId: row.user_id, publicKeyRaw: row.public_key_raw, fingerprint: row.fingerprint });
      } catch {
        // пропускаем участника с невалидным ключом
      }
    }
  }

  return results;
}

/**
 * Распространение группового ключа всем участникам беседы.
 * Для каждого участника: ECDH + HKDF → AES-KW wrapping → сохранение в Supabase.
 */
export async function distributeGroupKey(
  conversationId: string,
  groupKey: CryptoKey,
  keyVersion: number,
  senderIdentityKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey },
  senderUserId: string,
  senderPublicKeyRaw: string,
): Promise<KeyDistributionResult> {
  const result: KeyDistributionResult = {
    success: false,
    distributed: [],
    failed: [],
    errors: [],
  };

  const participants = await getConversationParticipantKeys(conversationId, senderUserId);

  // Также сохраняем ключ для самого отправителя (обёрнутый собственным ключом)
  // чтобы он мог читать свои же сообщения после рестарта
  const allRecipients = [...participants];
  const senderPkInfo = await getParticipantPublicKey(senderUserId);
  if (senderPkInfo) {
    allRecipients.push(senderPkInfo);
  }

  await Promise.all(
    allRecipients.map(async (participant) => {
      try {
        const recipientPublicKey = await importPublicKey(participant.publicKeyRaw);
        const wrappingKey = await deriveWrappingKey(
          senderIdentityKeyPair.privateKey,
          recipientPublicKey,
          senderUserId,
          participant.userId,
        );

        // Оборачиваем групповой ключ через AES-KW
        const wrappedKeyB64 = await crypto.subtle.wrapKey('raw', groupKey, wrappingKey, 'AES-KW').then(
          (buf) => toBase64(buf),
        );

        const { error } = await e2eeDb.chatEncryptionKeys.insert({
          conversation_id: conversationId,
          key_version: keyVersion,
          recipient_id: participant.userId,
          sender_id: senderUserId,
          wrapped_key: wrappedKeyB64,
          sender_public_key_raw: senderPublicKeyRaw,
          is_active: true,
        });

        if (error) throw new Error(error.message);
        result.distributed.push(participant.userId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.failed.push(participant.userId);
        result.errors.push({ userId: participant.userId, error: msg });
        console.warn(`[keyDistribution] Failed to distribute key to ${participant.userId}:`, msg);
      }
    }),
  );

  result.success = result.failed.length === 0;
  return result;
}

/**
 * Получение и расшифровка группового ключа для текущего пользователя.
 * Выполняет ECDH (свой private + public отправителя) → HKDF → AES-KW unwrap.
 *
 * CRITICAL fix: верификация fingerprint sender_public_key_raw против publicKeyCache
 *   и user_encryption_keys — предотвращает MITM через подмену ключа в БД.
 */
export async function receiveGroupKey(
  conversationId: string,
  keyVersion: number,
  recipientIdentityKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey },
  recipientUserId: string,
): Promise<CryptoKey | null> {
  try {
    const { data: keyData, error } = await e2eeDb.chatEncryptionKeys.selectRecipientKey(
      conversationId,
      recipientUserId,
      keyVersion,
    );

    if (error || !keyData) {
      console.warn('[keyDistribution] receiveGroupKey: no key found', { conversationId, keyVersion, error });
      return null;
    }

    if (!keyData || !keyData.sender_public_key_raw || !keyData.sender_id || !keyData.wrapped_key) {
      console.warn('[keyDistribution] receiveGroupKey: incomplete key record', { conversationId, keyVersion });
      return null;
    }

    // ── CRITICAL: верификация fingerprint отправителя ──────────────────────
    // Импортируем ключ из chat_encryption_keys и вычисляем его fingerprint.
    const senderPublicKey = await importPublicKey(keyData.sender_public_key_raw);
    const { fingerprint: receivedFingerprint } = await exportPublicKey(senderPublicKey);

    // 1. Если ключ отправителя есть в доверенном кеше сессии — сверяем fingerprint.
    const cachedSender = publicKeyCache.get(keyData.sender_id);
    if (cachedSender) {
      if (cachedSender.fingerprint !== receivedFingerprint) {
        // Fingerprint отличается от кешированного — возможная MITM-атака
        throw new MITMDetectedError(
          `[keyDistribution] MITM detected: sender_public_key_raw fingerprint mismatch for ${keyData.sender_id}. ` +
          `Expected ${cachedSender.fingerprint}, got ${receivedFingerprint}`,
        );
      }
    } else {
      // 2. Кеш пуст — загружаем авторитетный ключ из user_encryption_keys (identity store)
      //    и сверяем fingerprint с тем, что пришёл в chat_encryption_keys.
      const { data: identityData, error: identityErr } = await e2eeDb.userEncryptionKeys.selectByUserId(keyData.sender_id);

      if (!identityErr && identityData) {
        if (identityData.fingerprint !== receivedFingerprint) {
          throw new MITMDetectedError(
            `[keyDistribution] MITM detected: sender_public_key_raw fingerprint mismatch for ${keyData.sender_id}. ` +
            `Identity store fingerprint: ${identityData.fingerprint}, received: ${receivedFingerprint}`,
          );
        }
        // Обновляем кеш доверенным ключом
        const trustedKey = await importPublicKey(identityData.public_key_raw!);
        publicKeyCache.set(keyData.sender_id, {
          key: trustedKey,
          raw: identityData.public_key_raw!,
          fingerprint: identityData.fingerprint!,
          cachedAt: Date.now(),
        });
      } else {
        // SECURITY FIX: Soft-fail instead of MITMDetectedError when identity key is not found.
        // Throwing MITMDetectedError here caused false positives: if the sender published
        // their identity key moments ago, Supabase replication lag (~50-200ms) means
        // user_encryption_keys may not yet be visible to the recipient. The first message
        // in a conversation always hits this race. Showing a scary MITM warning to the user
        // for a transient propagation delay is incorrect and degrades UX.
        //
        // Security posture: we return null (defer decryption), NOT null + silent accept.
        // The caller (useE2EEncryption) will retry on the next render/message cycle.
        // If the key never appears, the message remains undecrypted — not silently accepted.
        // MITMDetectedError is only raised on affirmative fingerprint MISMATCH (see above).
        console.warn(
          `[keyDistribution] receiveGroupKey: sender identity key not found for ${keyData.sender_id} — ` +
          `deferring decryption (may be replication lag). Will retry on next access.`,
        );
        return null;
      }
    }
    // ── конец верификации ─────────────────────────────────────────────────

    const unwrappingKey = await deriveWrappingKey(
      recipientIdentityKeyPair.privateKey,
      senderPublicKey,
      keyData.sender_id,
      recipientUserId,
    );

    // WARNING fix: extractable: false — group key не может быть экспортирован из памяти
    const groupKey = await crypto.subtle.unwrapKey(
      'raw',
      fromBase64(keyData.wrapped_key),
      unwrappingKey,
      'AES-KW',
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable: защита от XSS-экстракции ключа
      ['encrypt', 'decrypt'],
    );

    return groupKey;
  } catch (err) {
    if (err instanceof MITMDetectedError) throw err; // CRITICAL: пробрасываем MITM наружу
    console.error('[keyDistribution] receiveGroupKey error:', err);
    return null;
  }
}

/**
 * Ротация группового ключа — генерирует новый и распространяет всем участникам.
 *
 * WARNING fix: новый ключ сначала распределяется участникам, и только после
 * подтверждения успеха старый ключ деактивируется (предотвращает блокировку при сбое).
 */
export async function rotateGroupKey(
  conversationId: string,
  senderIdentityKeyPair: { publicKey: CryptoKey; privateKey: CryptoKey },
  senderUserId: string,
  senderPublicKeyRaw: string,
): Promise<{ keyVersion: number; result: KeyDistributionResult } | null> {
  try {
    const { data: maxData } = await e2eeDb.chatEncryptionKeys.maxKeyVersion(conversationId);

    const currentVersion: number = maxData?.key_version ?? 0;
    const newVersion = currentVersion + 1;

    // Шаг 1: Генерируем новый групповой ключ
    const newGroupKey = await generateMessageKey();

    // Шаг 2: Распространяем новый ключ ПЕРЕД деактивацией старого
    //         Если распределение полностью провалилось — прерываем, старые ключи живы.
    const distResult = await distributeGroupKey(
      conversationId,
      newGroupKey,
      newVersion,
      senderIdentityKeyPair,
      senderUserId,
      senderPublicKeyRaw,
    );

    if (distResult.distributed.length === 0) {
      throw new Error('[keyDistribution] rotateGroupKey: key distribution failed for all participants; aborting rotation.');
    }

    // Шаг 3: Деактивируем старые ключи ТОЛЬКО при полном успехе.
    // При partial failure — оставляем оба ключа активными, чтобы участники
    // не потерявшие новый ключ могли продолжать читать сообщения.
    if (distResult.failed.length === 0) {
      await e2eeDb.chatEncryptionKeys.deactivateVersion(conversationId, currentVersion);
    } else {
      console.warn(
        `[keyDistribution] rotateGroupKey: partial failure — ${distResult.failed.length} participants did not receive key v${newVersion}. ` +
        `Old key v${currentVersion} kept active to avoid data loss.`,
        distResult.errors,
      );
    }

    return { keyVersion: newVersion, result: distResult };
  } catch (err) {
    console.error('[keyDistribution] rotateGroupKey error:', err);
    return null;
  }
}

/**
 * Очистка кеша публичных ключей
 */
export function clearPublicKeyCache(): void {
  publicKeyCache.clear();
}


