// services/sendService.ts — SMTP send orchestrator
//
// Core responsibilities:
//   1. Accept SendEmailJob from BullMQ worker
//   2. Check circuit breaker state (lib/circuitBreaker.ts)
//   3. Build nodemailer message (headers, attachments)
//   4. Send via nodemailer pool with connection reuse
//   5. Update email_messages status + emit event to email_events
//   6. On failure: classify, schedule retry or mark permanent failure
//
// Connection pooling:
//   - Single nodemailer pool for SMTP relay (Postfix)
//   - Max connections: 10, max messages per connection: 100
//   - Idle timeout: 30s
//   - Pool closed on graceful shutdown
//
// Retry strategy:
//   - Exponential backoff: 30s, 2min, 8min, 32min, 2h
//   - Jitter: ±20% to avoid thundering herd
//   - Hard bounce (5xx): no retry, mark as rejected
//   - Soft bounce (4xx): retry up to max_retries
//   - Connection error: retry + circuit breaker increment
//
// Observability:
//   - prom-client counters: emails_sent_total (by status + tenant)
//   - prom-client histogram: send_duration_seconds (by status)
//   - prom-client gauge: active SMTP connections

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import { getEnv } from '../config/env.js';
import { getLogger } from '../lib/logger.js';
import { CircuitBreaker, CircuitOpenError } from '../lib/circuitBreaker.js';
import type { SendEmailJob } from '../types/index.js';
import type { QueueService } from './queueService.js';
import { Counter, Histogram, Gauge } from 'prom-client';

// ─── Prometheus metrics ─────────────────────
// Counters, histograms, and gauges are singletons — prom-client deduplicates by name.

const emailsSentTotal = new Counter({
  name: 'email_router_emails_sent_total',
  help: 'Total emails sent by the email router',
  labelNames: ['status', 'tenant_id'] as const,
});

const emailSendDuration = new Histogram({
  name: 'email_router_send_duration_seconds',
  help: 'Email send duration in seconds',
  labelNames: ['status'] as const,
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
});

const smtpConnectionsActive = new Gauge({
  name: 'email_router_smtp_connections_active',
  help: 'Currently active SMTP connections',
});

// ─── Retry backoff calculator ─────────────────────

/**
 * Exponential backoff with jitter.
 * Schedule: 30s → 2m → 8m → 32m → 2h (capped).
 * Jitter: ±20% to prevent thundering herd on recovery.
 */
