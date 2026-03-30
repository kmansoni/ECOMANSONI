/**
 * Instagram-style two-tab notification model with grouping.
 *
 * Tabs:
 *   "you"       — activity directed at you: likes, comments, mentions,
 *                 follows, story reactions, DMs, system messages.
 *
 *   "following" — activity from people you follow: when they like/comment
 *                 on other posts, go live, etc.
 *                 Identified by `data.from_following === true` on the row,
 *                 or by type "live" (always from someone you follow).
 *
 * Grouping (Instagram-style):
 *   Notifications of the same type on the same object within a 24h window
 *   are collapsed into a single GroupedNotification:
 *     "Alice and 47 others liked your post"
 *
 * Legacy filter values ("all", "confirmed", "requests") are kept for
 * backward compatibility but map onto the new model.
 */

import { type Notification } from "@/hooks/useNotifications";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationFilterType =
  | "all"
  | "you"
  | "following"
  // legacy — kept for backward compat
  | "confirmed"
  | "requests";

export interface FeedGroupedNotification {
  /** Stable key for React rendering */
  key: string;
  /** Representative notification (most recent in the group) */
  representative: Notification;
  /** All notifications in this group (including representative) */
  members: Notification[];
  /** Total count of actors in this group */
  actorCount: number;
  /** Display names of up to 2 actors for the summary label */
  actorNames: string[];
  /** Whether this group has been read (all members read) */
  isRead: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Types that are always "directed at you" */
const YOU_TYPES = new Set<Notification["type"]>([
  "like",
  "comment",
  "follow",
  "mention",
  "story_reaction",
  "dm",
  "system",
]);

/** Types eligible for grouping (same type + same object within 24h) */
const GROUPABLE_TYPES = new Set<Notification["type"]>(["like", "comment", "follow"]);

/** Group window: notifications within this many ms are grouped together */
const GROUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFromFollowing(n: Notification): boolean {
  // Explicit flag set by the notification producer (server-side)
  if ((n.data as Record<string, unknown> | null)?.from_following === true) return true;
  // "live" notifications are always from someone you follow
  if (n.type === "live") return true;
  return false;
}

function getGroupKey(n: Notification): string | null {
  if (!GROUPABLE_TYPES.has(n.type)) return null;
  // Group by: type + target object (post_id, story_id, etc.)
  const objectId = (n.data as Record<string, unknown> | null)?.post_id
    ?? (n.data as Record<string, unknown> | null)?.story_id
    ?? (n.data as Record<string, unknown> | null)?.object_id
    ?? null;
  if (!objectId) return null;
  return `${n.type}:${String(objectId)}`;
}

function getActorName(n: Notification): string {
  return (n.data as Record<string, unknown> | null)?.actor_name as string
    ?? (n.data as Record<string, unknown> | null)?.username as string
    ?? "Кто-то";
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export function filterNotifications(
  notifications: Notification[],
  filter: NotificationFilterType,
): Notification[] {
  switch (filter) {
    case "all":
      return notifications;

    case "you":
      // Directed at the current user and NOT from-following activity
      return notifications.filter(
        (n) => YOU_TYPES.has(n.type) && !isFromFollowing(n),
      );

    case "following":
      return notifications.filter(isFromFollowing);

    // Legacy mappings
    case "requests":
      return notifications.filter((n) => n.type === "follow_request" as Notification["type"]);
    case "confirmed":
      return notifications.filter((n) => n.type !== ("follow_request" as Notification["type"]));

    default:
      return notifications;
  }
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Groups notifications Instagram-style:
 *   - Same type + same target object within GROUP_WINDOW_MS → one group
 *   - Non-groupable types → each becomes a single-member group
 *
 * Input must be sorted newest-first (as returned by useNotifications).
 * Output preserves newest-first order (by representative.created_at).
 */
export function groupNotifications(
  notifications: Notification[],
): FeedGroupedNotification[] {
  // Map from groupKey → accumulated group data
  const groupMap = new Map<string, {
    members: Notification[];
    oldestAt: number;
  }>();

  // Ungroupable notifications get a unique key per notification
  const ungroupable: Notification[] = [];

  for (const n of notifications) {
    const key = getGroupKey(n);
    if (!key) {
      ungroupable.push(n);
      continue;
    }

    const existing = groupMap.get(key);
    const createdMs = new Date(n.created_at).getTime();

    if (!existing) {
      groupMap.set(key, { members: [n], oldestAt: createdMs });
      continue;
    }

    // Only group if within the time window of the oldest member
    if (Math.abs(createdMs - existing.oldestAt) <= GROUP_WINDOW_MS) {
      existing.members.push(n);
      existing.oldestAt = Math.min(existing.oldestAt, createdMs);
    } else {
      // Outside window — start a new group with a disambiguated key
      groupMap.set(`${key}:${createdMs}`, { members: [n], oldestAt: createdMs });
    }
  }

  const result: FeedGroupedNotification[] = [];

  // Convert grouped notifications
  for (const [key, { members }] of groupMap) {
    // Sort members newest-first; representative = most recent
    const sorted = [...members].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const representative = sorted[0];
    const actorNames = sorted.slice(0, 2).map(getActorName);
    const isRead = sorted.every((m) => m.is_read);

    result.push({
      key,
      representative,
      members: sorted,
      actorCount: sorted.length,
      actorNames,
      isRead,
    });
  }

  // Convert ungroupable notifications (each is its own group)
  for (const n of ungroupable) {
    result.push({
      key: n.id,
      representative: n,
      members: [n],
      actorCount: 1,
      actorNames: [getActorName(n)],
      isRead: n.is_read,
    });
  }

  // Sort all groups by representative.created_at DESC
  result.sort(
    (a, b) =>
      new Date(b.representative.created_at).getTime() -
      new Date(a.representative.created_at).getTime(),
  );

  return result;
}

/**
 * Builds a human-readable summary for a grouped notification.
 *
 * Examples:
 *   actorCount=1:  "Alice лайкнула ваш пост"
 *   actorCount=2:  "Alice и Bob лайкнули ваш пост"
 *   actorCount=5:  "Alice и ещё 4 лайкнули ваш пост"
 */
export function buildGroupSummary(group: FeedGroupedNotification): string {
  const { actorCount, actorNames, representative } = group;

  const typeLabel: Record<string, string> = {
    like: "лайкнули ваш пост",
    comment: "прокомментировали ваш пост",
    follow: "подписались на вас",
    story_reaction: "отреагировали на вашу историю",
  };

  const action = typeLabel[representative.type] ?? "уведомили вас";

  if (actorCount === 1) {
    return `${actorNames[0]} ${action}`;
  }
  if (actorCount === 2) {
    return `${actorNames[0]} и ${actorNames[1]} ${action}`;
  }
  return `${actorNames[0]} и ещё ${actorCount - 1} ${action}`;
}
