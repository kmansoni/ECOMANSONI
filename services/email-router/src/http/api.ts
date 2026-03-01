import express, { type Request, type Response } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { EmailDb } from "../db.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendPayloadSchema = z
  .object({
    to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
    cc: z.array(z.string().email()).max(100).optional(),
    bcc: z.array(z.string().email()).max(100).optional(),
    subject: z.string().min(1).max(250).optional(),
    html: z.string().max(200_000).optional(),
    text: z.string().max(200_000).optional(),
    replyToMessageId: z.string().max(512).optional(),
    threadId: z.string().uuid().optional(),
    templateKey: z.string().min(1).max(120).optional(),
    templateVars: z.record(z.unknown()).optional(),
    idempotencyKey: z.string().min(1).max(160).optional(),
    maxAttempts: z.number().int().positive().max(20).optional(),
    from: z.string().email().optional(),
  })
  .superRefine((payload, ctx) => {
    const hasBody = Boolean(payload.subject || payload.html || payload.text);
    const hasTemplate = Boolean(payload.templateKey);

    if (!hasBody && !hasTemplate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either direct content (subject/html/text) or templateKey must be provided",
      });
    }
  });

const inboundPayloadSchema = z.object({
  messageId: z.string().min(3).max(512),
  from: z.string().email(),
  to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
  subject: z.string().max(998).optional(),
  html: z.string().max(1_000_000).optional(),
  text: z.string().max(1_000_000).optional(),
  inReplyToMessageId: z.string().max(512).optional(),
  provider: z.string().max(80).optional(),
  headers: z.record(z.unknown()).optional(),
  receivedAt: z.string().datetime({ offset: true }).optional(),
});

const inboxQuerySchema = z.object({
  to: z.string().email(),
  limit: z.coerce.number().int().positive().max(200).default(50),
  unreadOnly: z
    .union([z.literal("1"), z.literal("0"), z.literal("true"), z.literal("false")])
    .optional(),
});

const threadMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(200),
});

const markReadBodySchema = z.object({
  read: z.boolean().default(true),
});

const replyBodySchema = z.object({
  from: z.string().email().optional(),
  subject: z.string().min(1).max(250).optional(),
  html: z.string().max(200_000).optional(),
  text: z.string().max(200_000).optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
  maxAttempts: z.number().int().positive().max(20).optional(),
  to: z.string().email().optional(),
  cc: z.array(z.string().email()).max(100).optional(),
  bcc: z.array(z.string().email()).max(100).optional(),
});

function ensureIngestKey(config: AppConfig, req: Request, res: Response): boolean {
  if (config.ingestKey && req.header("x-ingest-key") !== config.ingestKey) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return false;
  }
  return true;
}

