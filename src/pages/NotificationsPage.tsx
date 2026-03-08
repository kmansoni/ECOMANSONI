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
import { filterNotifications, type NotificationFilterType } from "@/components/notifications/notificationFiltersModel";
import { initPushNotifications } from "@/lib/push/serviceWorker";

function groupNotifications(notifications: Notification[]) {
  const today: Notification[] = [];
  const week: Notification[] = [];
  const earlier: Notification[] = [];

  for (const n of notifications) {
    const date = parseISO(n.created_at);
    if (isToday(date)) {
      today.push(n);
    } else if (isThisWeek(date)) {
      week.push(n);
    } else {
      earlier.push(n);
    }
  }

  return { today, week, earlier };
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead, deleteNotification, loadMore, hasMore, refetch } = useNotifications();
  const [activeFilter, setActiveFilter] = useState<NotificationFilterType>("all");

  // Регистрация push-уведомлений
  useEffect(() => {
    void initPushNotifications(import.meta.env.VITE_VAPID_PUBLIC_KEY);
  }, []);

  // Pull-to-refresh
  const startY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 80) refetch();
  };

  const filteredNotifications = filterNotifications(notifications, activeFilter);
  const groups = groupNotifications(filteredNotifications);

  const renderSection = (title: string, items: Notification[]) => {
    if (!items.length) return null;
    return (
      <div key={title} className="mb-4">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider px-4 py-2">
          {title}
        </p>
        <AnimatePresence>
          {items.map((n) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{ duration: 0.2 }}
            >
              <NotificationItem
                notification={n}
                onMarkAsRead={markAsRead}
                onDelete={deleteNotification}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  };

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
          >
            <Settings className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Фильтры */}
      <NotificationFilters
        active={activeFilter}
        onChange={setActiveFilter}
        notifications={notifications}
      />

      {/* Content */}
      <div className="pb-6">
        {loading ? (
          <div className="px-4 space-y-4 pt-4">
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
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 pt-20 text-white/40">
            <RefreshCw className="w-12 h-12" />
            <p className="text-base font-medium">Нет уведомлений</p>
            <p className="text-sm">Мы сообщим, когда что-то произойдёт</p>
          </div>
        ) : (
          <>
            {renderSection("Сегодня", groups.today)}
            {renderSection("На этой неделе", groups.week)}
            {renderSection("Ранее", groups.earlier)}

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
