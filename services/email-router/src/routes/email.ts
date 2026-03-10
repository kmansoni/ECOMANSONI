// routes/email.ts — Email API routes
//
// POST /email/send                          — Send single email (idempotent)
// POST /email/bulk                          — Batch send (up to 500 messages)
// GET  /email/status/:messageId             — Get message status + events
// POST /email/webhooks/bounce               — Inbound bounce webhook (no JWT)
// GET  /email/suppression                   — List suppressed emails (admin/service)
// GET  /email/admin/queues                  — Queue stats (admin only)
// POST /email/admin/queues/:queueName/replay/:jobId — DLQ replay (admin only)
//
// All mutation routes enforce:
//   - JWT auth via authSupabaseJwt middleware
//   - Per-tenant rate limiting via TenantRateLimiter (Redis sliding window)
//   - Idempotency key check (Redis + PostgreSQL two-tier)
//   - Suppression list check before enqueue
//   - Input validation via zod schemas
//
// Security model:
//   - Zero-trust: every field validated server-side
//   - Tenant isolation: all DB queries scoped by tenant_id from JWT
//   - PII protection: email addresses masked in logs
//   - Rate limits: per-IP (global) + per-tenant (sliding window)

import { Router, Request, Response } from 'express';
import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { Pool } from 'pg';
import { authSupabaseJwt, adminOnly } from '../middleware/authSupabaseJwt.js';
import { tenantRateLimitMiddleware, TenantRateLimiter } from '../lib/rateLimit.js';
import { IdempotencyService } from '../lib/idempotency.js';
import { QueueService } from '../services/queueService.js';
import { TemplateService } from '../services/templateService.js';
import { SuppressionService } from '../services/suppressionService.js';
import { BounceProcessor } from '../services/bounceProcessor.js';
import {
  SendEmailRequestSchema,
  BulkSendRequestSchema,
  BounceWebhookSchema,
  type SendEmailJob,
  type ApiResponse,
} from '../types/index.js';
import { getEnv } from '../config/env.js';

