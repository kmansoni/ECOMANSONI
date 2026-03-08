/**
 * NotificationFilters — фильтры в NotificationsPage
 * Все / Подтверждённые / Запросы на подписку
 */
import React from "react";
import { cn } from "@/lib/utils";
import { type Notification } from "@/hooks/useNotifications";
import { type NotificationFilterType } from "./notificationFiltersModel";

interface Props {
  active: NotificationFilterType;
  onChange: (filter: NotificationFilterType) => void;
  notifications: Notification[];
}

const TABS: { id: NotificationFilterType; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "confirmed", label: "Подтверждённые" },
  { id: "requests", label: "Запросы" },
];

export function NotificationFilters({ active, onChange, notifications }: Props) {
  const requestCount = notifications.filter((n) => (n as any).type === "follow_request" && !n.is_read).length;
  const unreadCount = notifications.filter((n) => !n.is_read && (n as any).type !== "follow_request").length;

  const getBadge = (id: NotificationFilterType): number => {
    if (id === "all") return notifications.filter((n) => !n.is_read).length;
    if (id === "requests") return requestCount;
    if (id === "confirmed") return unreadCount;
    return 0;
  };

  return (
    <div className="flex border-b border-white/10">
      {TABS.map(({ id, label }) => {
        const badge = getBadge(id);
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              "flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 relative transition-colors",
              active === id ? "text-white" : "text-white/50 hover:text-white/80",
            )}
          >
            {label}
            {badge > 0 && (
              <span className={cn(
                "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                active === id ? "bg-primary text-white" : "bg-white/20 text-white/80",
              )}>
                {badge > 99 ? "99+" : badge}
              </span>
            )}
            {active === id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
