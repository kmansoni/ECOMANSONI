/**
 * NotificationFilters — Instagram-style two-tab layout.
 *
 * "Ты"        — activity directed at you (likes, comments, follows, mentions…)
 * "Подписки"  — activity from people you follow (their likes, live, etc.)
 *
 * The active tab indicator slides between tabs with a CSS transition,
 * matching Instagram's exact visual behaviour.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { type Notification } from "@/hooks/useNotifications";
import { type NotificationFilterType, filterNotifications } from "./notificationFiltersModel";

interface Props {
  active: NotificationFilterType;
  onChange: (filter: NotificationFilterType) => void;
  notifications: Notification[];
}

const TABS: { id: NotificationFilterType; label: string }[] = [
  { id: "you", label: "Ты" },
  { id: "following", label: "Подписки" },
];

export function NotificationFilters({ active, onChange, notifications }: Props) {
  const getUnread = (id: NotificationFilterType): number =>
    filterNotifications(notifications, id).filter((n) => !n.is_read).length;

  // Normalise legacy filter values to the new two-tab model
  const normalisedActive: NotificationFilterType =
    active === "you" || active === "following" ? active : "you";

  return (
    <div className="flex border-b border-white/10 relative">
      {TABS.map(({ id, label }) => {
        const badge = getUnread(id);
        const isActive = normalisedActive === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={cn(
              "flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 relative transition-colors",
              isActive ? "text-white" : "text-white/50 hover:text-white/80",
            )}
          >
            {label}
            {badge > 0 && (
              <span className={cn(
                "inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                isActive ? "bg-primary text-white" : "bg-white/20 text-white/80",
              )}>
                {badge > 99 ? "99+" : badge}
              </span>
            )}
            {/* Active indicator — bottom border */}
            {isActive && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
