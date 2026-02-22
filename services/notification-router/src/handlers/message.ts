import type { NotificationEvent } from "../contracts/events";

export async function handleMessageEvent(event: NotificationEvent): Promise<void> {
  // TODO: validate payload shape, apply per-chat mute/quiet-hours and fanout.
  void event;
}
