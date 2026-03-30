import { useEffect, useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/notifications/NotificationItem";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isToday, isThisWeek, parseISO } from "date-fns";
import { NotificationFilters } from "@/components/notifications/NotificationFilters";
import {
  filterNotifications,
  groupNotifications,
  buildGroupSummary,
  type NotificationFilterType,
  type FeedGroupedNotification,
} from "@/components/notifications/notificationFiltersModel";
import { initPushNotifications } from "@/lib/push/serviceWorker";

// ---------------------------------------------------------------------------
// Time-based section grouping
// ---------------------------------------------------------------------------

interface NotificationSections {
  today: FeedGroupedNotification[];
  week: FeedGroupedNotification[];
  earlier: FeedGroupedNotification[];
}

function sectionGroups(groups: FeedGroupedNotification[]): NotificationSections {
  const today: FeedGroupedNotification[] = [];
  const week: FeedGroupedNotification[] = [];
  const earlier: FeedGroupedNotification[] = [];

  for (const g of groups) {
    const date = parseISO(g.representative.created_at);
    if (isToday(date)) {
      today.push(g);
    } else if (isThisWeek(date)) {
      week.push(g);
    } else {
      earlier.push(g);
    }
  }

  return { today, week, earlier };
}

// ---------------------------------------------------------------------------
// GroupedNotificationItem — renders a single grouped row
// ---------------------------------------------------------------------------

interface GroupedItemProps {
  group: FeedGroupedNotification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

function GroupedNotificationItem({ group, onMarkAsRead, onDelete }: GroupedItemProps) {
  const { representative, actorCount, members } = group;

  // For multi-actor groups, override the notification body with the summary
  const displayNotification: Notification =
    actorCount > 1
      ? {
          ...representative,
          // Override body with grouped summary
          body: buildGroupSummary(group),
        }
      : representative;

  return (
    <NotificationItem
      notification={displayNotification}
      onMarkAsRead={() => {
        // Mark all members as read
        members.forEach((m) => {
          if (!m.is_read) onMarkAsRead(m.id);
        });
      }}
      onDelete={() => onDelete(representative.id)}
    />
  );
}

// ---------------------------------------------------------------------------
// Section renderer
// ---------------------------------------------------------------------------

function renderSection(
  title: string,
  groups: FeedGroupedNotification[],
  onMarkAsRead: (id: string) => void,
  onDelete: (id: string) => void,
) {
  if (groups.length === 0) return null;
  return (
    <div key={title} className="mb-4">
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wider px-4 py-2">
        {title}
      </p>
      <AnimatePresence>
        {groups.map((g) => (
          <motion.div
            key={g.key}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.2 }}
          >
            <GroupedNotificationItem
              group={g}
              onMarkAsRead={onMarkAsRead}
              onDelete={onDelete}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function NotificationsPage() {
  const navigate = useNavigate();
  const {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    loadMore,
    hasMore,
    refetch,
  } = useNotifications();

  // Default to "you" tab — matches Instagram's default behaviour
  const [activeFilter, setActiveFilter] = useState<NotificationFilterType>("you");

  // Register push notifications on mount
  useEffect(() => {
    void initPushNotifications(import.meta.env.VITE_VAPID_PUBLIC_KEY);
  }, []);

  // Pull-to-refresh via touch gesture
  const startY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 80) void refetch();
  }, [refetch]);

  // Filter → group → section
  const filtered = filterNotifications(notifications, activeFilter);
  const grouped = groupNotifications(filtered);
  const sections = sectionGroups(grouped);

  const isEmpty = !loading && grouped.length === 0;

  return (
    <div
      className="min-h-screen bg-black text-white"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">Уведомления</h1>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-white/70 hover:text-white"
              onClick={markAllAsRead}
            >
              Прочитать все
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-9 h-9 text-white/70"
            onClick={() => navigate("/notifications/settings")}
            aria-label="Настройки уведомлений"
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <NotificationFilters
        active={activeFilter}
        onChange={setActiveFilter}
        notifications={notifications}
      />

      {/* Content */}
      <div className="pb-6">
        {loading ? (
          <div className="px-4 space-y-4 pt-4" aria-label="Загрузка уведомлений">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-11 h-11 rounded-full bg-white/10" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-3/4 bg-white/10" />
                  <Skeleton className="h-3 w-1/3 bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-3 pt-20 text-white/40">
            <RefreshCw className="w-12 h-12" aria-hidden="true" />
            <p className="text-base font-medium">Нет уведомлений</p>
            <p className="text-sm">Мы сообщим, когда что-то произойдёт</p>
          </div>
        ) : (
          <>
            {renderSection("Сегодня", sections.today, markAsRead, deleteNotification)}
            {renderSection("На этой неделе", sections.week, markAsRead, deleteNotification)}
            {renderSection("Ранее", sections.earlier, markAsRead, deleteNotification)}

            {hasMore && (
              <div className="flex justify-center pt-4 pb-8">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/60 hover:text-white"
                  onClick={loadMore}
                >
                  Загрузить ещё
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default NotificationsPage;
