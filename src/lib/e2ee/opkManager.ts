/**
 * OPK Lifecycle Manager — One-Time Pre-Key single-use enforcement
 *
 * One-Time Pre-Keys (OPKs) обеспечивают дополнительную forward-secrecy в X3DH.
 * Каждый OPK используется ровно один раз: после использования удаляется.
 *
 * Lifecycle:
 *   generate  → publish (Supabase)
 *   consume   → атомарное удаление при X3DH initiation (server enforces via validate-key-session)
 *   replenish → автоматический refill когда запас ниже MIN_OPK_COUNT
 *   revoke    → явный отзыв скомпрометированных ключей
 *
 * Таргет: постоянный запас MIN_OPK_COUNT..MAX_OPK_COUNT на сервере.
 */

import { supabase } from '@/integrations/supabase/client';
import { e2eeDb } from './db-types';
import { toBase64 } from './utils';

// ─── Constants ────────────────────────────────────────────────────────────────

export const MIN_OPK_COUNT = 10;
export const MAX_OPK_COUNT = 50;
export const OPK_REPLENISH_THRESHOLD = 5; // refill when stock falls below this

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OneTimePreKey {
  id: string;           // UUID (server-assigned)
  userId: string;
  publicKeySpki: string; // base64 SPKI ECDH P-256
  createdAt: number;
}

export interface OPKBatch {
  keys: Array<{ id: string; publicKeySpki: string }>;
  count: number;
}

export interface OPKLifecycleStatus {
  stored: number;     // count in Supabase
  threshold: number;
  needsReplenish: boolean;
}

// ─── Key generation ───────────────────────────────────────────────────────────

/**
 * Генерирует N одноразовых ключевых пар ECDH P-256.
 * Приватные ключи сохраняются в E2EEKeyStore; публичные публикуются на сервер.
 *
 * @returns Array of { id, privateKey, publicKeySpki } — id используется как
 *          lookup key в KeyStore (format: `opk:${userId}:${id}`)
 */
export async function generateOPKBatch(
  userId: string,
  count = MAX_OPK_COUNT,
): Promise<Array<{ id: string; privateKey: CryptoKey; publicKeySpki: string }>> {
  const batch: Array<{ id: string; privateKey: CryptoKey; publicKeySpki: string }> = [];

  for (let i = 0; i < count; i++) {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      false, // private key non-extractable
      ['deriveKey', 'deriveBits'],
    );

    const spkiBuf = await crypto.subtle.exportKey('spki', pair.publicKey);
    const publicKeySpki = toBase64(spkiBuf);
    const id = crypto.randomUUID();

    batch.push({ id, privateKey: pair.privateKey, publicKeySpki });
  }

  return batch;
}

/**
 * Публикует пакет публичных OPK в Supabase.
 * Приватные ключи должны быть сохранены в E2EEKeyStore ПЕРЕД вызовом этой ф-ции.
 */
export async function publishOPKBatch(
  userId: string,
  batch: Array<{ id: string; publicKeySpki: string }>,
): Promise<void> {
  const rows = batch.map(({ id, publicKeySpki }) => ({
    id,
    user_id: userId,
    public_key_spki: publicKeySpki,
    created_at: new Date().toISOString(),
  }));

  const { error } = await e2eeDb.oneTimePrekeys.insert(rows);
  if (error) throw new Error(`[OPKManager] publishOPKBatch failed: ${error.message}`);
}

// ─── Status check ─────────────────────────────────────────────────────────────

/**
 * Проверяет текущий запас OPK для userId на сервере.
 */
export async function getOPKStatus(userId: string): Promise<OPKLifecycleStatus> {
  const { count, error } = await e2eeDb.oneTimePrekeys.countByUserId(userId);
  if (error) throw new Error(`[OPKManager] getOPKStatus failed: ${error.message}`);

  const stored = count ?? 0;
  return {
    stored,
    threshold: OPK_REPLENISH_THRESHOLD,
    needsReplenish: stored < OPK_REPLENISH_THRESHOLD,
  };
}

// ─── Replenishment ────────────────────────────────────────────────────────────

/**
 * Пополняет запас OPK если он упал ниже порогового значения.
 * Вызывается при старте приложения и после каждого использования OPK.
 *
 * @param storePrivateKey  Callback для сохранения приватного ключа в E2EEKeyStore
 */
export async function replenishOPKsIfNeeded(
  userId: string,
  storePrivateKey: (opkId: string, privateKey: CryptoKey) => Promise<void>,
): Promise<{ replenished: number }> {
  const status = await getOPKStatus(userId);
  if (!status.needsReplenish) return { replenished: 0 };

  const toGenerate = MAX_OPK_COUNT - status.stored;
  const batch = await generateOPKBatch(userId, toGenerate);

  // Store private keys FIRST before publishing public keys
  for (const { id, privateKey } of batch) {
    await storePrivateKey(`opk:${userId}:${id}`, privateKey);
  }

  // Then publish public keys
  await publishOPKBatch(userId, batch.map(({ id, publicKeySpki }) => ({ id, publicKeySpki })));

  return { replenished: toGenerate };
}

// ─── Revocation ───────────────────────────────────────────────────────────────

/**
 * Отзывает конкретные OPK (при подозрении на компрометацию).
 * Удаляет с сервера; вызывающий должен удалить приватные ключи из KeyStore.
 */
export async function revokeOPKs(
  userId: string,
  opkIds: string[],
): Promise<{ revoked: string[]; failed: string[] }> {
  const revoked: string[] = [];
  const failed: string[] = [];

  // Batch delete in chunks of 50
  for (let i = 0; i < opkIds.length; i += 50) {
    const chunk = opkIds.slice(i, i + 50);
    const { error } = await e2eeDb.oneTimePrekeys.deleteByIds(userId, chunk);
    if (error) {
      failed.push(...chunk);
    } else {
      revoked.push(...chunk);
    }
  }

  return { revoked, failed };
}

/**
 * Отзывает ВСЕ OPK пользователя (при смене identity key или подозрении на компрометацию).
 * Автоматически генерирует и публикует свежий набор MAX_OPK_COUNT ключей.
 */
export async function revokeAllAndReplenish(
  userId: string,
  storePrivateKey: (opkId: string, privateKey: CryptoKey) => Promise<void>,
): Promise<{ revoked: number; replenished: number }> {
  // Delete all
  const { count: deletedCount, error } = await e2eeDb.oneTimePrekeys.deleteAllByUserId(userId);
  if (error) throw new Error(`[OPKManager] revokeAll failed: ${error.message}`);

  // Publish fresh batch
  const batch = await generateOPKBatch(userId, MAX_OPK_COUNT);
  for (const { id, privateKey } of batch) {
    await storePrivateKey(`opk:${userId}:${id}`, privateKey);
  }
  await publishOPKBatch(userId, batch.map(({ id, publicKeySpki }) => ({ id, publicKeySpki })));

  return { revoked: deletedCount ?? 0, replenished: batch.length };
}
