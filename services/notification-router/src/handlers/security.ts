import type { NotificationEvent } from "../contracts/events";

export async function handleSecurityEvent(event: NotificationEvent): Promise<void> {
  // TODO: prioritize security notifications and strict dedup.
  void event;
}
