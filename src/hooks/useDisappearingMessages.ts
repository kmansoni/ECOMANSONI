import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

export const AVAILABLE_TIMERS: (number | null)[] = [null, 30, 60, 300, 3600, 86400, 604800];

export function formatTimerLabel(seconds: number | null): string {
  if (seconds === null) return "Выкл";
  if (seconds < 60) return `${seconds} сек`;
  if (seconds < 3600) return `${seconds / 60} мин`;
  if (seconds < 86400) return `${seconds / 3600} ч`;
  return `${seconds / 86400} д`;
}

export function useDisappearingMessages(conversationId: string | null) {
  const [defaultTimer, setDefaultTimer] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    (supabase as any)
      .from("conversations")
      .select("default_disappear_timer")
      .eq("id", conversationId)
      .maybeSingle()
      .then(({ data }: { data: { default_disappear_timer: number | null } | null }) => {
        if (data) {
          setDefaultTimer(data.default_disappear_timer ?? null);
        }
        setLoading(false);
      });
  }, [conversationId]);

  const setConversationTimer = useCallback(
    async (seconds: number | null) => {
      if (!conversationId) return;
      const { error } = await (supabase as any)
        .from("conversations")
        .update({ default_disappear_timer: seconds })
        .eq("id", conversationId);
      if (error) {
        toast.error("Не удалось обновить таймер");
        return;
      }
      setDefaultTimer(seconds);
      toast.success(
        seconds === null
          ? "Автоудаление выключено"
          : `Таймер автоудаления: ${formatTimerLabel(seconds)}`
      );
    },
    [conversationId]
  );

  /**
   * Добавляет поля disappear_in_seconds и disappear_at к сообщению перед отправкой.
   * customTimer — переопределяет дефолтный таймер беседы.
   */
  const enrichMessageWithDisappear = useCallback(
    (extraFields: Record<string, unknown>, customTimer?: number | null): Record<string, unknown> => {
      const timer = customTimer !== undefined ? customTimer : defaultTimer;
      if (timer === null || timer === undefined) return extraFields;
      const disappearAt = new Date(Date.now() + timer * 1000).toISOString();
      return {
        ...extraFields,
        disappear_in_seconds: timer,
        disappear_at: disappearAt,
      };
    },
    [defaultTimer]
  );

  return {
    defaultTimer,
    loading,
    setConversationTimer,
    availableTimers: AVAILABLE_TIMERS,
    enrichMessageWithDisappear,
    formatTimerLabel,
  };
}
