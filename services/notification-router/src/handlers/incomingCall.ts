import type { NotificationEvent } from "../contracts/events";

export async function handleIncomingCallEvent(event: NotificationEvent): Promise<void> {
  // TODO: enforce 25-40s TTL, active-device preference and fallback fanout.
  void event;
}
