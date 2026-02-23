import type { DeviceToken, NotificationEvent } from "../contracts/events";

export function selectAudience(event: NotificationEvent, devices: DeviceToken[]): DeviceToken[] {
  const enabled = devices.filter((d) => d.isValid && d.pushEnabled);

  if (event.type !== "incoming_call") {
    return enabled;
  }

  const callEnabled = enabled.filter((d) => d.callPushEnabled);
  const sorted = [...callEnabled].sort((a, b) => (b.lastSeenAtMs ?? 0) - (a.lastSeenAtMs ?? 0));

  // Primary active device + fallback fanout to reduce missed incoming calls.
  return sorted.slice(0, 3);
}
