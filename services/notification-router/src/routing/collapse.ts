import type { NotificationEvent } from "../contracts/events";

export function computeCollapseKey(event: NotificationEvent): string | undefined {
  if (event.collapseKey) return event.collapseKey;

  if (event.type === "incoming_call") {
    const callId = String((event.payload.callId ?? "").toString());
    return callId || undefined;
  }

  if (event.type === "message") {
    const chatId = String((event.payload.chatId ?? "").toString());
    return chatId || undefined;
  }

  return undefined;
}
