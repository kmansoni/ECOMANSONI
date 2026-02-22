import type { NotificationEvent } from "../contracts/events";

export function computeDedupKey(event: NotificationEvent, deviceId: string): string {
  if (event.dedupKey) return `${event.dedupKey}:${deviceId}`;

  if (event.type === "incoming_call") {
    const callId = String((event.payload.callId ?? "").toString());
    return `${callId}:${deviceId}`;
  }

  if (event.type === "message") {
    const messageId = String((event.payload.messageId ?? event.eventId).toString());
    return `${messageId}:${deviceId}`;
  }

  return `${event.eventId}:${deviceId}`;
}
