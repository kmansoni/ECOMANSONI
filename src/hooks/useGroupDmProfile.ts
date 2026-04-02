/**
 * src/hooks/useGroupDmProfile.ts
 *
 * Хук для редактирования профиля группового DM:
 * кастомное имя + аватар группы.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase, dbLoose } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

const MAX_GROUP_NAME = 100;

export function useGroupDmProfile(conversationId: string | null) {
  const { user } = useAuth();
  const [groupName, setGroupName] = useState<string | null>(null);
  const [groupAvatarUrl, setGroupAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Загрузка текущих данных
  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;

    async function load() {
      try {
        const { data, error } = await dbLoose
          .from("conversations")
          .select("group_name, group_avatar_url")
          .eq("id", conversationId)
          .limit(1)
          .single();

        if (cancelled) return;
        if (error) {
          logger.error("[useGroupDmProfile] Ошибка загрузки", { conversationId, error });
          return;
        }

        const row = data as Record<string, unknown> | null;
        if (row) {
          setGroupName(typeof row.group_name === "string" ? row.group_name : null);
          setGroupAvatarUrl(typeof row.group_avatar_url === "string" ? row.group_avatar_url : null);
        }
      } catch (e) {
        if (!cancelled) {
          logger.error("[useGroupDmProfile] Непредвиденная ошибка", { error: e });
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [conversationId]);

  // Обновление имени
  const updateGroupName = useCallback(
    async (name: string) => {
      if (!conversationId || !user) return;
      const trimmed = name.trim();
      if (trimmed.length > MAX_GROUP_NAME) {
        toast.error(`Максимум ${MAX_GROUP_NAME} символов`);
        return;
      }

      setLoading(true);
      try {
        const { error } = await dbLoose
          .from("conversations")
          .update({ group_name: trimmed || null })
          .eq("id", conversationId);

        if (error) {
          logger.error("[useGroupDmProfile] Ошибка обновления имени", { error });
          toast.error("Не удалось обновить название группы");
          return;
        }

        setGroupName(trimmed || null);
        toast.success("Название группы обновлено");
      } catch (e) {
        logger.error("[useGroupDmProfile] Ошибка обновления имени", { error: e });
        toast.error("Не удалось обновить название группы");
      } finally {
        setLoading(false);
      }
    },
    [conversationId, user],
  );

  // Загрузка аватара
  const updateGroupAvatar = useCallback(
    async (file: File) => {
      if (!conversationId || !user) return;

      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
      if (file.size > MAX_SIZE) {
        toast.error("Файл слишком большой (максимум 5 МБ)");
        return;
      }

      if (!file.type.startsWith("image/")) {
        toast.error("Допускаются только изображения");
        return;
      }

      setLoading(true);
      try {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `group-avatars/${conversationId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("chat-media")
          .upload(path, file, { upsert: true, contentType: file.type });

        if (uploadErr) {
          logger.error("[useGroupDmProfile] Ошибка загрузки аватара", { error: uploadErr });
          toast.error("Не удалось загрузить аватар");
          return;
        }

        const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        const { error: updateErr } = await dbLoose
          .from("conversations")
          .update({ group_avatar_url: publicUrl })
          .eq("id", conversationId);

        if (updateErr) {
          logger.error("[useGroupDmProfile] Ошибка записи URL аватара", { error: updateErr });
          toast.error("Не удалось обновить аватар группы");
          return;
        }

        setGroupAvatarUrl(publicUrl);
        toast.success("Аватар группы обновлён");
      } catch (e) {
        logger.error("[useGroupDmProfile] Ошибка загрузки аватара", { error: e });
        toast.error("Не удалось обновить аватар группы");
      } finally {
        setLoading(false);
      }
    },
    [conversationId, user],
  );

  return { groupName, groupAvatarUrl, updateGroupName, updateGroupAvatar, loading } as const;
}
