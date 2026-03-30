import { useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PostReminderProps {
  postId: string;
}

export function PostReminder({ postId }: PostReminderProps) {
  const { user } = useAuth();
  const [isSet, setIsSet] = useState(false);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSet = async () => {
    if (!user || !date || !time) return;
    setLoading(true);
    try {
      const remindAt = new Date(`${date}T${time}`).toISOString();
      const { error } = await dbLoose
        .from("post_reminders")
        .upsert({ post_id: postId, user_id: user.id, remind_at: remindAt });
      if (error) throw error;
      setIsSet(true);
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
    await dbLoose
      .from("post_reminders")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id);
    setIsSet(false);
    toast.success("Напоминание удалено");
  };

  if (isSet) {
    return (
      <button
        onClick={handleRemove}
        className="flex items-center gap-1 text-xs text-primary"
      >
        <Check className="w-3.5 h-3.5" />
        <span>Напоминание</span>
      </button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
          <Bell className="w-3.5 h-3.5" />
          <span>Напомнить</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-3" align="end">
        <p className="text-sm font-medium">Установить напоминание</p>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full text-sm border rounded px-2 py-1 bg-background"
        />
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="w-full text-sm border rounded px-2 py-1 bg-background"
        />
        <Button
          size="sm"
          className="w-full"
          onClick={handleSet}
          disabled={loading || !date || !time}
        >
          {loading ? "Сохраняю..." : "Установить"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