export function createApi(config: AppConfig, db: EmailDb) {
  const app = express();
  app.use(express.json({ limit: "256kb" }));

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      service: "email-router",
      provider: config.provider,
      ts: new Date().toISOString(),
    });
  });

  app.post("/v1/email/send", async (req: Request, res: Response) => {
    try {
      if (!ensureIngestKey(config, req, res)) {
        return;
      }

      const payload = sendPayloadSchema.parse(req.body);
      const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

      const invalidRecipient = recipients.find((to) => !emailRegex.test(to));
      if (invalidRecipient) {
        return res.status(400).json({ ok: false, error: `invalid email: ${invalidRecipient}` });
      }

      const queued = await Promise.all(
        recipients.map((toEmail, index) => {
          const idempotencyKey = payload.idempotencyKey
            ? `${payload.idempotencyKey}:${toEmail}:${index}`
            : undefined;

          return db.enqueue({
            toEmail,
            fromEmail: payload.from,
            ccEmails: payload.cc,
            bccEmails: payload.bcc,
            subject: payload.subject,
            htmlBody: payload.html,
            textBody: payload.text,
            replyToMessageId: payload.replyToMessageId,
            threadId: payload.threadId,
            templateKey: payload.templateKey,
            templateVars: payload.templateVars,
            idempotencyKey,
            maxAttempts: payload.maxAttempts,
          });
        }),
      );

      return res.status(202).json({
        ok: true,
        queued: queued.length,
        ids: queued.map((row) => row.id),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ ok: false, error: error.issues.map((i) => i.message).join("; ") });
      }

      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  app.post("/v1/email/inbound", async (req: Request, res: Response) => {
    try {
      if (!ensureIngestKey(config, req, res)) {
        return;
      }

      const payload = inboundPayloadSchema.parse(req.body);
      const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

      const ingested = await Promise.all(
        recipients.map((toEmail) =>
          db.ingestInbound({
            messageId: payload.messageId,
            fromEmail: payload.from,
            toEmail,
            subject: payload.subject,
            htmlBody: payload.html,
            textBody: payload.text,
            inReplyToMessageId: payload.inReplyToMessageId,
            provider: payload.provider,
            headers: payload.headers,
            receivedAt: payload.receivedAt,
          }),
        ),
      );

      return res.status(202).json({
        ok: true,
        ingested: ingested.length,
        ids: ingested.map((x) => x.id),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ ok: false, error: error.issues.map((i) => i.message).join("; ") });
      }

      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  app.get("/v1/email/inbox", async (req: Request, res: Response) => {
    try {
      if (!ensureIngestKey(config, req, res)) {
        return;
      }

      const query = inboxQuerySchema.parse(req.query);
      const unreadOnly = query.unreadOnly === "1" || query.unreadOnly === "true";
      const rows = await db.listInbox(query.to, query.limit, unreadOnly);

      return res.status(200).json({ ok: true, items: rows, count: rows.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ ok: false, error: error.issues.map((i) => i.message).join("; ") });
      }

      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  app.get("/v1/email/threads", async (req: Request, res: Response) => {
    try {
      if (!ensureIngestKey(config, req, res)) {
        return;
      }

      const query = inboxQuerySchema.parse(req.query);
      const unreadOnly = query.unreadOnly === "1" || query.unreadOnly === "true";
      const rows = await db.listThreads(query.to, query.limit, unreadOnly);

      return res.status(200).json({ ok: true, items: rows, count: rows.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ ok: false, error: error.issues.map((i) => i.message).join("; ") });
      }

      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  app.get("/v1/email/threads/:threadId/messages", async (req: Request, res: Response) => {
    try {
      if (!ensureIngestKey(config, req, res)) {
        return;
      }

      const { threadId } = req.params;
      const query = threadMessagesQuerySchema.parse(req.query);
      const rows = await db.listThreadMessages(threadId, query.limit);

      return res.status(200).json({
        ok: true,
        threadId,
        inbox: rows.inbox,
        outbox: rows.outbox,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ ok: false, error: error.issues.map((i) => i.message).join("; ") });
      }

      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  app.post("/v1/email/inbox/:id/read", async (req: Request, res: Response) => {
    try {
      if (!ensureIngestKey(config, req, res)) {
        return;
      }

      const { id } = req.params;
      const payload = markReadBodySchema.parse(req.body ?? {});
      await db.markInboxRead(id, payload.read);
      return res.status(200).json({ ok: true, id, read: payload.read });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ ok: false, error: error.issues.map((i) => i.message).join("; ") });
      }

      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  app.post("/v1/email/threads/:threadId/reply", async (req: Request, res: Response) => {
    try {
      if (!ensureIngestKey(config, req, res)) {
        return;
      }

      const { threadId } = req.params;
      const payload = replyBodySchema.parse(req.body ?? {});

      if (!payload.html && !payload.text) {
        return res.status(400).json({ ok: false, error: "Either html or text is required" });
      }

      const latestInbound = (await db.listThreadMessages(threadId, 1)).inbox.at(-1);
      if (!latestInbound && !payload.to) {
        return res.status(400).json({ ok: false, error: "Reply target not found. Provide 'to' explicitly." });
      }

      const toEmail = payload.to ?? latestInbound!.from_email;
      const queued = await db.enqueue({
        toEmail,
        fromEmail: payload.from,
        ccEmails: payload.cc,
        bccEmails: payload.bcc,
        subject: payload.subject ?? latestInbound?.subject ?? "(no subject)",
        htmlBody: payload.html,
        textBody: payload.text,
        threadId,
        replyToMessageId: latestInbound?.message_id,
        idempotencyKey: payload.idempotencyKey,
        maxAttempts: payload.maxAttempts,
      });

      return res.status(202).json({ ok: true, queuedId: queued.id, threadId });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ ok: false, error: error.issues.map((i) => i.message).join("; ") });
      }

      return res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  });

  return app;
}
