/**
 * useDraftPosts — черновики и отложенные публикации постов.
 *
 * Возвращает:
 *  - drafts — список черновиков
 *  - saveDraft(content) — создать/обновить черновик
 *  - publishDraft(id) — опубликовать
 *  - scheduleDraft(id, scheduledAt) — запланировать публикацию
 *  - deleteDraft(id) — удалить
 *  - loading
 */
import { useState, useEffect, useCallback } from "react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface DraftPost {
  id: string;
  content: string | null;
  is_draft: boolean;
  scheduled_at: string | null;
  created_at: string;
  media?: Array<{
    id: string;
    media_url: string;
    media_type: string;
    sort_order: number;
  }>;
}

export function useDraftPosts() {
  const { user } = useAuth();
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setDrafts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    dbLoose
      .from("posts")
      .select("id, content, is_draft, scheduled_at, created_at")
      .eq("author_id", user.id)
      .eq("is_draft", true)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          logger.error("[useDraftPosts] Ошибка загрузки черновиков", { error });
        } else {
          setDrafts((data ?? []) as DraftPost[]);
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user]);

  const saveDraft = useCallback(
    async (content: string, existingId?: string): Promise<DraftPost | null> => {
      if (!user) { toast.error("Требуется авторизация"); return null; }

      try {
        if (existingId) {
          const { data, error } = await dbLoose
            .from("posts")
            .update({ content: content.trim() })
            .eq("id", existingId)
            .eq("author_id", user.id)
            .eq("is_draft", true)
            .select("id, content, is_draft, scheduled_at, created_at")
            .single();

          if (error) {
            logger.error("[useDraftPosts] Ошибка обновления черновика", { error });
            toast.error("Не удалось сохранить черновик");
            return null;
          }

          const draft = data as DraftPost;
          setDrafts((prev) => prev.map((d) => d.id === existingId ? draft : d));
          toast.success("Черновик сохранён");
          return draft;
        }

        const { data, error } = await dbLoose
          .from("posts")
          .insert({
            author_id: user.id,
            content: content.trim(),
            is_draft: true,
            is_published: false,
          })
          .select("id, content, is_draft, scheduled_at, created_at")
          .single();

        if (error) {
          logger.error("[useDraftPosts] Ошибка создания черновика", { error });
          toast.error("Не удалось создать черновик");
          return null;
        }

        const draft = data as DraftPost;
        setDrafts((prev) => [draft, ...prev]);
        toast.success("Черновик создан");
        return draft;
      } catch (e) {
        logger.error("[useDraftPosts] saveDraft error", { error: e });
        toast.error("Ошибка при сохранении черновика");
        return null;
      }
    },
    [user],
  );

  const publishDraft = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;

      try {
        const { error } = await dbLoose
          .from("posts")
          .update({ is_draft: false, is_published: true, scheduled_at: null })
          .eq("id", id)
          .eq("author_id", user.id)
          .eq("is_draft", true);

        if (error) {
          logger.error("[useDraftPosts] publishDraft error", { error });
          toast.error("Не удалось опубликовать");
          return;
        }

        setDrafts((prev) => prev.filter((d) => d.id !== id));
        toast.success("Пост опубликован");
      } catch (e) {
        logger.error("[useDraftPosts] publishDraft unexpected", { error: e });
        toast.error("Ошибка при публикации");
      }
    },
    [user],
  );

  const scheduleDraft = useCallback(
    async (id: string, scheduledAt: string): Promise<void> => {
      if (!user) return;

      const scheduleDate = new Date(scheduledAt);
      if (scheduleDate <= new Date()) {
        toast.error("Дата публикации должна быть в будущем");
        return;
      }

      try {
        const { error } = await dbLoose
          .from("posts")
          .update({ scheduled_at: scheduledAt, is_draft: false, is_published: false })
          .eq("id", id)
          .eq("author_id", user.id);

        if (error) {
          logger.error("[useDraftPosts] scheduleDraft error", { error });
          toast.error("Не удалось запланировать публикацию");
          return;
        }

        setDrafts((prev) => prev.filter((d) => d.id !== id));
        toast.success("Публикация запланирована");
      } catch (e) {
        logger.error("[useDraftPosts] scheduleDraft unexpected", { error: e });
        toast.error("Ошибка при планировании");
      }
    },
    [user],
  );

  const deleteDraft = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;

      try {
        const { error } = await dbLoose
          .from("posts")
          .delete()
          .eq("id", id)
          .eq("author_id", user.id)
          .eq("is_draft", true);

        if (error) {
          logger.error("[useDraftPosts] deleteDraft error", { error });
          toast.error("Не удалось удалить черновик");
          return;
        }

        setDrafts((prev) => prev.filter((d) => d.id !== id));
        toast.success("Черновик удалён");
      } catch (e) {
        logger.error("[useDraftPosts] deleteDraft unexpected", { error: e });
        toast.error("Ошибка при удалении черновика");
      }
    },
    [user],
  );

  return { drafts, saveDraft, publishDraft, scheduleDraft, deleteDraft, loading } as const;
}
