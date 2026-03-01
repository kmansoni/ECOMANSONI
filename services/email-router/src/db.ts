import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "./config.js";
import type { EmailInboxRecord, EmailOutboxRecord, EmailTemplateRecord, EmailThreadRecord } from "./types.js";

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
  ccEmails?: string[];
  bccEmails?: string[];
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  replyToMessageId?: string;
  threadId?: string;
  templateKey?: string;
  templateVars?: Record<string, unknown>;
  idempotencyKey?: string;
  maxAttempts?: number;
}

export interface IngestInboundEmailInput {
  messageId: string;
  fromEmail: string;
  toEmail: string;
  subject?: string;
  htmlBody?: string;
  textBody?: string;
  inReplyToMessageId?: string;
  provider?: string;
  headers?: Record<string, unknown>;
  receivedAt?: string;
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

  private normalizeSubject(subject?: string | null): string | null {
    if (!subject) return null;
    return subject
      .trim()
      .replace(/^((re|fw|fwd)\s*:\s*)+/i, "")
      .toLowerCase()
      .slice(0, 250);
  }

  private async findThreadByReply(mailboxEmail: string, inReplyToMessageId?: string): Promise<string | null> {
    if (!inReplyToMessageId) return null;

    if (this.isPostgrestMode()) {
      const inboxMatch = await this.postgrestFetch<Array<{ thread_id: string | null }>>(
        "/email_inbox",
        { method: "GET" },
        `to_email=eq.${encodeURIComponent(mailboxEmail)}&message_id=eq.${encodeURIComponent(inReplyToMessageId)}&select=thread_id&limit=1`,
      );
      if (inboxMatch[0]?.thread_id) return inboxMatch[0].thread_id;

      const outboxMatch = await this.postgrestFetch<Array<{ thread_id: string | null }>>(
        "/email_outbox",
        { method: "GET" },
        `to_email=eq.${encodeURIComponent(mailboxEmail)}&provider_message_id=eq.${encodeURIComponent(inReplyToMessageId)}&select=thread_id&limit=1`,
      );
      if (outboxMatch[0]?.thread_id) return outboxMatch[0].thread_id;
      return null;
    }

    const inboxMatch = await this.supabase
      .from("email_inbox")
      .select("thread_id")
      .eq("to_email", mailboxEmail)
      .eq("message_id", inReplyToMessageId)
      .maybeSingle();

    if (inboxMatch.error) throw new Error(`find thread by inbox reply failed: ${inboxMatch.error.message}`);
    if (inboxMatch.data?.thread_id) return inboxMatch.data.thread_id as string;

    const outboxMatch = await this.supabase
      .from("email_outbox")
      .select("thread_id")
      .eq("to_email", mailboxEmail)
      .eq("provider_message_id", inReplyToMessageId)
      .maybeSingle();

    if (outboxMatch.error) throw new Error(`find thread by outbox reply failed: ${outboxMatch.error.message}`);
    if (outboxMatch.data?.thread_id) return outboxMatch.data.thread_id as string;

    return null;
  }

