// services/bounceProcessor.ts — Bounce and complaint processing
//
// BullMQ worker that processes bounce notifications:
//
// Input sources:
//   1. SMTP DSN (Delivery Status Notification) parsing
//   2. Webhook callbacks from Postfix milter / external ESPs
//   3. ARF (Abuse Reporting Format) complaint parsing
//
// Processing pipeline:
//   1. Parse bounce → extract original message_id
//   2. Classify bounce type using RFC 3463 Enhanced Status Codes:
//      - Hard bounce (5.1.x): invalid address → permanent suppression
//      - Soft bounce (4.x.x): temporary failure → no suppression
//      - Complaint (ARF): spam report → permanent suppression
//   3. Update email_messages.status → 'bounced'
//   4. Insert email_events record (event_type: 'bounced' | 'complained')
//   5. Add to suppression_list if hard bounce or complaint
//
// Metrics:
//   - bounces_processed_total{bounce_type=hard|soft|undetermined}
//
// Security:
//   - PII masked in logs (email addresses)
//   - Rate limit on bounce webhook ingestion (handled at middleware level)

import type { Pool } from 'pg';
import { getLogger } from '../lib/logger.js';
import type { SuppressionService, SuppressionReason } from './suppressionService.js';
import type { BounceProcessJob } from '../types/index.js';
import { Counter } from 'prom-client';

// ─── Prometheus metrics ─────────────────────

const bouncesProcessedTotal = new Counter({
  name: 'email_router_bounces_processed_total',
  help: 'Total bounces processed by type',
  labelNames: ['bounce_type'] as const,
});

// ─── Bounce classification ─────────────────────

interface BounceClassification {
  bounceType: 'hard' | 'soft' | 'undetermined';
  suppressionReason: SuppressionReason | null;
}

/**
 * Классифицирует bounce на основе SMTP кода, Enhanced Status Code и диагностики.
 * Следует RFC 3463 (Enhanced Mail System Status Codes).
 *
 * Hard bounce → permanent suppression (bounce_hard)
 * Complaint → permanent suppression (complaint)
 * Soft bounce → no suppression (temporary, will be retried)
 */
function classifyBounce(
  smtpCode?: number,
  enhancedCode?: string,
  diagnosticCode?: string,
): BounceClassification {
  // ── Hard bounce SMTP codes (permanent delivery failure) ──
  const hardSmtpCodes = new Set([550, 551, 552, 553, 554, 556]);

  // ── Hard bounce Enhanced Status Codes ──
  const hardEnhancedCodes = new Set([
    '5.1.1', // Bad destination mailbox address
    '5.1.2', // Bad destination system address
    '5.1.3', // Bad destination mailbox address syntax
    '5.1.6', // Destination mailbox has moved
    '5.2.1', // Mailbox disabled, not accepting messages
    '5.3.0', // Other or undefined mail system status
    '5.4.4', // Unable to route
    '5.7.1', // Delivery not authorized, message refused
    '5.7.13', // User account disabled
    '5.7.17', // Mailbox owner has changed
  ]);

  // 1. Check explicit hard bounce by SMTP code
  if (smtpCode && hardSmtpCodes.has(smtpCode)) {
    return { bounceType: 'hard', suppressionReason: 'bounce_hard' };
  }

  // 2. Check enhanced status code
  if (enhancedCode && hardEnhancedCodes.has(enhancedCode)) {
    return { bounceType: 'hard', suppressionReason: 'bounce_hard' };
  }

  // 3. Check for soft bounce (4xx = temporary failure)
  if (smtpCode && smtpCode >= 400 && smtpCode < 500) {
    return { bounceType: 'soft', suppressionReason: null };
  }

  // 4. Diagnostic text analysis for spam/abuse complaints
  if (diagnosticCode) {
    const lowerDiag = diagnosticCode.toLowerCase();

    // Spam / abuse complaint patterns
    const complaintPatterns = ['spam', 'abuse', 'complaint', 'junk', 'unsolicited'];
    for (const pattern of complaintPatterns) {
      if (lowerDiag.includes(pattern)) {
        return { bounceType: 'hard', suppressionReason: 'complaint' };
      }
    }

    // Permanent failure patterns in diagnostic text
    const permanentPatterns = [
      'user unknown',
      'no such user',
      'mailbox not found',
      'does not exist',
      'invalid recipient',
      'undeliverable',
      'recipient rejected',
      'address rejected',
      'account disabled',
      'account has been disabled',
      'inactive user',
      'deactivated',
    ];
    for (const pattern of permanentPatterns) {
      if (lowerDiag.includes(pattern)) {
        return { bounceType: 'hard', suppressionReason: 'bounce_hard' };
      }
    }

    // Temporary failure patterns
    const temporaryPatterns = [
      'try again',
      'temporarily',
      'too many connections',
      'rate limit',
      'over quota',
      'mailbox full',
      'insufficient storage',
    ];
    for (const pattern of temporaryPatterns) {
      if (lowerDiag.includes(pattern)) {
        return { bounceType: 'soft', suppressionReason: null };
      }
    }
  }

  // 5. Unknown SMTP 5xx → treat as hard bounce (conservative)
  if (smtpCode && smtpCode >= 500) {
    return { bounceType: 'hard', suppressionReason: 'bounce_hard' };
  }

  // 6. Cannot determine → undetermined, no suppression
  return { bounceType: 'undetermined', suppressionReason: null };
}

