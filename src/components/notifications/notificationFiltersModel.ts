import { type Notification } from "@/hooks/useNotifications";

export type NotificationFilterType = "all" | "confirmed" | "requests";

export function filterNotifications(
  notifications: Notification[],
  filter: NotificationFilterType,
): Notification[] {
  if (filter === "all") return notifications;
  if (filter === "requests") return notifications.filter((n) => (n as any).type === "follow_request");
  if (filter === "confirmed") return notifications.filter((n) => (n as any).type !== "follow_request");
  return notifications;
}
