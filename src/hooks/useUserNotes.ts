/**
 * src/hooks/useUserNotes.ts — Хук для мини-статусов (Notes) как в Instagram DM.
 *
 * Позволяет установить/удалить заметку (24ч auto-expire) и
 * загрузить заметки для списка пользователей.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface UserNote {
  id: string;
  user_id: string;
  text: string;
  emoji: string | null;
  audience: "followers" | "close_friends";
  expires_at: string;
  created_at: string;
}

const NOTES_KEY = "user_notes";
const MY_NOTE_KEY = "my_note";

export function useUserNotes(userIds?: string[]) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  /** Своя заметка */
  const { data: myNote = null } = useQuery({
    queryKey: [MY_NOTE_KEY, userId],
    queryFn: async (): Promise<UserNote | null> => {
      if (!userId) return null;
      const { data, error } = await dbLoose
        .from("user_notes")
        .select("id, user_id, text, emoji, audience, expires_at, created_at")
        .eq("user_id", userId)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error("[useUserNotes] Ошибка загрузки своей заметки", { error });
        return null;
      }
      return data as UserNote | null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  /** Заметки других пользователей */
  const stableIds = userIds?.join(",") ?? "";
  const { data: notes = [] } = useQuery({
    queryKey: [NOTES_KEY, stableIds],
    queryFn: async (): Promise<UserNote[]> => {
      if (!userIds?.length) return [];
      const { data, error } = await dbLoose
        .from("user_notes")
        .select("id, user_id, text, emoji, audience, expires_at, created_at")
        .in("user_id", userIds)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        logger.error("[useUserNotes] Ошибка загрузки заметок", { error });
        return [];
      }
      return (data ?? []) as UserNote[];
    },
    enabled: !!userIds?.length,
    staleTime: 30_000,
  });

  /** Установить/обновить заметку */
  const setNoteMutation = useMutation({
    mutationFn: async (input: { text: string; emoji?: string; audience?: "followers" | "close_friends" }) => {
      if (!userId) throw new Error("Не авторизован");

      const trimmed = input.text.trim().slice(0, 60);
      if (!trimmed) throw new Error("Текст заметки не может быть пустым");

      // Удалим предыдущие заметки пользователя
      await dbLoose.from("user_notes").delete().eq("user_id", userId);

      const { data, error } = await dbLoose
        .from("user_notes")
        .insert({
          user_id: userId,
          text: trimmed,
          emoji: input.emoji ?? null,
          audience: input.audience ?? "followers",
        })
        .select("id, user_id, text, emoji, audience, expires_at, created_at")
        .single();

      if (error) throw error;
      return data as UserNote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [MY_NOTE_KEY, userId] });
      toast.success("Заметка опубликована");
    },
    onError: (err) => {
      logger.error("[useUserNotes] Ошибка создания заметки", { error: err });
      toast.error("Не удалось опубликовать заметку");
    },
  });

  /** Удалить свою заметку */
  const clearNoteMutation = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Не авторизован");
      const { error } = await dbLoose.from("user_notes").delete().eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [MY_NOTE_KEY, userId] });
      toast.success("Заметка удалена");
    },
    onError: (err) => {
      logger.error("[useUserNotes] Ошибка удаления заметки", { error: err });
      toast.error("Не удалось удалить заметку");
    },
  });

  const setNote = useCallback(
    (text: string, emoji?: string, audience?: "followers" | "close_friends") =>
      setNoteMutation.mutateAsync({ text, emoji, audience }),
    [setNoteMutation],
  );

  const clearNote = useCallback(() => clearNoteMutation.mutateAsync(), [clearNoteMutation]);

  const loading = setNoteMutation.isPending || clearNoteMutation.isPending;

  return { myNote, notes, setNote, clearNote, loading } as const;
}
