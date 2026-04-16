/**
 * NotificationGrouping — группировка уведомлений по типу + target_id
 * "user1, user2 и ещё 3 понравилась ваша публикация"
 */
import React from "react";
import { type TargetGroupedNotification } from "./notificationGroupingModel";

function getActionText(type: string): string {
  switch (type) {
    case "like": return "понравилась ваша публикация";
    case "like_reel": return "понравилось ваше видео";
    case "comment": return "прокомментировал(а) вашу публикацию";
    case "follow": return "подписался(ась) на вас";
    case "follow_request": return "отправил(а) запрос на подписку";
    case "mention": return "упомянул(а) вас";
    case "tag": return "отметил(а) вас на фото";
    default: return "взаимодействовал(а) с вашим контентом";
  }
}

interface Props {
  group: TargetGroupedNotification;
}

export function GroupedNotificationItem({ group }: Props) {
  const { actors, notifications, type, isRead } = group;
  const count = notifications.length;

  let actorText = "";
  if (actors.length === 0) {
    actorText = `${count} пользователей`;
  } else if (actors.length === 1) {
    actorText = actors[0];
  } else if (actors.length === 2) {
    actorText = `${actors[0]} и ${actors[1]}`;
  } else {
    actorText = `${actors[0]}, ${actors[1]} и ещё ${count - 2}`;
  }

  return (
    <div className={`px-4 py-3 flex items-start gap-3 ${isRead ? "" : "bg-white/5"}`}>
      {/* Аватары */}
      <div className="relative flex-shrink-0 w-10 h-10">
        {notifications.slice(0, 2).map((n, i) => {
          const avatar = (n as any).actor?.avatar_url;
          return (
            <div
              key={n.id}
              className="absolute w-7 h-7 rounded-full bg-zinc-700 border-2 border-black overflow-hidden"
              style={{ left: i * 8, top: i * 8 }}
            >
              {avatar && <img loading="lazy" src={avatar} alt="" className="w-full h-full object-cover" />}
            </div>
          );
        })}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">
          <span className="font-semibold">{actorText}</span>
          {" "}{getActionText(type)}
          {count > 1 && actors.length > 0 && (
            <span className="text-white/60"> ({count})</span>
          )}
        </p>
      </div>

      {!isRead && (
        <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 mt-1" />
      )}
    </div>
  );
}
