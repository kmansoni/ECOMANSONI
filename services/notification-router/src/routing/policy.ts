import type { NotificationEvent } from "../contracts/events";

export function mapQueueName(event: NotificationEvent): "notif:high" | "notif:normal" | "notif:low" {
  if (event.type === "incoming_call" || event.type === "security") {
    return "notif:high";
  }
  if (event.type === "message") {
    return "notif:normal";
  }
  return "notif:low";
}

export function isExpired(event: NotificationEvent, nowMs = Date.now()): boolean {
  return event.createdAtMs + event.ttlSeconds * 1000 < nowMs;
}

export function computeRetryDelayMs(attempt: number): number {
  const base = Math.min(30_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * 400);
  return base + jitter;
}