function calculateBackoff(attempt: number): number {
  const baseMs = 30_000;
  const maxMs = 2 * 60 * 60 * 1000; // 2 hours cap
  const delay = Math.min(baseMs * Math.pow(4, attempt - 1), maxMs);
  // Jitter: ±20%
  const jitter = delay * 0.2 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

// ─── SMTP error classification ─────────────────────

/**
 * Определяет, можно ли ретраить ошибку SMTP.
 *
 * Нет кода   → retry (network error, timeout, connection refused).
 * 4xx        → все временные по RFC 5321; retry.
 * 521, 550+  → permanent failures; no retry.
 *
 * NOTE: Koды 421/450/451/452 являются 4xx и уже покрыты условием `>= 400 && < 500`.
 * Ранее здесь был мёртвый блок `if ([421, 450, 451, 452].includes(code))` с
 * ошибочным комментарием "5xx codes" — удалён.
 */
function isRetryableSmtpError(code: number | undefined): boolean {
  if (!code) return true; // Connection error, timeout, etc. → retry
  if (code >= 400 && code < 500) return true; // All 4xx are temporary per RFC 5321
  return false; // 5xx permanent → don't retry
}

// ─── Service ─────────────────────

export class SendService {
  private transporter: Transporter;
  private circuitBreaker: CircuitBreaker;
  private shuttingDown = false;

  constructor(
    private readonly db: Pool,
    redis: Redis,
    private readonly queueService: QueueService,
  ) {
    const env = getEnv();

    // ── Nodemailer SMTP transport with connection pooling ──
    const transportOpts: Record<string, unknown> = {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      pool: true,
      maxConnections: 10,     // Max simultaneous SMTP connections
      maxMessages: 100,       // Max messages per connection before reconnect
      socketTimeout: 30_000,  // Socket idle timeout
      greetingTimeout: 15_000,// Time to wait for SMTP greeting
      tls: {
        rejectUnauthorized: env.NODE_ENV === 'production',
      },
    };

    // Auth is optional — in relay setups (Postfix on localhost) no auth needed
    if (env.SMTP_USER) {
      transportOpts.auth = { user: env.SMTP_USER, pass: env.SMTP_PASS };
    }

    this.transporter = nodemailer.createTransport(transportOpts);

    // ── Circuit breaker for SMTP failures ──
    this.circuitBreaker = new CircuitBreaker(redis, {
      name: 'smtp-postfix',
      threshold: env.CIRCUIT_BREAKER_THRESHOLD,
      resetTimeoutMs: env.CIRCUIT_BREAKER_RESET_MS,
      halfOpenMax: 3,
    });
  }

  // ─── Core send logic (BullMQ worker handler) ─────────────────────

  /**
   * Обработчик задачи из BullMQ — основная логика отправки email.
   *
   * Flow:
   *   1. Update status → processing
   *   2. Execute SMTP send through circuit breaker
   *   3. On success: status → sent, record smtp_message_id
   *   4. On failure: classify → schedule retry or mark permanent failure
   */
  async processSendJob(job: SendEmailJob): Promise<void> {
    const logger = getLogger().child({
      messageId: job.messageId,
      tenantId: job.tenantId,
      attempt: job.attempt,
    });

    if (this.shuttingDown) {
      logger.warn('Send job received during shutdown — re-queuing');
      await this.scheduleRetry(job, 5000);
      return;
    }

    const timer = emailSendDuration.startTimer();

    try {
      // 1. Status → processing
      await this.updateMessageStatus(job.messageId, 'processing');
      await this.insertEvent(job.messageId, 'processing', {});

      // 2. SMTP send through circuit breaker
      const result = await this.circuitBreaker.execute(async () => {
        smtpConnectionsActive.inc();
        try {
          const info = await this.transporter.sendMail({
            from: `"${escapeName(job.from.name)}" <${job.from.email}>`,
            to: formatRecipients(job.to),
            cc: job.cc ? formatRecipients(job.cc) : undefined,
            bcc: job.bcc ? formatRecipients(job.bcc) : undefined,
            subject: job.subject,
            html: job.html || undefined,
            text: job.text || undefined,
            headers: {
              ...job.headers,
              'X-Message-Id': job.messageId,
              'X-Tenant-Id': job.tenantId,
              'List-Unsubscribe': `<mailto:unsubscribe@mansoni.ru?subject=unsubscribe-${job.messageId}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              // RFC 8058: One-Click Unsubscribe support
            },
            attachments: job.attachments?.map((a) => ({
              filename: a.filename,
              content: Buffer.from(a.content, 'base64'),
              contentType: a.contentType,
            })),
          });
          return info;
        } finally {
          smtpConnectionsActive.dec();
        }
      });

      // 3. Success — update DB
      const smtpMessageId = result.messageId;
      await this.db.query(
        `UPDATE email_messages
         SET status = 'sent',
             smtp_message_id = $2,
             smtp_response = $3,
             sent_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [job.messageId, smtpMessageId, result.response],
      );

      await this.insertEvent(job.messageId, 'sent', {
        smtpMessageId,
        response: result.response,
      });

      emailsSentTotal.inc({ status: 'sent', tenant_id: job.tenantId });
      timer({ status: 'sent' });

      logger.info({ smtpMessageId }, 'Email sent successfully');
    } catch (error: unknown) {
      timer({ status: 'failed' });

      const err = error as Error & {
        responseCode?: number;
        code?: number;
        response?: string;
      };
      logger.error({ err: err.message, code: err.responseCode || err.code }, 'Email send failed');

      // ── Circuit breaker OPEN → schedule retry at resetTimeout ──
      if (error instanceof CircuitOpenError) {
        emailsSentTotal.inc({ status: 'circuit_open', tenant_id: job.tenantId });
        const env = getEnv();
        await this.scheduleRetry(job, env.CIRCUIT_BREAKER_RESET_MS);
        return;
      }

      // ── Classify SMTP error ──
      const smtpCode = err.responseCode || err.code;
      const isRetryable = isRetryableSmtpError(typeof smtpCode === 'number' ? smtpCode : undefined);

      if (isRetryable && job.attempt < job.maxRetries) {
        // Schedule retry with exponential backoff + jitter
        const delayMs = calculateBackoff(job.attempt);
        await this.scheduleRetry(job, delayMs);
        emailsSentTotal.inc({ status: 'retry', tenant_id: job.tenantId });
        logger.warn(
          { smtpCode, attempt: job.attempt, nextRetryMs: delayMs },
          'Scheduling retry',
        );
      } else {
        // Permanent failure or max retries exhausted
        const finalStatus = isRetryable ? 'failed' : 'rejected';
        await this.updateMessageStatus(job.messageId, finalStatus);
        await this.insertEvent(job.messageId, finalStatus, {
          smtpCode,
          error: err.message,
          response: err.response,
        });
        emailsSentTotal.inc({ status: finalStatus, tenant_id: job.tenantId });
        logger.error(
          { smtpCode, finalStatus, attempt: job.attempt },
          'Email permanently failed',
        );
      }
    }
  }

  // ─── Retry scheduling ─────────────────────

  /**
   * Планирует retry через BullMQ retryQueue.
   * Обновляет email_messages.retry_count и next_retry_at.
   * Записывает в retry_log для аудита.
   */
  private async scheduleRetry(job: SendEmailJob, delayMs: number): Promise<void> {
    const nextAttempt = job.attempt + 1;
    const logger = getLogger().child({ messageId: job.messageId, attempt: nextAttempt });

    try {
      // Update message record
      await this.db.query(
        `UPDATE email_messages
         SET retry_count = $2,
             next_retry_at = NOW() + make_interval(secs => $3::double precision / 1000),
             updated_at = NOW()
         WHERE id = $1`,
        [job.messageId, nextAttempt, delayMs],
      );

      // Audit log entry
      await this.db.query(
        `INSERT INTO retry_log (message_id, attempt_number, next_retry_at)
         VALUES ($1, $2, NOW() + make_interval(secs => $3::double precision / 1000))`,
        [job.messageId, nextAttempt, delayMs],
      );

      await this.insertEvent(job.messageId, 'deferred', {
        attempt: nextAttempt,
        delayMs,
      });

      // Enqueue retry job
      await this.queueService.addRetryJob(
        { ...job, attempt: nextAttempt },
        delayMs,
      );

      logger.info({ delayMs }, 'Retry scheduled');
    } catch (retryErr) {
      // If retry scheduling itself fails, log but don't throw
      // (the original error is already handled)
      logger.error({ err: retryErr }, 'Failed to schedule retry');
    }
  }

  // ─── Database helpers ─────────────────────

  /**
   * Обновляет статус email_messages. Идемпотентная операция.
   */
  private async updateMessageStatus(messageId: string, status: string): Promise<void> {
    await this.db.query(
      `UPDATE email_messages SET status = $2, updated_at = NOW() WHERE id = $1`,
      [messageId, status],
    );
  }

  /**
   * Вставляет событие в email_events. Append-only.
   */
  private async insertEvent(
    messageId: string,
    eventType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO email_events (message_id, event_type, event_data, smtp_code, smtp_response)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        messageId,
        eventType,
        JSON.stringify(data),
        typeof data.smtpCode === 'number' ? data.smtpCode : null,
        (data.response as string) || (data.error as string) || null,
      ],
    );
  }

  // ─── Health check ─────────────────────

  /**
   * SMTP connectivity check (для /ready endpoint).
   * Sends EHLO to SMTP server without actually sending email.
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Текущее состояние circuit breaker.
   */
  async getCircuitState(): Promise<string> {
    return this.circuitBreaker.getState();
  }

  // ─── Graceful shutdown ─────────────────────

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.transporter.close();
  }
}

// ─── Utility functions ─────────────────────

/**
 * Formats an array of recipients into a comma-separated string
 * with proper RFC 5322 name quoting.
 */
function formatRecipients(recipients: Array<{ email: string; name?: string }>): string {
  return recipients
    .map((r) =>
      r.name ? `"${escapeName(r.name)}" <${r.email}>` : r.email,
    )
    .join(', ');
}

/**
 * Санитизирует display name для безопасной вставки в RFC 5322 quoted-string.
 *
 * SMTP Header Injection вектор:
 *   Входной формат заголовка: `"<name>" <email>`
 *   Если name содержит CRLF (\r\n), символ может завершить текущий заголовок
 *   и начать новый: `"Bob\r\nBcc: attacker@evil.com" <bob@example.com>`.
 *   Ряд SMTP-серверов и MTA интерпретируют это как два отдельных заголовка.
 *
 * Применяемые правила:
 *   1. Strip CRLF, CR, LF, null bytes (\0), вертикальных табуляций (\v), BS (\b) —
 *      все управляющие символы, которые могут разорвать заголовок.
 *   2. Экранирование `"` → `\"` (RFC 5322 quoted-string).
 *   3. Обрезка до 78 символов — защита от line-length DoS и аномальных MTA.
 *
 * Самокритика: nodemailer >= 6.x сам strip'ает CRLF из заголовков, но
 *   - это поведение не задокументировано как security guarantee
 *   - мы не должны полагаться на библиотечный side effect как защитную меру
 *   - defense-in-depth: sanitize on input, not just at the transport layer
 */
function escapeName(name: string): string {
  return name
    // Шаг 1: убираем все управляющие символы (0x00-0x1F кроме допустимых в FWS),
    // особенно CR (\r), LF (\n), NULL (\0) — они дают header injection
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    // Шаг 2: RFC 5322 quoted-string — экранируем `"` и `\`
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    // Шаг 3: нормализуем пробелы и обрезаем длину
    .trim()
    .slice(0, 78);
}
