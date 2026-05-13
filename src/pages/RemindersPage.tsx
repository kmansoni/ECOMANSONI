import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, Calendar, Clock, Trash2, Image, ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePostReminders, type PostReminderItem } from "@/hooks/usePostReminders";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useThemeTokens } from "@/pages/auth/theme";
import { cn } from "@/lib/utils";

function formatRemindDate(isoString: string): { date: string; time: string; relative: string } {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  const diffD = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const dateStr = date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });

  const timeStr = date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  let relative = "Скоро";
  if (diffMs < 0) relative = "Просрочено";
  else if (diffH < 1) relative = "Менее чем через час";
  else if (diffH < 24) relative = `Через ${diffH} ч.`;
  else if (diffD === 1) relative = "Завтра";
  else if (diffD > 0 && diffD < 7) relative = `Через ${diffD} дн.`;
  else relative = dateStr;

  return { date: dateStr, time: timeStr, relative };
}

function ReminderCard({
  reminder,
  onDelete,
}: {
  reminder: PostReminderItem;
  onDelete: (id: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const { date, time, relative } = formatRemindDate(reminder.remind_at);
  const content = reminder.post?.content ?? "Контент недоступен";
  const shortContent = content.length > 80 ? content.slice(0, 77) + "..." : content;
  const authorName = reminder.post?.author?.display_name
    || reminder.post?.author?.username
    || "Автор";
  const avatarUrl = reminder.post?.author?.avatar_url ?? undefined;
  const thumbnailUrl = reminder.post?.media?.[0]?.media_url;
  const isPast = new Date(reminder.remind_at).getTime() < Date.now();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(reminder.post_id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={cn(
      "flex gap-3 p-4 rounded-xl border transition-colors",
      isPast ? "bg-muted/30 border-muted-foreground/20" : "bg-card border-border"
    )}>
      {/* Thumbnail */}
      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Image className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Avatar className="w-5 h-5">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="text-[10px]">{authorName.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground">{authorName}</span>
        </div>

        <p className="text-sm line-clamp-2 mb-2">{shortContent}</p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {date}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {time}
          </span>
        </div>

        <p className={cn(
          "text-xs mt-1 font-medium",
          isPast ? "text-destructive" : "text-primary"
        )}>
          {relative}
        </p>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="p-2 text-muted-foreground hover:text-destructive transition-colors self-start"
        title="Удалить напоминание"
      >
        {deleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <BellOff className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Нет напоминаний</h3>
      <p className="text-sm text-muted-foreground max-w-xs">
        Установите напоминание на любую публикацию — нажмите «Напомнить» под постом
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function RemindersPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { reminders, loading, error, deleteReminder } = usePostReminders();
  const tokens = useThemeTokens("dark");

  // Redirect if not logged in
  useState(() => {
    if (!user && !loading) {
      navigate("/auth");
    }
  });

  const handleDelete = useCallback(async (reminderId: string) => {
    try {
      await deleteReminder(reminderId);
      toast.success("Напоминание удалено");
    } catch {
      toast.error("Не удалось удалить напоминание");
    }
  }, [deleteReminder]);

  // Separate past and upcoming reminders
  const now = Date.now();
  const upcoming = reminders.filter(r => new Date(r.remind_at).getTime() >= now);
  const past = reminders.filter(r => new Date(r.remind_at).getTime() < now);

  return (
    <div className="min-h-screen pb-20" style={{ background: tokens.isDark ? "#0a0a0a" : "#f8fafc", color: tokens.textPrimary }}>
      {/* Header */}
      <div className="sticky top-0 z-10 backdrop-blur-xl border-b" style={{ background: tokens.isDark ? "rgba(10,10,10,0.9)" : "rgba(248,250,252,0.9)", borderColor: tokens.isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }}>
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Мои напоминания</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <div className="text-center py-8 text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => window.location.reload()}>
              Повторить
            </Button>
          </div>
        ) : reminders.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Предстоящие ({upcoming.length})
                </h2>
                <div className="space-y-3">
                  {upcoming.map((reminder) => (
                    <ReminderCard
                      key={reminder.post_id}
                      reminder={reminder}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Past */}
            {past.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <BellOff className="w-4 h-4" />
                  Прошедшие ({past.length})
                </h2>
                <div className="space-y-3">
                  {past.map((reminder) => (
                    <ReminderCard
                      key={reminder.post_id}
                      reminder={reminder}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
