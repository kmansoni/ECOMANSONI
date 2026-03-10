// services/suppressionService.ts — Email suppression list management
//
// Responsibilities:
//   1. Check if email is suppressed before sending (per-tenant)
//   2. Add email to suppression list on hard bounce / complaint / unsubscribe
//   3. Remove from suppression list (manual only, admin action)
//   4. Handle expiring suppressions (soft bounce → 72h suppression)
//   5. Bulk check for batch sends (parallel Redis lookups)
//
// Suppression reasons (see suppression_list.reason CHECK constraint):
//   - bounce_hard:  permanent delivery failure (5xx)
//   - complaint:    recipient marked as spam (FBL)
//   - unsubscribe:  recipient clicked unsubscribe link
//   - manual:       admin-added suppression
//   - spam_trap:    known spam trap address detected
//
// Performance:
//   - Redis cache layer with negative caching ('none' sentinel)
//   - Covering index: idx_suppression_tenant_email
//   - Batch check: parallel Promise.all for Redis lookups, DB fallback
//
// Compliance:
//   - CAN-SPAM: unsubscribe suppression is permanent unless re-opted-in
//   - GDPR: gdprErase() removes across all tenants + invalidates caches

import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { getLogger } from '../lib/logger.js';

// ─── Types ─────────────────────

export type SuppressionReason = 'bounce_hard' | 'complaint' | 'unsubscribe' | 'manual' | 'spam_trap';

export interface SuppressionEntry {
  email: string;
  reason: SuppressionReason;
  sourceMessageId?: string;
  expiresAt?: Date;
}

// ─── Constants ─────────────────────

const CACHE_TTL_SEC = 3600;  // 1 hour Redis cache
const NEGATIVE_SENTINEL = 'none';

// ─── Service ─────────────────────

export class SuppressionService {
  constructor(
    private readonly db: Pool,
    private readonly redis: Redis,
  ) {}

  // ─── Single email check ─────────────────────

  /**
   * Проверяет, подавлен ли email для данного тенанта.
   * Порядок: Redis cache → PostgreSQL → negative cache.
   * Возвращает причину подавления или null если email разрешён.
   */
  async isSuppressed(tenantId: string, email: string): Promise<SuppressionReason | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const cacheKey = `supp:${tenantId}:${normalizedEmail}`;
    const logger = getLogger();

