import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RouterConfig } from "./config";
import type { DeliveryAttempt, DeviceToken, NotificationEvent, NotificationEventStatus } from "./contracts/events";

interface ClaimRow {
  event_id: string;
  type: "message" | "incoming_call" | "security";
  user_id: string;
  payload: Record<string, unknown>;
  priority: number;
  ttl_seconds: number;
  collapse_key: string | null;
  dedup_key: string | null;
  created_at: string;
  attempts: number;
  max_attempts: number;
}

interface DeviceTokenRow {
  user_id: string;
  device_id: string;
  platform: "ios" | "android" | "web";
  provider: "apns" | "fcm";
  token: string;
  is_valid: boolean;
  push_enabled: boolean;
  call_push_enabled: boolean;
  last_seen_at: string | null;
}

function rowToEvent(row: ClaimRow): NotificationEvent {
  const base = {
    eventId: row.event_id,
    userId: row.user_id,
    priority: row.priority,
    ttlSeconds: row.ttl_seconds,
    collapseKey: row.collapse_key ?? undefined,
    dedupKey: row.dedup_key ?? undefined,
    createdAtMs: Date.parse(row.created_at),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
  if (row.type === "incoming_call") {
    return { ...base, type: "incoming_call", payload: row.payload as NotificationEvent["payload"] };
  }
  if (row.type === "message") {
    return { ...base, type: "message", payload: row.payload as NotificationEvent["payload"] };
  }
  return { ...base, type: "security", payload: row.payload as NotificationEvent["payload"] };
}

function rowToDeviceToken(row: DeviceTokenRow): DeviceToken {
  return {
    userId: row.user_id,
    deviceId: row.device_id,
    platform: row.platform,
    provider: row.provider,
    token: row.token,
    isValid: row.is_valid,
    pushEnabled: row.push_enabled,
    callPushEnabled: row.call_push_enabled,
    lastSeenAtMs: row.last_seen_at ? Date.parse(row.last_seen_at) : undefined,
  };
}

export class NotificationDb {
  private readonly supabase: SupabaseClient;

  constructor(config: RouterConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async claimEvents(limit: number): Promise<NotificationEvent[]> {
    const { data, error } = await this.supabase.rpc("claim_notification_events", { p_limit: limit });
    if (error) {
      throw new Error(`[notification-router] claim_notification_events failed: ${error.message}`);
    }
    const rows = (data ?? []) as ClaimRow[];
    return rows.map(rowToEvent);
  }

  async getDeviceTokens(userId: string): Promise<DeviceToken[]> {
    const { data, error } = await this.supabase
      .from("device_tokens")
      .select("user_id,device_id,platform,provider,token,is_valid,push_enabled,call_push_enabled,last_seen_at")
      .eq("user_id", userId)
      .eq("is_valid", true);

    if (error) {
      throw new Error(`[notification-router] getDeviceTokens failed: ${error.message}`);
    }
    return ((data ?? []) as DeviceTokenRow[]).map(rowToDeviceToken);
  }

  async markTokenInvalid(provider: "apns" | "fcm", token: string): Promise<void> {
    const { error } = await this.supabase
      .from("device_tokens")
      .update({ is_valid: false, updated_at: new Date().toISOString() })
      .eq("provider", provider)
      .eq("token", token);
    if (error) {
      throw new Error(`[notification-router] markTokenInvalid failed: ${error.message}`);
    }
  }

  async insertDeliveries(attempts: DeliveryAttempt[]): Promise<void> {
    if (attempts.length === 0) return;
    const payload = attempts.map((a) => ({
      event_id: a.eventId,
      device_id: a.deviceId,
      provider: a.provider,
      status: a.status,
      attempts: a.attempt,
      provider_message_id: a.providerMessageId ?? null,
      error_code: a.errorCode ?? null,
      error_message: a.errorMessage ?? null,
    }));
    const { error } = await this.supabase.from("notification_deliveries").insert(payload);
    if (error) {
      throw new Error(`[notification-router] insertDeliveries failed: ${error.message}`);
    }
  }

  async finalizeEvent(
    eventId: string,
    status: NotificationEventStatus,
    lastError?: string,
    retryDelayMs?: number,
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      last_error: lastError ?? null,
    };
    if (status === "pending") {
      patch.available_at = new Date(Date.now() + Math.max(1000, retryDelayMs ?? 3000)).toISOString();
    } else if (status === "delivered" || status === "failed") {
      patch.processed_at = new Date().toISOString();
    }

    const { error } = await this.supabase.from("notification_events").update(patch).eq("event_id", eventId);
    if (error) {
      throw new Error(`[notification-router] finalizeEvent failed: ${error.message}`);
    }
  }
}
