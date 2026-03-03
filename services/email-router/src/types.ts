export type ProviderKind = "smtp" | "sendmail";
export type InboxFolder = "inbox" | "spam" | "trash";
export type OutboxFolder = "sent" | "draft" | "trash";

export interface EmailOutboxRecord {
  id: string;
  to_email: string;
  from_email: string | null;
  folder: OutboxFolder;
  is_starred: boolean;
  cc_email?: string[];
  bcc_email?: string[];
  subject: string | null;
  html_body: string | null;
  text_body: string | null;
  reply_to_message_id?: string | null;
  thread_id?: string | null;
  template_key: string | null;
  template_vars: Record<string, unknown> | null;
  status: "pending" | "processing" | "sent" | "failed" | "draft";
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailTemplateRecord {
  key: string;
  subject_template: string;
  html_template: string | null;
  text_template: string | null;
  is_active: boolean;
}

export interface EmailInboxRecord {
  id: string;
  message_id: string;
  in_reply_to_message_id: string | null;
  from_email: string;
  to_email: string;
  subject: string | null;
  html_body: string | null;
  text_body: string | null;
  headers: Record<string, unknown>;
  provider: string | null;
  thread_id: string | null;
  folder: InboxFolder;
  is_starred: boolean;
  is_read: boolean;
  read_at: string | null;
  received_at: string;
  created_at: string;
}

export interface EmailThreadRecord {
  id: string;
  mailbox_email: string;
  subject_normalized: string | null;
  last_message_at: string;
  created_at: string;
  updated_at: string;
}

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  replyToMessageId?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
