/**
 * DraftPostsList — список черновиков постов.
 *
 * Функциональность:
 * - Карточки с превью контента
 * - Дата последнего редактирования
 * - Кнопки: Редактировать, Опубликовать, Запланировать, Удалить
 * - Scheduled badge
 */
import { useState, useCallback } from "react";
import {
  FileText,
  Pencil,
  Send,
  Clock,
  Trash2,
  Calendar,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useDraftPosts } from "@/hooks/useDraftPosts";
import type { DraftPost } from "@/hooks/useDraftPosts";
import { toast } from "sonner";

interface DraftPostsListProps {
  onEdit?: (draft: DraftPost) => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DraftPostsList({ onEdit }: DraftPostsListProps) {
  const { drafts, publishDraft, scheduleDraft, deleteDraft, loading } = useDraftPosts();
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const handlePublish = useCallback(
    async (id: string) => {
      setActionInProgress(id);
      await publishDraft(id);
      setActionInProgress(null);
    },
    [publishDraft],
  );

  const handleSchedule = useCallback(
    async (id: string) => {
      if (!scheduleDate) {
        toast.error("Выберите дату публикации");
        return;
      }
      setActionInProgress(id);
      await scheduleDraft(id, new Date(scheduleDate).toISOString());
      setSchedulingId(null);
      setScheduleDate("");
      setActionInProgress(null);
    },
    [scheduleDraft, scheduleDate],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setActionInProgress(id);
      await deleteDraft(id);
      setActionInProgress(null);
    },
    [deleteDraft],
  );

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-12 text-center text-muted-foreground">
        <FileText className="w-12 h-12 opacity-50" />
        <p>Нет черновиков</p>
        <p className="text-xs">Создайте пост и сохраните как черновик</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {drafts.map((draft) => (
        <div
          key={draft.id}
          className="rounded-xl border dark:border-gray-800 bg-card p-4"
        >
          <div className="flex items-start gap-3">
            <FileText className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm line-clamp-2">
                {draft.content || "Пустой черновик"}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {formatDate(draft.created_at)}
                </span>
                {draft.scheduled_at && (
                  <Badge variant="outline" className="text-xs">
                    <Calendar className="w-3 h-3 mr-1" />
                    {formatDate(draft.scheduled_at)}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Планирование */}
          {schedulingId === draft.id && (
            <div className="flex gap-2 mt-3 items-center">
              <Input
                type="datetime-local"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="flex-1"
                aria-label="Дата публикации"
              />
              <Button
                size="sm"
                onClick={() => handleSchedule(draft.id)}
                disabled={actionInProgress === draft.id}
                className="min-h-[44px]"
                aria-label="Подтвердить планирование"
              >
                {actionInProgress === draft.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Clock className="w-4 h-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSchedulingId(null); setScheduleDate(""); }}
                className="min-h-[44px]"
                aria-label="Отмена"
              >
                ✕
              </Button>
            </div>
          )}

          {/* Действия */}
          <div className="flex gap-2 mt-3 flex-wrap">
            {onEdit && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(draft)}
                className="min-h-[44px]"
                aria-label="Редактировать черновик"
              >
                <Pencil className="w-4 h-4" />
                Изменить
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePublish(draft.id)}
              disabled={actionInProgress === draft.id}
              className="min-h-[44px]"
              aria-label="Опубликовать"
            >
              {actionInProgress === draft.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Опубликовать
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSchedulingId(schedulingId === draft.id ? null : draft.id)}
              className="min-h-[44px]"
              aria-label="Запланировать"
            >
              <Calendar className="w-4 h-4" />
              Запланировать
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDelete(draft.id)}
              disabled={actionInProgress === draft.id}
              className="min-h-[44px] text-destructive hover:text-destructive"
              aria-label="Удалить черновик"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
