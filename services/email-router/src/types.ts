export type ProviderKind = "stub" | "smtp" | "sendmail";

export interface EmailOutboxRecord {
  id: string;
  to_email: string;
  from_email: string | null;
  subject: string | null;
  html_body: string | null;
  text_body: string | null;
  template_key: string | null;
  template_vars: Record<string, unknown> | null;
  status: "pending" | "processing" | "sent" | "failed";
  attempt_count: number;
  max_attempts: number;
  idempotency_key: string | null;
}

export interface EmailTemplateRecord {
  key: string;
  subject_template: string;
  html_template: string | null;
  text_template: string | null;
  is_active: boolean;
}

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendEmailResult {
  messageId: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}
