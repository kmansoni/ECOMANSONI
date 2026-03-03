import { motion, PanInfo, useMotionValue, useTransform, animate } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Trash2, Heart, MessageCircle, UserPlus, AtSign, Radio, Mail, Bell } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Notification } from "@/hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  like: <Heart className="w-4 h-4 text-red-500 fill-red-500" />,
  comment: <MessageCircle className="w-4 h-4 text-blue-400" />,
  follow: <UserPlus className="w-4 h-4 text-green-400" />,
  mention: <AtSign className="w-4 h-4 text-purple-400" />,
  story_reaction: <Heart className="w-4 h-4 text-pink-400 fill-pink-400" />,
  live: <Radio className="w-4 h-4 text-red-500" />,
  dm: <Mail className="w-4 h-4 text-blue-400" />,
  system: <Bell className="w-4 h-4 text-yellow-400" />,
};

export function NotificationItem({ notification, onMarkAsRead, onDelete }: NotificationItemProps) {
  const navigate = useNavigate();
  const x = useMotionValue(0);
  const background = useTransform(x, [-80, 0], ["rgb(239 68 68)", "rgb(0 0 0 / 0)"]);
  const iconOpacity = useTransform(x, [-80, -20], [1, 0]);

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -60) {
      animate(x, -400, { duration: 0.2 }).then(() => onDelete(notification.id));
    } else {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  };

  const handleTap = () => {
    if (!notification.is_read) onMarkAsRead(notification.id);
    // Navigate based on target
    if (notification.target_type === "post" && notification.target_id) {
      navigate(`/post/${notification.target_id}`);
    } else if (notification.target_type === "profile" && notification.actor_id) {
      navigate(`/user/${notification.actor_id}`);
    } else if (notification.type === "dm") {
      navigate("/chats");
    } else if (notification.type === "follow" && notification.actor_id) {
      navigate(`/user/${notification.actor_id}`);
    }
  };

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
    locale: ru,
  });

  const icon = TYPE_ICONS[notification.type] || TYPE_ICONS.system;

  return (
    <div className="relative overflow-hidden">
      {/* Delete background */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end pr-4 rounded-xl"
        style={{ background }}
      >
        <motion.div style={{ opacity: iconOpacity }}>
          <Trash2 className="w-5 h-5 text-white" />
        </motion.div>
      </motion.div>

      <motion.div
        drag="x"
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        style={{ x }}
        onDragEnd={handleDragEnd}
        onClick={handleTap}
        className={cn(
          "relative flex items-center gap-3 px-4 py-3 cursor-pointer",
          "active:bg-white/5 transition-colors",
          !notification.is_read && "bg-white/5"
        )}
      >
        {/* Avatar with icon overlay */}
        <div className="relative flex-shrink-0">
          <Avatar className="w-11 h-11">
            <AvatarImage src={notification.actor?.avatar_url || undefined} />
            <AvatarFallback className="bg-zinc-700 text-white text-sm">
              {notification.actor?.display_name?.charAt(0)?.toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-0.5 -right-0.5 bg-zinc-900 rounded-full p-0.5">
            {icon}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm text-white leading-snug",
            !notification.is_read ? "font-semibold" : "font-normal"
          )}>
            {notification.body}
          </p>
          <p className="text-xs text-white/50 mt-0.5">{timeAgo}</p>
        </div>

        {/* Unread dot */}
        {!notification.is_read && (
          <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
        )}

        {/* Follow back button */}
        {notification.type === "follow" && (
          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0 h-8 text-xs border-white/20 text-white hover:bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              if (notification.actor_id) navigate(`/user/${notification.actor_id}`);
            }}
          >
            Подписаться
          </Button>
        )}
      </motion.div>
    </div>
  );
}
