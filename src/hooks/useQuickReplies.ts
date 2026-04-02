/**
 * src/hooks/useQuickReplies.ts — CRUD хук для быстрых ответов (шаблонов).
 *
 * Хранит в таблице quick_replies, использует TanStack Query для кеширования.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

export interface QuickReply {
  id: string;
  user_id: string;
  shortcut: string;
  title: string;
  text: string;
  sort_order: number;
  created_at: string;
}

const QUERY_KEY = "quick_replies";

export function useQuickReplies() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data: replies = [], isLoading: loading } = useQuery({
    queryKey: [QUERY_KEY, userId],
    queryFn: async (): Promise<QuickReply[]> => {
      if (!userId) return [];
      const { data, error } = await dbLoose
        .from("quick_replies")
        .select("id, user_id, shortcut, title, text, sort_order, created_at")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .limit(100);

      if (error) {
        logger.error("[useQuickReplies] Ошибка загрузки", { error });
        throw error;
      }
      return (data ?? []) as QuickReply[];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const addMutation = useMutation({
    mutationFn: async (input: { shortcut: string; title: string; text: string }) => {
      if (!userId) throw new Error("Не авторизован");
      const maxOrder = replies.reduce((max, r) => Math.max(max, r.sort_order), 0);
      const { data, error } = await dbLoose
        .from("quick_replies")
        .insert({
          user_id: userId,
          shortcut: input.shortcut,
          title: input.title,
          text: input.text,
          sort_order: maxOrder + 1,
        })
        .select("id, user_id, shortcut, title, text, sort_order, created_at")
        .single();

      if (error) throw error;
      return data as QuickReply;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
      toast.success("Шаблон добавлен");
    },
    onError: (err) => {
      logger.error("[useQuickReplies] Ошибка добавления", { error: err });
      toast.error("Не удалось добавить шаблон");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; shortcut?: string; title?: string; text?: string }) => {
      const updateData: Record<string, string> = {};
      if (input.shortcut !== undefined) updateData.shortcut = input.shortcut;
      if (input.title !== undefined) updateData.title = input.title;
      if (input.text !== undefined) updateData.text = input.text;

      const { error } = await dbLoose
        .from("quick_replies")
        .update(updateData)
        .eq("id", input.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
    onError: (err) => {
      logger.error("[useQuickReplies] Ошибка обновления", { error: err });
      toast.error("Не удалось обновить шаблон");
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await dbLoose.from("quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
      toast.success("Шаблон удалён");
    },
    onError: (err) => {
      logger.error("[useQuickReplies] Ошибка удаления", { error: err });
      toast.error("Не удалось удалить шаблон");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        dbLoose.from("quick_replies").update({ sort_order: index }).eq("id", id),
      );
      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error);
      if (firstError?.error) throw firstError.error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, userId] });
    },
    onError: (err) => {
      logger.error("[useQuickReplies] Ошибка сортировки", { error: err });
      toast.error("Не удалось изменить порядок");
    },
  });

  const add = useCallback(
    (shortcut: string, title: string, text: string) =>
      addMutation.mutateAsync({ shortcut, title, text }),
    [addMutation],
  );

  const update = useCallback(
    (id: string, fields: { shortcut?: string; title?: string; text?: string }) =>
      updateMutation.mutateAsync({ id, ...fields }),
    [updateMutation],
  );

  const remove = useCallback(
    (id: string) => removeMutation.mutateAsync(id),
    [removeMutation],
  );

  const reorder = useCallback(
    (orderedIds: string[]) => reorderMutation.mutateAsync(orderedIds),
    [reorderMutation],
  );

  return { replies, add, update, remove, reorder, loading } as const;
}
