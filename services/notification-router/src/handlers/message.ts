import type { NotificationEvent } from "../contracts/events";
import type { MessagePushPayload } from "../contracts/payloads";

export async function handleMessageEvent(event: NotificationEvent): Promise<void> {
  if (event.type !== "message") return;

  const p = event.payload as MessagePushPayload;

  if (p.v !== 1) throw new Error(`unsupported payload version: ${p.v}`);
  if (!p.messageId) throw new Error("missing messageId");
  if (!p.chatId) throw new Error("missing chatId");
  if (!p.senderId) throw new Error("missing senderId");

  // Обрезка превью для push (iOS: 256 символов body, Android: 1KB total)
  if (p.preview?.body && p.preview.body.length > 200) {
    p.preview.body = p.preview.body.slice(0, 197) + "...";
  }
}