  private async ensureThread(mailboxEmail: string, subject?: string | null): Promise<EmailThreadRecord> {
    const normalized = this.normalizeSubject(subject);

    if (this.isPostgrestMode()) {
      if (normalized) {
        const existing = await this.postgrestFetch<EmailThreadRecord[]>(
          "/email_threads",
          { method: "GET" },
          `mailbox_email=eq.${encodeURIComponent(mailboxEmail)}&subject_normalized=eq.${encodeURIComponent(normalized)}&select=*&order=last_message_at.desc&limit=1`,
        );
        if (existing[0]) return existing[0];
      }

      const inserted = await this.postgrestFetch<EmailThreadRecord[]>(
        "/email_threads",
        {
          method: "POST",
          body: JSON.stringify({
            mailbox_email: mailboxEmail,
            subject_normalized: normalized,
            last_message_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=representation" },
        },
      );

      return inserted[0];
    }

    if (normalized) {
      const existing = await this.supabase
        .from("email_threads")
        .select("*")
        .eq("mailbox_email", mailboxEmail)
        .eq("subject_normalized", normalized)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing.error) throw new Error(`ensure thread lookup failed: ${existing.error.message}`);
      if (existing.data) return existing.data as EmailThreadRecord;
    }

    const created = await this.supabase
      .from("email_threads")
      .insert({
        mailbox_email: mailboxEmail,
        subject_normalized: normalized,
        last_message_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (created.error) throw new Error(`ensure thread create failed: ${created.error.message}`);
    return created.data as EmailThreadRecord;
  }

  private async touchThread(threadId: string, atIso?: string): Promise<void> {
    const ts = atIso ?? new Date().toISOString();

    if (this.isPostgrestMode()) {
      await this.postgrestFetch<null>(
        "/email_threads",
        { method: "PATCH", body: JSON.stringify({ last_message_at: ts }) },
        `id=eq.${encodeURIComponent(threadId)}`,
      );
      return;
    }

    const { error } = await this.supabase
      .from("email_threads")
      .update({ last_message_at: ts })
      .eq("id", threadId);

    if (error) {
      throw new Error(`touch thread failed: ${error.message}`);
    }
  }

  async enqueue(input: EnqueueEmailInput): Promise<EmailOutboxRecord> {
    const resolvedThreadId =
      input.threadId ??
      (await this.findThreadByReply(input.toEmail, input.replyToMessageId)) ??
      (await this.ensureThread(input.toEmail, input.subject)).id;

    const payload = {
      to_email: input.toEmail,
      from_email: input.fromEmail ?? null,
      cc_email: input.ccEmails ?? [],
      bcc_email: input.bccEmails ?? [],
      subject: input.subject ?? null,
      html_body: input.htmlBody ?? null,
      text_body: input.textBody ?? null,
      reply_to_message_id: input.replyToMessageId ?? null,
      thread_id: resolvedThreadId,
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
        await this.touchThread(resolvedThreadId);
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
            await this.touchThread(resolvedThreadId);
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
          await this.touchThread(resolvedThreadId);
          return existing.data as EmailOutboxRecord;
        }
      }

      throw new Error(`enqueue failed: ${error.message}`);
    }

    await this.touchThread(resolvedThreadId);
    return data as EmailOutboxRecord;
  }

  async ingestInbound(input: IngestInboundEmailInput): Promise<EmailInboxRecord> {
    const resolvedThreadId =
      (await this.findThreadByReply(input.toEmail, input.inReplyToMessageId)) ??
      (await this.ensureThread(input.toEmail, input.subject)).id;

    const payload = {
      message_id: input.messageId,
      in_reply_to_message_id: input.inReplyToMessageId ?? null,
      from_email: input.fromEmail,
      to_email: input.toEmail,
      subject: input.subject ?? null,
      html_body: input.htmlBody ?? null,
      text_body: input.textBody ?? null,
      headers: input.headers ?? {},
      provider: input.provider ?? null,
      thread_id: resolvedThreadId,
      received_at: input.receivedAt ?? new Date().toISOString(),
    };

    if (this.isPostgrestMode()) {
      try {
        const inserted = await this.postgrestFetch<EmailInboxRecord[]>(
          "/email_inbox",
          {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { Prefer: "return=representation" },
          },
        );
        await this.touchThread(resolvedThreadId, payload.received_at);
        return inserted[0];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("23505") || message.includes("duplicate")) {
          const existing = await this.postgrestFetch<EmailInboxRecord[]>(
            "/email_inbox",
            { method: "GET" },
            `message_id=eq.${encodeURIComponent(input.messageId)}&to_email=eq.${encodeURIComponent(input.toEmail)}&select=*`,
          );
          if (existing[0]) {
            await this.touchThread(resolvedThreadId, payload.received_at);
            return existing[0];
          }
        }
        throw new Error(`ingest inbound failed: ${message}`);
      }
    }

    const { data, error } = await this.supabase.from("email_inbox").insert(payload).select("*").single();
    if (error) {
      if (error.code === "23505") {
        const existing = await this.supabase
          .from("email_inbox")
          .select("*")
          .eq("message_id", input.messageId)
          .eq("to_email", input.toEmail)
          .maybeSingle();

        if (existing.error) {
          throw new Error(`inbound duplicate lookup failed: ${existing.error.message}`);
        }

        if (existing.data) {
          await this.touchThread(resolvedThreadId, payload.received_at);
          return existing.data as EmailInboxRecord;
        }
      }
      throw new Error(`ingest inbound failed: ${error.message}`);
    }

    await this.touchThread(resolvedThreadId, payload.received_at);
    return data as EmailInboxRecord;
  }

  async listInbox(toEmail: string, limit: number, unreadOnly = false): Promise<EmailInboxRecord[]> {
    const safeLimit = Math.max(1, Math.min(200, limit));

    if (this.isPostgrestMode()) {
      const unreadQuery = unreadOnly ? "&is_read=eq.false" : "";
      const rows = await this.postgrestFetch<EmailInboxRecord[]>(
        "/email_inbox",
        { method: "GET" },
        `to_email=eq.${encodeURIComponent(toEmail)}${unreadQuery}&select=*&order=received_at.desc&limit=${safeLimit}`,
      );

      return rows ?? [];
    }

    const query = this.supabase
      .from("email_inbox")
      .select("*")
      .eq("to_email", toEmail)
      .order("received_at", { ascending: false })
      .limit(safeLimit);

    const { data, error } = unreadOnly ? await query.eq("is_read", false) : await query;

    if (error) {
      throw new Error(`list inbox failed: ${error.message}`);
    }

    return (data ?? []) as EmailInboxRecord[];
  }