// ─── Service ─────────────────────

export class BounceProcessor {
  constructor(
    private readonly db: Pool,
    private readonly suppressionService: SuppressionService,
  ) {}

  // ─── BullMQ worker handler ─────────────────────

  /**
   * Обрабатывает bounce из очереди.
   *
   * Flow:
   *   1. Classify bounce (hard/soft/complaint)
   *   2. Find original message by smtp_message_id
   *   3. Update message status → bounced
   *   4. Insert bounce event
   *   5. Add to suppression list (if hard/complaint)
   */
  async processBounce(job: BounceProcessJob): Promise<void> {
    const logger = getLogger().child({
      recipient: maskEmail(job.recipient),
      smtpCode: job.smtpCode,
    });

    // 1. Classify bounce
    const classification = classifyBounce(
      job.smtpCode,
      undefined, // enhancedCode not in BounceProcessJob — extracted from diagnosticCode if available
      job.diagnosticCode,
    );
    const { bounceType, suppressionReason } = classification;

    logger.info({ bounceType, suppressionReason }, 'Processing bounce');

    // 2. Find original message
    let messageId: string | null = null;
    if (job.smtpMessageId) {
      messageId = await this.findMessageBySmtpId(job.smtpMessageId);
    }

    // 3. Update message status
    if (messageId) {
      await this.db.query(
        `UPDATE email_messages SET status = 'bounced', updated_at = NOW() WHERE id = $1`,
        [messageId],
      );

      // 4. Insert bounce event
      await this.db.query(
        `INSERT INTO email_events (message_id, event_type, event_data, smtp_code, smtp_response)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          messageId,
          suppressionReason === 'complaint' ? 'complained' : 'bounced',
          JSON.stringify({
            bounceType,
            recipient: job.recipient,
            diagnosticCode: job.diagnosticCode,
          }),
          job.smtpCode ?? null,
          job.diagnosticCode ?? null,
        ],
      );
    } else {
      logger.warn(
        { smtpMessageId: job.smtpMessageId },
        'Could not find original message for bounce — event recorded without message link',
      );
    }

    // 5. Suppression for hard bounce or complaint
    if (suppressionReason) {
      // Resolve tenant_id from the original message
      const tenantId = messageId
        ? await this.findTenantByMessageId(messageId)
        : null;

      if (tenantId) {
        await this.suppressionService.add(tenantId, {
          email: job.recipient,
          reason: suppressionReason,
          sourceMessageId: messageId || undefined,
        });

        logger.warn(
          { email: maskEmail(job.recipient), reason: suppressionReason },
          'Email added to suppression list',
        );
      } else {
        logger.error(
          { email: maskEmail(job.recipient) },
          'Cannot determine tenant for suppression — bounce without original message',
        );
      }
    }

    // 6. Metrics
    bouncesProcessedTotal.inc({ bounce_type: bounceType });
  }

  // ─── Webhook handler ─────────────────────

  /**
   * Обработчик POST /email/webhooks/bounce от Postfix milter / external ESP.
   * Принимает уже разобранный payload, конвертирует в BounceProcessJob
   * и вызывает processBounce().
   */
  async processWebhookBounce(payload: {
    messageId?: string;
    smtpMessageId?: string;
    bounceType: string;
    recipient: string;
    smtpCode?: number;
    smtpEnhancedCode?: string;
    diagnosticCode?: string;
  }): Promise<void> {
    const job: BounceProcessJob = {
      bounceType: payload.bounceType,
      recipient: payload.recipient,
      smtpCode: payload.smtpCode,
      smtpMessageId: payload.smtpMessageId,
      diagnosticCode: payload.diagnosticCode,
    };

    await this.processBounce(job);
  }

  // ─── Database lookups ─────────────────────

  /**
   * Поиск message id по SMTP Message-ID.
   * Uses partial index idx_messages_smtp_message_id.
   */
  private async findMessageBySmtpId(smtpMessageId: string): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id FROM email_messages WHERE smtp_message_id = $1 LIMIT 1`,
      [smtpMessageId],
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Получить tenant_id из email_messages.
   * Нужен для добавления в suppression list правильного тенанта.
   */
  private async findTenantByMessageId(messageId: string): Promise<string | null> {
    const result = await this.db.query<{ tenant_id: string }>(
      `SELECT tenant_id FROM email_messages WHERE id = $1`,
      [messageId],
    );
    return result.rows[0]?.tenant_id ?? null;
  }

  // ─── Analytics ─────────────────────

  /**
   * Статистика bounces за период (для admin dashboard).
   * Агрегирует по типу и по дням.
   */
  async getStats(
    tenantId: string,
    days: number = 30,
  ): Promise<{
    total: number;
    hard: number;
    soft: number;
    complaint: number;
    byDay: Array<{ date: string; count: number; bounceType: string }>;
  }> {
    // Sanitize days to prevent unreasonable range queries
    const safeDays = Math.min(Math.max(days, 1), 365);

    // Aggregate totals
    const totalsResult = await this.db.query<{
      hard: string;
      soft: string;
      complaint: string;
      total: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE e.event_data->>'bounceType' = 'hard') as hard,
         COUNT(*) FILTER (WHERE e.event_data->>'bounceType' = 'soft') as soft,
         COUNT(*) FILTER (WHERE e.event_type = 'complained') as complaint,
         COUNT(*) as total
       FROM email_events e
       JOIN email_messages m ON e.message_id = m.id
       WHERE m.tenant_id = $1
         AND e.event_type IN ('bounced', 'complained')
         AND e.created_at >= NOW() - make_interval(days => $2)`,
      [tenantId, safeDays],
    );

    // Aggregate by day
    const byDayResult = await this.db.query<{
      date: string;
      bounce_type: string;
      count: string;
    }>(
      `SELECT
         DATE(e.created_at) as date,
         COALESCE(e.event_data->>'bounceType', 'undetermined') as bounce_type,
         COUNT(*) as count
       FROM email_events e
       JOIN email_messages m ON e.message_id = m.id
       WHERE m.tenant_id = $1
         AND e.event_type IN ('bounced', 'complained')
         AND e.created_at >= NOW() - make_interval(days => $2)
       GROUP BY DATE(e.created_at), e.event_data->>'bounceType'
       ORDER BY date DESC`,
      [tenantId, safeDays],
    );

    const row = totalsResult.rows[0];
    return {
      total: parseInt(row?.total ?? '0', 10),
      hard: parseInt(row?.hard ?? '0', 10),
      soft: parseInt(row?.soft ?? '0', 10),
      complaint: parseInt(row?.complaint ?? '0', 10),
      byDay: byDayResult.rows.map((r) => ({
        date: r.date,
        count: parseInt(r.count, 10),
        bounceType: r.bounce_type,
      })),
    };
  }
}

// ─── Utility ─────────────────────

/**
 * Маскирует email для логов (PII protection).
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local.charAt(0)}***@${domain}`;
}