    // 1. Redis cache
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached === NEGATIVE_SENTINEL) return null;
      if (cached) return cached as SuppressionReason;
    } catch (err) {
      // Redis failure is non-fatal — fall through to DB
      logger.warn({ err, key: cacheKey }, 'Redis suppression cache read failed');
    }

    // 2. PostgreSQL lookup
    const result = await this.db.query<{ reason: SuppressionReason }>(
      `SELECT reason FROM suppression_list
       WHERE tenant_id = $1 AND email = $2
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [tenantId, normalizedEmail],
    );

    if (result.rows.length > 0) {
      const reason = result.rows[0]!.reason;
      // Positive cache
      try {
        await this.redis.setex(cacheKey, CACHE_TTL_SEC, reason);
      } catch { /* non-fatal */ }
      return reason;
    }

    // 3. Negative cache — email is NOT suppressed
    try {
      await this.redis.setex(cacheKey, CACHE_TTL_SEC, NEGATIVE_SENTINEL);
    } catch { /* non-fatal */ }

    return null;
  }

  // ─── Batch check ─────────────────────

  /**
   * Проверяет массив email на suppression. Возвращает разделённые списки.
   * Используется перед batch отправкой.
   * Параллельные Redis lookups с DB fallback.
   */
  async filterSuppressed(
    tenantId: string,
    emails: string[],
  ): Promise<{
    allowed: string[];
    suppressed: Array<{ email: string; reason: SuppressionReason }>;
  }> {
    const allowed: string[] = [];
    const suppressed: Array<{ email: string; reason: SuppressionReason }> = [];

    // Parallel checks (Redis is fast, DB fallback only on cache miss)
    const checks = await Promise.all(
      emails.map(async (email) => {
        const reason = await this.isSuppressed(tenantId, email);
        return { email, reason };
      }),
    );

    for (const check of checks) {
      if (check.reason) {
        suppressed.push({ email: check.email, reason: check.reason });
      } else {
        allowed.push(check.email);
      }
    }

    return { allowed, suppressed };
  }

  // ─── Add to suppression list ─────────────────────

  /**
   * Добавляет email в suppression list.
   * UPSERT: если email уже в списке — обновляет reason и expires_at.
   * Invalidates Redis cache сразу.
   */
  async add(tenantId: string, entry: SuppressionEntry): Promise<void> {
    const logger = getLogger();
    const normalizedEmail = entry.email.toLowerCase().trim();

    await this.db.query(
      `INSERT INTO suppression_list (tenant_id, email, reason, source_message_id, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, email) DO UPDATE SET
         reason = EXCLUDED.reason,
         source_message_id = EXCLUDED.source_message_id,
         expires_at = EXCLUDED.expires_at`,
      [
        tenantId,
        normalizedEmail,
        entry.reason,
        entry.sourceMessageId || null,
        entry.expiresAt || null,
      ],
    );

    // Invalidate + warm cache with new reason
    const cacheKey = `supp:${tenantId}:${normalizedEmail}`;
    try {
      await this.redis.setex(cacheKey, CACHE_TTL_SEC, entry.reason);
    } catch { /* non-fatal */ }

    logger.info(
      { tenantId, email: maskEmail(normalizedEmail), reason: entry.reason },
      'Added to suppression list',
    );
  }

  // ─── Remove from suppression list ─────────────────────

  /**
   * Удаляет email из suppression list (admin action).
   * Invalidates Redis cache.
   * Возвращает true если запись была удалена.
   */
  async remove(tenantId: string, email: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();

    const result = await this.db.query(
      `DELETE FROM suppression_list WHERE tenant_id = $1 AND email = $2`,
      [tenantId, normalizedEmail],
    );

    // Invalidate cache
    const cacheKey = `supp:${tenantId}:${normalizedEmail}`;
    try {
      await this.redis.del(cacheKey);
    } catch { /* non-fatal */ }

    return (result.rowCount ?? 0) > 0;
  }

  // ─── List suppressions (paginated) ─────────────────────

  /**
   * Список подавленных email для тенанта с пагинацией.
   * Опциональный фильтр по reason.
   */
  async list(
    tenantId: string,
    opts: { limit?: number; offset?: number; reason?: SuppressionReason },
  ): Promise<{
    items: Array<{
      email: string;
      reason: SuppressionReason;
      source_message_id: string | null;
      expires_at: string | null;
      created_at: string;
    }>;
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 50, 500); // Cap at 500
    const offset = opts.offset ?? 0;
    const params: (string | number)[] = [tenantId];

    let whereClause = `WHERE tenant_id = $1`;
    if (opts.reason) {
      params.push(opts.reason);
      whereClause += ` AND reason = $${params.length}`;
    }

    // Count total (for pagination headers)
    const countResult = await this.db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM suppression_list ${whereClause}`,
      params,
    );
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Fetch page
    const dataParams = [...params, limit, offset];
    const result = await this.db.query(
      `SELECT email, reason, source_message_id, expires_at, created_at
       FROM suppression_list
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      dataParams,
    );

    return { items: result.rows, total };
  }

  // ─── GDPR data erasure ─────────────────────

  /**
   * GDPR: удаляет все suppression записи для email из ВСЕХ тенантов.
   * Invalidates все Redis кеши для этого email.
   * Используется по запросу субъекта данных (data erasure request).
   */
  async gdprErase(email: string): Promise<{ deletedCount: number }> {
    const logger = getLogger();
    const normalizedEmail = email.toLowerCase().trim();

    // Delete from all tenants
    const result = await this.db.query(
      `DELETE FROM suppression_list WHERE email = $1`,
      [normalizedEmail],
    );
    const deletedCount = result.rowCount ?? 0;

    // Invalidate all tenant-specific caches
    // SCAN-based iteration to avoid KEYS blocking in production
    try {
      const pattern = `supp:*:${normalizedEmail}`;
      let cursor = '0';
      const keysToDelete: string[] = [];

      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } while (cursor !== '0');

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to invalidate Redis caches during GDPR erasure');
    }

    logger.info(
      { email: maskEmail(normalizedEmail), deletedCount },
      'GDPR erasure completed for suppression data',
    );

    return { deletedCount };
  }

  // ─── Cleanup expired suppressions ─────────────────────

  /**
   * Удаляет просроченные suppression записи (expires_at < NOW()).
   * Вызывается периодическим cron job.
   */
  async cleanupExpired(): Promise<number> {
    const logger = getLogger();

    const result = await this.db.query(
      `DELETE FROM suppression_list
       WHERE expires_at IS NOT NULL AND expires_at < NOW()
       RETURNING tenant_id, email`,
    );

    const deleted = result.rowCount ?? 0;

    // Invalidate caches for deleted entries
    if (result.rows.length > 0) {
      const keys = result.rows.map(
        (row: { tenant_id: string; email: string }) => `supp:${row.tenant_id}:${row.email}`,
      );
      try {
        await this.redis.del(...keys);
      } catch { /* non-fatal */ }
    }

    if (deleted > 0) {
      logger.info({ deletedCount: deleted }, 'Cleaned up expired suppressions');
    }

    return deleted;
  }
}

// ─── Utility ─────────────────────

/**
 * Маскирует email для безопасного логирования (PII protection).
 * user@domain.com → u***@domain.com
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}
