/**
 * src/hooks/useRestrict.ts — Хук мягкой блокировки (Restrict) как в Instagram.
 *
 * Ограниченный пользователь видит свои сообщения, но получатель их не видит
 * без ручного одобрения. Без уведомления ограниченному пользователю.
 */

import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { toast } from "sonner";

interface RestrictedEntry {
  id: string;
  user_id: string;
  restricted_user_id: string;
  created_at: string;
}

const RESTRICT_KEY = "restricted_users";

export function useRestrict() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const { data: restrictedUsers = [], isLoading: loading } = useQuery({
    queryKey: [RESTRICT_KEY, userId],
    queryFn: async (): Promise<RestrictedEntry[]> => {
      if (!userId) return [];
      const { data, error } = await dbLoose
        .from("restricted_users")
        .select("id, user_id, restricted_user_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        logger.error("[useRestrict] Ошибка загрузки", { error });
        throw error;
      }
      return (data ?? []) as RestrictedEntry[];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const restrictMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!userId) throw new Error("Не авторизован");
      if (targetUserId === userId) throw new Error("Нельзя ограничить себя");

      const { error } = await dbLoose.from("restricted_users").insert({
        user_id: userId,
        restricted_user_id: targetUserId,
      });

      if (error) {
        // Duplicate — уже ограничен
        if (error.code === "23505") return;
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [RESTRICT_KEY, userId] });
      toast.success("Пользователь ограничен");
    },
    onError: (err) => {
      logger.error("[useRestrict] Ошибка ограничения", { error: err });
      toast.error("Не удалось ограничить пользователя");
    },
  });

  const unrestrictMutation = useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!userId) throw new Error("Не авторизован");
      const { error } = await dbLoose
        .from("restricted_users")
        .delete()
        .eq("user_id", userId)
        .eq("restricted_user_id", targetUserId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [RESTRICT_KEY, userId] });
      toast.success("Ограничение снято");
    },
    onError: (err) => {
      logger.error("[useRestrict] Ошибка снятия ограничения", { error: err });
      toast.error("Не удалось снять ограничение");
    },
  });

  const restrictUser = useCallback(
    (targetUserId: string) => restrictMutation.mutateAsync(targetUserId),
    [restrictMutation],
  );

  const unrestrictUser = useCallback(
    (targetUserId: string) => unrestrictMutation.mutateAsync(targetUserId),
    [unrestrictMutation],
  );

  const isRestricted = useCallback(
    (targetUserId: string): boolean =>
      restrictedUsers.some((r) => r.restricted_user_id === targetUserId),
    [restrictedUsers],
  );

  return { restrictUser, unrestrictUser, isRestricted, restrictedUsers, loading } as const;
}
