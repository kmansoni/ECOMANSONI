import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config.js";
import type { EmailOutboxRecord, EmailTemplateRecord } from "./types.js";

interface DeliveryAttemptLog {
  outboxId: string;
  provider: string;
  status: "sent" | "failed";
  responseCode?: string;
  messageId?: string;
  errorMessage?: string;
}

export interface EnqueueEmailInput {
  toEmail: string;
  fromEmail?: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  templateKey?: string;
  templateVars?: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export class EmailDb {
  private readonly supabase: SupabaseClient;
  private readonly postgrestUrl?: string;
  private readonly apiKey: string;

  constructor(config: AppConfig) {
    this.postgrestUrl = config.postgrestUrl;
    this.apiKey = config.supabaseServiceRoleKey;
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  private isPostgrestMode(): boolean {
    return Boolean(this.postgrestUrl);
  }

  private postgrestHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      apikey: this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private buildUrl(path: string, query?: string): string {
    const base = (this.postgrestUrl ?? "").replace(/\/+$/, "");
    return `${base}${path}${query ? `?${query}` : ""}`;
  }

  private async postgrestFetch<T>(
    path: string,
    init: RequestInit,
    query?: string,
    allow404 = false,
  ): Promise<T> {
    const response = await fetch(this.buildUrl(path, query), {
      ...init,
      headers: {
        ...this.postgrestHeaders(),
        ...(init.headers ?? {}),
      },
    });

    if (allow404 && response.status === 404) {
      return null as T;
    }

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`postgrest ${response.status}: ${raw}`);
    }

    if (response.status === 204) {
      return null as T;
    }

    const raw = await response.text();
    if (!raw || raw.trim().length === 0) {
      return null as T;
    }

    return JSON.parse(raw) as T;
  }

  async enqueue(input: EnqueueEmailInput): Promise<EmailOutboxRecord> {
    const payload = {
      to_email: input.toEmail,
      from_email: input.fromEmail ?? null,
      subject: input.subject ?? null,
      html_body: input.htmlBody ?? null,
      text_body: input.textBody ?? null,
      template_key: input.templateKey ?? null,
      template_vars: input.templateVars ?? {},
      idempotency_key: input.idempotencyKey ?? null,
      max_attempts: input.maxAttempts ?? 5,
    };

    if (this.isPostgrestMode()) {
      try {
        const inserted = await this.postgrestFetch<EmailOutboxRecord[]>(
          "/email_outbox",
          {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { Prefer: "return=representation" },
          },
        );
        return inserted[0];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (input.idempotencyKey && (message.includes("23505") || message.includes("duplicate"))) {
          const existing = await this.postgrestFetch<EmailOutboxRecord[]>(
            "/email_outbox",
            { method: "GET" },
            `idempotency_key=eq.${encodeURIComponent(input.idempotencyKey)}&select=*`,
          );
          if (existing[0]) {
            return existing[0];
          }
        }
        throw new Error(`enqueue failed: ${message}`);
      }
    }

    const { data, error } = await this.supabase.from("email_outbox").insert(payload).select("*").single();

    if (error) {
      if (input.idempotencyKey && error.code === "23505") {
        const existing = await this.supabase
          .from("email_outbox")
          .select("*")
          .eq("idempotency_key", input.idempotencyKey)
          .maybeSingle();

        if (existing.error) {
          throw new Error(`enqueue idempotency lookup failed: ${existing.error.message}`);
        }

        if (existing.data) {
          return existing.data as EmailOutboxRecord;
        }
      }

      throw new Error(`enqueue failed: ${error.message}`);
    }

    return data as EmailOutboxRecord;
  }

  async claimBatch(limit: number, lockSeconds: number): Promise<EmailOutboxRecord[]> {
    if (this.isPostgrestMode()) {
      const data = await this.postgrestFetch<EmailOutboxRecord[]>("/rpc/claim_email_outbox_batch", {
        method: "POST",
        body: JSON.stringify({ p_limit: limit, p_lock_seconds: lockSeconds }),
      });

      return data ?? [];
    }

    const { data, error } = await this.supabase.rpc("claim_email_outbox_batch", {
      p_limit: limit,
      p_lock_seconds: lockSeconds,
    });

    if (error) {
      throw new Error(`claim batch failed: ${error.message}`);
    }

    return (data ?? []) as EmailOutboxRecord[];
  }

