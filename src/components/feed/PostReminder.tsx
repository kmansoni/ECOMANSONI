import { useState, useEffect } from "react";
import { Bell, BellOff, Check, Clock, Calendar, X } from "lucide-react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

interface PostReminderProps {
  postId: string;
}

interface ReminderData {
  id: string;
  remind_at: string;
}

// Быстрые пресеты
const QUICK_PRESETS = [
  { label: "Через 1 час", hours: 1 },
  { label: "Завтра", days: 1 },
  { label: "Через 3 дня", days: 3 },
  { label: "Через неделю", days: 7 },
];

function formatRemindTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffH = Math.round(diffMs / (1000 * 60 * 60));
  const diffD = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffH < 0) return "Просрочено";
  if (diffH < 1) return "Менее чем через час";
  if (diffH < 24) return `Через ${diffH} ч.`;
  if (diffD === 1) return "Завтра";
  if (diffD < 7) return `Через ${diffD} дн.`;

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PostReminder({ postId }: PostReminderProps) {
  const { user } = useAuth();
  const [reminder, setReminder] = useState<ReminderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState("20:00");

  useEffect(() => {
    if (!user) return;
    const loadReminder = async () => {
      const { data } = await dbLoose
        .from("post_reminders")
        .select("id, remind_at")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .single();
      setReminder(data);
    };
    void loadReminder();
  }, [postId, user]);

  const handleQuickPreset = async (hours?: number, days?: number) => {
    if (!user) return;
    setLoading(true);
    try {
      const target = new Date();
      if (hours) target.setHours(target.getHours() + hours);
      if (days) target.setDate(target.getDate() + days);
      target.setMinutes(0, 0, 0);

      const { error } = await dbLoose
        .from("post_reminders")
        .upsert({ post_id: postId, user_id: user.id, remind_at: target.toISOString() });

      if (error) throw error;
      const { data } = await dbLoose
        .from("post_reminders")
        .select("id, remind_at")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .single();
      setReminder(data);
      setOpen(false);
      toast.success("Напоминание установлено");
    } catch {
      toast.error("Не удалось установить напоминание");
    } finally {
      setLoading(false);
    }
  };

  const handleSetCustom = async () => {
    if (!user || !selectedDate) return;
    setLoading(true);
    try {
      const [hours, minutes] = selectedTime.split(":").map(Number);
      const target = new Date(selectedDate);
      target.setHours(hours, minutes, 0, 0);

      if (target.getTime() <= Date.now()) {
        toast.error("Выберите будущую дату и время");
        setLoading(false);
        return;
      }

      const { error } = await dbLoose
        .from("post_reminders")
        .upsert({ post_id: postId, user_id: user.id, remind_at: target.toISOString() });

      if (error) throw error;
      const { data } = await dbLoose
        .from("post_reminders")
        .select("id, remind_at")
        .eq("post_id", postId)
        .eq("user_id", user.id)
        .single();
      setReminder(data);
      setOpen(false);
      toast.success("Напоминание установлено");
    } catch {
      toast.error("Не удалось установить напоминание");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    setLoading(true);
    try {
      await dbLoose
        .from("post_reminders")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      setReminder(null);
      setOpen(false);
      toast.success("Напоминание удалено");
    } catch {
      toast.error("Не удалось удалить напоминание");
    } finally {
      setLoading(false);
    }
  };

  // Уже установлено — показываем статус
  if (reminder) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-primary hover:opacity-80 transition-opacity"
      >
        <Check className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">{formatRemindTime(reminder.remind_at)}</span>
        <span className="sm:hidden">Напоминание</span>
      </button>
    );
  }

  // Не авторизован — скрываем
  if (!user) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <Bell className="w-3.5 h-3.5" />
        <span>Напомнить</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <Bell className="w-5 h-5 text-primary" />
              Напомнить о публикации
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5">
            {/* Быстрые пресеты */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-3">Быстрый выбор</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PRESETS.map((preset) => (
                  <Button
                    key={preset.label}
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickPreset(preset.hours, preset.days)}
                    disabled={loading}
                    className="justify-start text-sm h-10"
                  >
                    <Clock className="w-4 h-4 mr-2 text-muted-foreground" />
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Разделитель */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">или выбрать дату</span>
              </div>
            </div>

            {/* Кастомная дата */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Выберите дату и время</p>

              <CalendarComponent
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => date < new Date()}
                className="rounded-lg border"
              />

              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <input
                  type="time"
                  value={selectedTime}
                  onChange={(e) => setSelectedTime(e.target.value)}
                  className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <Button
                className="w-full"
                onClick={handleSetCustom}
                disabled={loading || !selectedDate}
              >
                {loading ? "Сохраняю..." : "Установить напоминание"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}