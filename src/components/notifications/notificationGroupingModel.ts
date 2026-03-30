import { type Notification } from "@/hooks/useNotifications";

export interface TargetGroupedNotification {
  key: string; // type:target_id
  type: string;
  target_id: string | null;
  notifications: Notification[];
  actors: string[];
  latestAt: string;
  isRead: boolean;
}

export function groupNotificationsByTypeAndTarget(
  notifications: Notification[],
): TargetGroupedNotification[] {
  const map = new Map<string, TargetGroupedNotification>();

  for (const n of notifications) {
    const key = `${n.type}:${n.target_id ?? "none"}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        type: n.type,
        target_id: n.target_id ?? null,
        notifications: [],
        actors: [],
        latestAt: n.created_at,
        isRead: true,
      });
    }

    const group = map.get(key)!;
    group.notifications.push(n);
    if (!n.is_read) group.isRead = false;
    if (group.latestAt < n.created_at) group.latestAt = n.created_at;

    const dataActorName = typeof n.data?.actor_name === 'string' ? n.data.actor_name : undefined;
    const actorName = dataActorName || n.actor?.display_name || n.actor?.username;
    if (actorName && !group.actors.includes(actorName)) {
      group.actors.push(actorName);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.latestAt.localeCompare(a.latestAt));
}
