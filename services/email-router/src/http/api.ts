import express, { type Request, type Response } from "express";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { EmailDb } from "../db.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sendPayloadSchema = z
  .object({
    to: z.union([z.string().email(), z.array(z.string().email()).min(1)]),
    subject: z.string().min(1).max(250).optional(),
    html: z.string().max(200_000).optional(),
    text: z.string().max(200_000).optional(),
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
      if (config.ingestKey && req.header("x-ingest-key") !== config.ingestKey) {
        return res.status(401).json({ ok: false, error: "unauthorized" });
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
            subject: payload.subject,
            htmlBody: payload.html,
            textBody: payload.text,
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

  return app;
}