  async getTemplate(templateKey: string): Promise<EmailTemplateRecord | null> {
    if (this.isPostgrestMode()) {
      const rows = await this.postgrestFetch<EmailTemplateRecord[]>(
        "/email_templates",
        { method: "GET" },
        `key=eq.${encodeURIComponent(templateKey)}&is_active=eq.true&select=key,subject_template,html_template,text_template,is_active`,
      );

      return rows[0] ?? null;
    }

    const { data, error } = await this.supabase
      .from("email_templates")
      .select("key,subject_template,html_template,text_template,is_active")
      .eq("key", templateKey)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      throw new Error(`template fetch failed: ${error.message}`);
    }

    return (data as EmailTemplateRecord | null) ?? null;
  }

  async markSent(row: EmailOutboxRecord, provider: string, messageId: string): Promise<void> {
    if (this.isPostgrestMode()) {
      await this.postgrestFetch<null>(
        "/email_outbox",
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "sent",
            provider,
            provider_message_id: messageId,
            last_error: null,
            processing_started_at: null,
            locked_until: null,
          }),
        },
        `id=eq.${encodeURIComponent(row.id)}`,
      );

      await this.logAttempt({
        outboxId: row.id,
        provider,
        status: "sent",
        messageId,
      });

      return;
    }

    const { error } = await this.supabase
      .from("email_outbox")
      .update({
        status: "sent",
        provider,
        provider_message_id: messageId,
        last_error: null,
        processing_started_at: null,
        locked_until: null,
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`mark sent failed: ${error.message}`);
    }

    await this.logAttempt({
      outboxId: row.id,
      provider,
      status: "sent",
      messageId,
    });
  }

  async markFailed(
    row: EmailOutboxRecord,
    provider: string,
    errorMessage: string,
    retryDelaySeconds: number,
  ): Promise<void> {
    const nextAttemptAt = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();
    const attemptCount = row.attempt_count + 1;
    const terminal = attemptCount >= row.max_attempts;

    if (this.isPostgrestMode()) {
      await this.postgrestFetch<null>(
        "/email_outbox",
        {
          method: "PATCH",
          body: JSON.stringify({
            status: terminal ? "failed" : "pending",
            attempt_count: attemptCount,
            last_error: errorMessage,
            next_attempt_at: terminal ? new Date().toISOString() : nextAttemptAt,
            processing_started_at: null,
            locked_until: null,
          }),
        },
        `id=eq.${encodeURIComponent(row.id)}`,
      );

      await this.logAttempt({
        outboxId: row.id,
        provider,
        status: "failed",
        errorMessage,
      });

      return;
    }

    const { error } = await this.supabase
      .from("email_outbox")
      .update({
        status: terminal ? "failed" : "pending",
        attempt_count: attemptCount,
        last_error: errorMessage,
        next_attempt_at: terminal ? new Date().toISOString() : nextAttemptAt,
        processing_started_at: null,
        locked_until: null,
      })
      .eq("id", row.id);

    if (error) {
      throw new Error(`mark failed failed: ${error.message}`);
    }

    await this.logAttempt({
      outboxId: row.id,
      provider,
      status: "failed",
      errorMessage,
    });
  }

  private async logAttempt(input: DeliveryAttemptLog): Promise<void> {
    if (this.isPostgrestMode()) {
      await this.postgrestFetch<null>(
        "/email_deliveries",
        {
          method: "POST",
          body: JSON.stringify({
            outbox_id: input.outboxId,
            provider: input.provider,
            status: input.status,
            provider_response_code: input.responseCode ?? null,
            provider_message_id: input.messageId ?? null,
            error_message: input.errorMessage ?? null,
          }),
        },
      );
      return;
    }

    const { error } = await this.supabase.from("email_deliveries").insert({
      outbox_id: input.outboxId,
      provider: input.provider,
      status: input.status,
      provider_response_code: input.responseCode ?? null,
      provider_message_id: input.messageId ?? null,
      error_message: input.errorMessage ?? null,
    });

    if (error) {
      throw new Error(`delivery log failed: ${error.message}`);
    }
  }
}