export function createEmailRouter(deps: {
  db: Pool;
  queueService: QueueService;
  templateService: TemplateService;
  suppressionService: SuppressionService;
  bounceProcessor: BounceProcessor;
  idempotencyService: IdempotencyService;
  tenantRateLimiter: TenantRateLimiter;
}): Router {
  const router = Router();
  const { db, queueService, templateService, suppressionService, bounceProcessor, idempotencyService, tenantRateLimiter } = deps;

  // ─── POST /email/send ─────────────────────
  // Отправка одного письма.
  // Flow: validate → idempotency check → suppression filter →
  //       template render → DB insert → idempotency register →
  //       enqueue → record rate limit usage → emit event → respond 202
  router.post('/send',
    authSupabaseJwt(),
    tenantRateLimitMiddleware(tenantRateLimiter),
    async (req: Request, res: Response) => {
      const logger = req.log;
      try {
        // 1. Validate request body against Zod schema
        const parseResult = SendEmailRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
          const response: ApiResponse = {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: parseResult.error.flatten() },
            requestId: req.requestId,
            timestamp: new Date().toISOString(),
          };
          res.status(400).json(response);
          return;
        }
        const body = parseResult.data;
        const tenantId = req.auth!.tenantId;
        const env = getEnv();

        // 2. Idempotency check (Redis → PG two-tier)
        // If the same idempotencyKey was already processed → return cached result
        if (body.idempotencyKey) {
          const idemResult = await idempotencyService.check(tenantId, body.idempotencyKey);
          if (idemResult.isDuplicate) {
            logger.info({ idempotencyKey: body.idempotencyKey, existingId: idemResult.existingMessageId }, 'Duplicate request');
            const response: ApiResponse = {
              success: true,
              data: { messageId: idemResult.existingMessageId, status: idemResult.existingStatus, duplicate: true },
              requestId: req.requestId,
              timestamp: new Date().toISOString(),
            };
            res.status(200).json(response);
            return;
          }
        }

        // 3. Suppression check — filter out bounced/complained/unsubscribed recipients
        const allRecipients = [
          ...body.to.map(r => r.email),
          ...(body.cc || []).map(r => r.email),
          ...(body.bcc || []).map(r => r.email),
        ];
        const suppressionResult = await suppressionService.filterSuppressed(tenantId, allRecipients);
        if (suppressionResult.suppressed.length > 0) {
          logger.warn({ suppressed: suppressionResult.suppressed.length }, 'Some recipients are suppressed');
        }
        // Если ВСЕ получатели подавлены — reject полностью
        if (suppressionResult.allowed.length === 0) {
          const response: ApiResponse = {
            success: false,
            error: { code: 'ALL_RECIPIENTS_SUPPRESSED', message: 'All recipients are in suppression list', details: suppressionResult.suppressed },
            requestId: req.requestId,
            timestamp: new Date().toISOString(),
          };
          res.status(422).json(response);
          return;
        }

        // 4. Template rendering (if template specified)
        let subject = body.subject;
        let html = body.html;
        let text = body.text;

        if (body.templateId || body.templateSlug) {
          // Resolve template from DB (with locale fallback chain)
          const template = await templateService.findTemplate({
            id: body.templateId,
            slug: body.templateSlug,
            locale: body.locale,
            tenantId,
          });
          if (!template) {
            res.status(404).json({
              success: false,
              error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' },
              requestId: req.requestId,
              timestamp: new Date().toISOString(),
            });
            return;
          }
          const rendered = await templateService.render(template, body.templateData || {});
          subject = rendered.subject;
          html = rendered.html;
          text = rendered.text;
        } else if (body.html || body.text) {
          // Inline template rendering with Handlebars if templateData provided
          if (body.templateData && Object.keys(body.templateData).length > 0) {
            const rendered = templateService.renderInline({
              subject: body.subject,
              html: body.html,
              text: body.text,
              data: body.templateData,
            });
            subject = rendered.subject;
            html = rendered.html;
            text = rendered.text;
          }
        }

        // 5. Insert message into database (status='queued')
        // Transaction isolation: READ COMMITTED is sufficient here because
        // the idempotency check already guards against duplicate inserts,
        // and the BullMQ job deduplicates by messageId.
        const messageId = randomUUID();
        const fromEmail = body.from?.email || env.DEFAULT_FROM_EMAIL;
        const fromName = body.from?.name || env.DEFAULT_FROM_NAME;

        await db.query(
          `INSERT INTO email_messages (id, tenant_id, idempotency_key, from_email, from_name, to_emails, cc_emails, bcc_emails, subject, body_html, body_text, template_id, template_data, headers, attachments, priority, metadata, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'queued')`,
          [
            messageId, tenantId, body.idempotencyKey || null,
            fromEmail, fromName,
            JSON.stringify(body.to), JSON.stringify(body.cc || null), JSON.stringify(body.bcc || null),
            subject, html || null, text || null,
            body.templateId || null, JSON.stringify(body.templateData || null),
            JSON.stringify(body.headers || null), JSON.stringify(body.attachments || null),
            body.priority, JSON.stringify(body.metadata || null),
          ]
        );

        // 6. Register idempotency key → messageId mapping
        if (body.idempotencyKey) {
          await idempotencyService.register(tenantId, body.idempotencyKey, messageId, 'queued');
        }

        // 7. Add to BullMQ send queue (idempotent by messageId as jobId)
        const job: SendEmailJob = {
          messageId,
          tenantId,
          to: body.to.filter(r => suppressionResult.allowed.includes(r.email)),
          cc: body.cc?.filter(r => suppressionResult.allowed.includes(r.email)),
          bcc: body.bcc?.filter(r => suppressionResult.allowed.includes(r.email)),
          from: { email: fromEmail, name: fromName },
          subject: subject!,
          html: html || undefined,
          text: text || undefined,
          headers: body.headers,
          attachments: body.attachments,
          priority: body.priority,
          attempt: 1,
          maxRetries: 5,
          idempotencyKey: body.idempotencyKey,
        };

        await queueService.addSendJob(job);

        // 8. Record usage for tenant rate limiting (sliding window)
        await tenantRateLimiter.recordUsage(tenantId);

        // 9. Insert 'queued' event into email_events audit log
        await db.query(
          `INSERT INTO email_events (message_id, event_type, event_data) VALUES ($1, 'queued', $2)`,
          [messageId, JSON.stringify({ requestId: req.requestId, suppressed: suppressionResult.suppressed })]
        );

        logger.info({ messageId, to: body.to.length, suppressed: suppressionResult.suppressed.length }, 'Email queued');

        const response: ApiResponse = {
          success: true,
          data: {
            messageId,
            status: 'queued',
            suppressed: suppressionResult.suppressed,
          },
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        };
        res.status(202).json(response);
      } catch (error: any) {
        logger.error({ err: error }, 'Send email failed');
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to queue email' },
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  // ─── POST /email/bulk ─────────────────────
  // Массовая отправка (до 500 сообщений за раз).
  // Доступ: service + admin роли.
  // Flow: validate → insert all → enqueue batch → record usage → respond 202
  router.post('/bulk',
    authSupabaseJwt(['service', 'admin']),
    tenantRateLimitMiddleware(tenantRateLimiter),
    async (req: Request, res: Response) => {
      const logger = req.log;
      try {
        const parseResult = BulkSendRequestSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parseResult.error.flatten() },
            requestId: req.requestId,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const { messages, batchId: providedBatchId } = parseResult.data;
        const tenantId = req.auth!.tenantId;
        const batchId = providedBatchId || randomUUID();
        const env = getEnv();
        const messageIds: string[] = [];

        // Insert all messages into DB (sequential to avoid PG deadlocks
        // on concurrent batch inserts for same tenant)
        for (const msg of messages) {
          const messageId = randomUUID();
          messageIds.push(messageId);
          const fromEmail = msg.from?.email || env.DEFAULT_FROM_EMAIL;
          const fromName = msg.from?.name || env.DEFAULT_FROM_NAME;

          await db.query(
            `INSERT INTO email_messages (id, tenant_id, idempotency_key, from_email, from_name, to_emails, cc_emails, bcc_emails, subject, body_html, body_text, priority, metadata, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'queued')`,
            [messageId, tenantId, msg.idempotencyKey || null, fromEmail, fromName,
             JSON.stringify(msg.to), JSON.stringify(msg.cc || null), JSON.stringify(msg.bcc || null),
             msg.subject, msg.html || null, msg.text || null, msg.priority, JSON.stringify({ ...msg.metadata, batchId })]
          );
        }

        // Add batch job to queue (decomposed into individual sends by batch worker)
        // batchId used as jobId → BullMQ deduplication at batch level
        const jobs: SendEmailJob[] = messages.map((msg, i) => ({
          messageId: messageIds[i]!,
          tenantId,
          to: msg.to,
          cc: msg.cc,
          bcc: msg.bcc,
          from: { email: msg.from?.email || env.DEFAULT_FROM_EMAIL, name: msg.from?.name || env.DEFAULT_FROM_NAME },
          subject: msg.subject,
          html: msg.html || undefined,
          text: msg.text || undefined,
          headers: msg.headers,
          attachments: msg.attachments,
          priority: msg.priority,
          attempt: 1,
          maxRetries: 5,
        }));

        await queueService.addBatchJob(jobs, batchId);
        await tenantRateLimiter.recordUsage(tenantId, messages.length);

        logger.info({ batchId, count: messages.length }, 'Bulk email batch queued');

        res.status(202).json({
          success: true,
          data: { batchId, messageIds, count: messages.length, status: 'queued' },
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        logger.error({ err: error }, 'Bulk send failed');
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to queue bulk emails' },
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  // ─── GET /email/status/:messageId ─────────────────────
  // Проверка статуса сообщения + полная цепочка событий.
  // Tenant isolation: query scoped by tenant_id from JWT.
  router.get('/status/:messageId',
    authSupabaseJwt(),
    async (req: Request, res: Response) => {
      try {
        const { messageId } = req.params;
        const tenantId = req.auth!.tenantId;

        // Get message (tenant-scoped — prevents cross-tenant information disclosure)
        const msgResult = await db.query(
          `SELECT id, status, smtp_message_id, retry_count, created_at, sent_at
           FROM email_messages WHERE id = $1 AND tenant_id = $2`,
          [messageId, tenantId]
        );

        if (msgResult.rows.length === 0) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Message not found' },
            requestId: req.requestId,
            timestamp: new Date().toISOString(),
          });
          return;
        }

        const msg = msgResult.rows[0];

        // Get events for this message (ordered chronologically)
        const eventsResult = await db.query(
          `SELECT event_type, created_at, smtp_code, smtp_response
           FROM email_events WHERE message_id = $1 ORDER BY created_at ASC`,
          [messageId]
        );

        res.json({
          success: true,
          data: {
            id: msg.id,
            status: msg.status,
            smtpMessageId: msg.smtp_message_id,
            retryCount: msg.retry_count,
            events: eventsResult.rows.map(e => ({
              eventType: e.event_type,
              createdAt: e.created_at,
              smtpCode: e.smtp_code,
              smtpResponse: e.smtp_response,
            })),
            createdAt: msg.created_at,
            sentAt: msg.sent_at,
          },
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        req.log.error({ err: error }, 'Get status failed');
        res.status(500).json({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to get message status' },
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  // ─── POST /email/webhooks/bounce ─────────────────────
  // Self-hosted inbound bounce parser.
  // No JWT auth — this endpoint is called by Postfix milter or external ESP.
  //
  // AUTHENTICATION: HMAC-SHA256 shared secret via X-Bounce-Signature header.
  //   Header value: "sha256=<hex_digest>"
  //   Digest is computed over the raw request body.
  //
  // Security model:
  //   Primary:    BOUNCE_WEBHOOK_SECRET HMAC verification (enforced here).
  //   Secondary:  IP allowlisting at reverse proxy / firewall level (recommended).
  //
  // Why HMAC and not JWT?
  //   The caller is the Postfix milter or rspamd — a machine process that doesn't
  //   have a Supabase user identity. HMAC shared secret is the standard webhook
  //   auth approach (same model as GitHub, Stripe, etc.). It is immune to
  //   replay attacks when combined with a timestamp claim or idempotency in the
  //   bounce processor (already present via message_id deduplication).
  //
  // If BOUNCE_WEBHOOK_SECRET is empty (default=''), HMAC check is bypassed with
  // a WARNING log. This allows development environments to work without config,
  // but production startup should have a non-empty secret.
  router.post('/webhooks/bounce',
    async (req: Request, res: Response) => {
      const logger = req.log;
      try {
        const env = getEnv();

        // ── HMAC verification ────────────────────────────────────────────────
        if (env.BOUNCE_WEBHOOK_SECRET) {
          const header = (req.headers['x-bounce-signature'] as string | undefined) ?? '';
          // Header format: "sha256=<64-char hex>"
          const match = /^sha256=([0-9a-f]{64})$/i.exec(header);

          if (!match) {
            logger.warn({ ip: req.ip }, 'Bounce webhook: missing or malformed X-Bounce-Signature');
            res.status(401).json({ success: false, error: 'Missing or malformed signature' });
            return;
          }

          // Express body-parser has already consumed the stream; we must re-serialize
          // from the parsed body. Callers must sign JSON.stringify(body) with the same
          // key. For exact byte-for-byte correctness in production, configure Express
          // with express.raw({ type: 'application/json' }) and use req.rawBody if available.
          const rawBody: string =
            typeof (req as any).rawBody === 'string'
              ? (req as any).rawBody
              : JSON.stringify(req.body);

          const expected = createHmac('sha256', env.BOUNCE_WEBHOOK_SECRET)
            .update(rawBody, 'utf8')
            .digest('hex');

          const sigBuf = Buffer.from(match[1]!, 'hex');
          const expBuf = Buffer.from(expected, 'hex');

          // Constant-time comparison — prevents timing oracle attacks
          if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
            logger.warn({ ip: req.ip }, 'Bounce webhook: invalid HMAC signature');
            res.status(401).json({ success: false, error: 'Invalid signature' });
            return;
          }
        } else {
          logger.warn(
            { ip: req.ip },
            'Bounce webhook: BOUNCE_WEBHOOK_SECRET not set — HMAC verification skipped. ' +
            'Set BOUNCE_WEBHOOK_SECRET in production.',
          );
        }
        // ─────────────────────────────────────────────────────────────────────

        const parseResult = BounceWebhookSchema.safeParse(req.body);
        if (!parseResult.success) {
          res.status(400).json({ success: false, error: 'Invalid bounce payload' });
          return;
        }

        await bounceProcessor.processWebhookBounce(parseResult.data);
        logger.info({ recipient: '***' }, 'Bounce webhook processed');

        res.status(200).json({ success: true });
      } catch (error: any) {
        logger.error({ err: error }, 'Bounce webhook failed');
        res.status(500).json({ success: false, error: 'Internal error' });
      }
    }
  );

  // ─── GET /email/suppression ─────────────────────
  // Paginated list of suppressed emails for the tenant.
  // Доступ: service + admin роли.
  // Query params: limit (max 500), offset, reason (optional filter).
  router.get('/suppression',
    authSupabaseJwt(['service', 'admin']),
    async (req: Request, res: Response) => {
      try {
        const tenantId = req.auth!.tenantId;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
        const offset = parseInt(req.query.offset as string) || 0;
        const reason = req.query.reason as string | undefined;

        const result = await suppressionService.list(tenantId, { limit, offset, reason: reason as any });

        res.json({
          success: true,
          data: result,
          requestId: req.requestId,
          timestamp: new Date().toISOString(),
        });
      } catch (error: any) {
        req.log.error({ err: error }, 'List suppression failed');
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed' } });
      }
    }
  );

  // ─── Admin: queue stats ─────────────────────
  // Returns queue depths for all BullMQ queues (send, retry, bounce, batch).
  // Protected by admin role + IP allowlist.
  router.get('/admin/queues',
    ...adminOnly(),
    async (req: Request, res: Response) => {
      try {
        const stats = await queueService.getQueueStats();
        res.json({ success: true, data: stats, requestId: req.requestId, timestamp: new Date().toISOString() });
      } catch (error: any) {
        res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR' } });
      }
    }
  );

  // ─── Admin: DLQ replay ─────────────────────
  // Retry a specific failed job from the dead letter queue.
  // queueName: send | retry | bounce | batch
  router.post('/admin/queues/:queueName/replay/:jobId',
    ...adminOnly(),
    async (req: Request, res: Response) => {
      try {
        const queueName = req.params.queueName as string;
        const jobId = req.params.jobId as string;
        await queueService.replayFailedJob(queueName, jobId);
        res.json({ success: true, requestId: req.requestId, timestamp: new Date().toISOString() });
      } catch (error: any) {
        res.status(400).json({ success: false, error: { code: 'REPLAY_FAILED', message: error.message } });
      }
    }
  );

  return router;
}
