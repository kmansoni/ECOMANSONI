// types/index.ts — Shared type definitions and zod schemas
//
// All Zod validation schemas, inferred TypeScript types,
// queue job interfaces, and API response envelope.

import { z } from 'zod';

// ─── Email recipient ─────────────────────
export const RecipientSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().max(255).optional(),
});
export type Recipient = z.infer<typeof RecipientSchema>;

// ─── Attachment ─────────────────────
export const AttachmentSchema = z.object({
  filename: z.string().max(255),
  content: z.string(), // base64 encoded
  contentType: z.string().max(127).default('application/octet-stream'),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

// ─── Send email request ─────────────────────
export const SendEmailRequestSchema = z
  .object({
    to: z.array(RecipientSchema).min(1).max(50),
    cc: z.array(RecipientSchema).max(50).optional(),
    bcc: z.array(RecipientSchema).max(50).optional(),
    from: z
      .object({
        email: z.string().email().max(320).optional(),
        name: z.string().max(255).optional(),
      })
      .optional(),
    subject: z.string().min(1).max(998), // RFC 2822 limit
    html: z.string().max(5_000_000).optional(), // 5MB max
    text: z.string().max(1_000_000).optional(),
    templateId: z.string().uuid().optional(),
    templateSlug: z.string().max(100).optional(),
    templateData: z.record(z.unknown()).optional(),
    locale: z.string().max(10).default('ru'),
    headers: z.record(z.string()).optional(),
    attachments: z.array(AttachmentSchema).max(10).optional(),
    priority: z.number().int().min(1).max(5).default(3),
    idempotencyKey: z.string().max(255).optional(),
    metadata: z.record(z.unknown()).optional(),
    scheduledAt: z.string().datetime().optional(),
    tags: z.array(z.string().max(50)).max(10).optional(),
  })
  .refine((data) => data.html || data.text || data.templateId || data.templateSlug, {
    message: 'Either html, text, templateId, or templateSlug must be provided',
  });
export type SendEmailRequest = z.infer<typeof SendEmailRequestSchema>;

// ─── Bulk send request ─────────────────────
export const BulkSendRequestSchema = z.object({
  messages: z.array(SendEmailRequestSchema).min(1).max(500),
  batchId: z.string().uuid().optional(),
});
export type BulkSendRequest = z.infer<typeof BulkSendRequestSchema>;

// ─── Email status response ─────────────────────
export const EmailStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['queued', 'processing', 'sent', 'delivered', 'bounced', 'failed', 'rejected']),
  smtpMessageId: z.string().nullable(),
  retryCount: z.number(),
  events: z.array(
    z.object({
      eventType: z.string(),
      createdAt: z.string(),
      smtpCode: z.number().nullable(),
      smtpResponse: z.string().nullable(),
    }),
  ),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
});
export type EmailStatus = z.infer<typeof EmailStatusSchema>;

// ─── Bounce webhook payload ─────────────────────
export const BounceWebhookSchema = z.object({
  messageId: z.string().optional(),
  smtpMessageId: z.string().optional(),
  bounceType: z.enum(['hard', 'soft', 'undetermined']),
  recipient: z.string().email(),
  smtpCode: z.number().optional(),
  smtpEnhancedCode: z.string().optional(),
  diagnosticCode: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});
export type BounceWebhook = z.infer<typeof BounceWebhookSchema>;

// ─── API response envelope ─────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId: string;
  timestamp: string;
}

// ─── Queue job types ─────────────────────
export interface SendEmailJob {
  messageId: string;
  tenantId: string;
  to: Recipient[];
  cc?: Recipient[];
  bcc?: Recipient[];
  from: { email: string; name: string };
  subject: string;
  html?: string;
  text?: string;
  headers?: Record<string, string>;
  attachments?: Attachment[];
  priority: number;
  attempt: number;
  maxRetries: number;
  idempotencyKey?: string;
}

export interface BounceProcessJob {
  rawEmail?: string;
  bounceType: string;
  recipient: string;
  smtpCode?: number;
  smtpMessageId?: string;
  diagnosticCode?: string;
}

// ─── Metrics ─────────────────────
export const EMAIL_STATUSES = [
  'queued',
  'processing',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'rejected',
] as const;
export const EVENT_TYPES = [
  'queued',
  'processing',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'unsubscribed',
  'failed',
  'rejected',
  'deferred',
] as const;