  async getInboxItemById(id: string): Promise<EmailInboxRecord | null> {
    if (this.isPostgrestMode()) {
      const rows = await this.postgrestFetch<EmailInboxRecord[]>(
        "/email_inbox",
        { method: "GET" },
        `id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
      );
      return rows[0] ?? null;
    }

    const { data, error } = await this.supabase.from("email_inbox").select("*").eq("id", id).maybeSingle();
    if (error) {
      throw new Error(`get inbox item failed: ${error.message}`);
    }

    return (data as EmailInboxRecord | null) ?? null;
  }

  async markInboxRead(id: string, read: boolean): Promise<void> {
    const patch = {
      is_read: read,
      read_at: read ? new Date().toISOString() : null,
    };

    if (this.isPostgrestMode()) {
      await this.postgrestFetch<null>(
        "/email_inbox",
        { method: "PATCH", body: JSON.stringify(patch) },
        `id=eq.${encodeURIComponent(id)}`,
      );
      return;
    }

    const { error } = await this.supabase.from("email_inbox").update(patch).eq("id", id);
    if (error) {
      throw new Error(`mark inbox read failed: ${error.message}`);
    }
  }

  async listThreads(mailboxEmail: string, limit: number, unreadOnly = false): Promise<EmailThreadRecord[]> {
    const safeLimit = Math.max(1, Math.min(200, limit));

    if (this.isPostgrestMode()) {
      const queryBase = `mailbox_email=eq.${encodeURIComponent(mailboxEmail)}&select=*&order=last_message_at.desc&limit=${safeLimit}`;
      if (!unreadOnly) {
        return (await this.postgrestFetch<EmailThreadRecord[]>("/email_threads", { method: "GET" }, queryBase)) ?? [];
      }

      const unreadItems = await this.postgrestFetch<Array<{ thread_id: string }>>(
        "/email_inbox",
        { method: "GET" },
        `to_email=eq.${encodeURIComponent(mailboxEmail)}&is_read=eq.false&thread_id=not.is.null&select=thread_id`,
      );
      const threadIds = [...new Set(unreadItems.map((x) => x.thread_id).filter(Boolean))];
      if (threadIds.length === 0) return [];
      const inIds = threadIds.map((x) => `"${x}"`).join(",");
      return (
        (await this.postgrestFetch<EmailThreadRecord[]>(
          "/email_threads",
          { method: "GET" },
          `${queryBase}&id=in.(${encodeURIComponent(inIds)})`,
        )) ?? []
      );
    }

    let query = this.supabase
      .from("email_threads")
      .select("*")
      .eq("mailbox_email", mailboxEmail)
      .order("last_message_at", { ascending: false })
      .limit(safeLimit);

    if (unreadOnly) {
      const unread = await this.supabase
        .from("email_inbox")
        .select("thread_id")
        .eq("to_email", mailboxEmail)
        .eq("is_read", false)
        .not("thread_id", "is", null);
      if (unread.error) {
        throw new Error(`list unread threads failed: ${unread.error.message}`);
      }
      const ids = [...new Set((unread.data ?? []).map((x) => x.thread_id).filter(Boolean))] as string[];
      if (ids.length === 0) return [];
      query = query.in("id", ids);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`list threads failed: ${error.message}`);
    }

    return (data ?? []) as EmailThreadRecord[];
  }

  async listThreadMessages(threadId: string, limit: number): Promise<{ inbox: EmailInboxRecord[]; outbox: EmailOutboxRecord[] }> {
    const safeLimit = Math.max(1, Math.min(500, limit));

    if (this.isPostgrestMode()) {
      const [inbox, outbox] = await Promise.all([
        this.postgrestFetch<EmailInboxRecord[]>(
          "/email_inbox",
          { method: "GET" },
          `thread_id=eq.${encodeURIComponent(threadId)}&select=*&order=received_at.asc&limit=${safeLimit}`,
        ),
        this.postgrestFetch<EmailOutboxRecord[]>(
          "/email_outbox",
          { method: "GET" },
          `thread_id=eq.${encodeURIComponent(threadId)}&select=*&order=created_at.asc&limit=${safeLimit}`,
        ),
      ]);

      return { inbox: inbox ?? [], outbox: outbox ?? [] };
    }

    const [inboxRes, outboxRes] = await Promise.all([
      this.supabase
        .from("email_inbox")
        .select("*")
        .eq("thread_id", threadId)
        .order("received_at", { ascending: true })
        .limit(safeLimit),
      this.supabase
        .from("email_outbox")
        .select("*")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true })
        .limit(safeLimit),
    ]);

    if (inboxRes.error) {
      throw new Error(`list thread inbox failed: ${inboxRes.error.message}`);
    }
    if (outboxRes.error) {
      throw new Error(`list thread outbox failed: ${outboxRes.error.message}`);
    }

    return {
      inbox: (inboxRes.data ?? []) as EmailInboxRecord[],
      outbox: (outboxRes.data ?? []) as EmailOutboxRecord[],
    };
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
