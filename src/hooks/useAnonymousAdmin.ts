/**
 * src/hooks/useAnonymousAdmin.ts
 * Hook for Anonymous Admin mode in supergroups.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AnonymousActionType = "message" | "pin" | "delete" | "ban" | "mute" | "edit_info";

export interface AnonymousAdminAction {
  id: string;
  group_id: string;
  admin_user_id: string;
  action_type: AnonymousActionType;
  target_user_id: string | null;
  target_message_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useAnonymousAdmin() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Toggle anonymous mode for the current admin in a group.
   * Updates group_members.is_anonymous for the current user + group.
   */
  const toggleAnonymous = useCallback(
    async (groupId: string, isAnonymous: boolean): Promise<boolean> => {
      if (!user?.id) return false;
      setIsLoading(true);
      setError(null);
      try {
        const { error: dbError } = await supabase
          .from("group_members")
          .update({ is_anonymous: isAnonymous })
          .eq("group_id", groupId)
          .eq("user_id", user.id);

        if (dbError) throw dbError;
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id]
  );

  /**
   * Check if the current user has anonymous mode enabled in the given group.
   */
  const isAnonymous = useCallback(
    async (groupId: string): Promise<boolean> => {
      if (!user?.id) return false;
      try {
        const { data, error: dbError } = await supabase
          .from("group_members")
          .select("is_anonymous")
          .eq("group_id", groupId)
          .eq("user_id", user.id)
          .single();

        if (dbError || !data) return false;
        return (data as { is_anonymous: boolean }).is_anonymous ?? false;
      } catch {
        return false;
      }
    },
    [user?.id]
  );

  /**
   * Get anonymous admin action logs for a group (owner only — enforced by RLS).
   */
  const getAnonymousAdminLogs = useCallback(
    async (groupId: string, limit = 50): Promise<AnonymousAdminAction[]> => {
      setIsLoading(true);
      setError(null);
      try {
        const { data, error: dbError } = await supabase
          .from("anonymous_admin_actions")
          .select("*")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(limit);

        if (dbError) throw dbError;
        return (data ?? []) as AnonymousAdminAction[];
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Log an anonymous admin action.
   * Note: INSERT policy requires service_role. This is intentionally called
   * server-side or via an Edge Function that uses service_role key.
   * Client-side call will fail if RLS restricts it — this is by design.
   * In production, route through a trusted Edge Function.
   */
  const logAnonymousAction = useCallback(
    async (
      groupId: string,
      actionType: AnonymousActionType,
      targetUserId?: string,
      targetMessageId?: string,
      metadata?: Record<string, unknown>
    ): Promise<boolean> => {
      if (!user?.id) return false;
      setIsLoading(true);
      setError(null);
      try {
        const { error: dbError } = await supabase.from("anonymous_admin_actions").insert({
          group_id: groupId,
          admin_user_id: user.id,
          action_type: actionType,
          target_user_id: targetUserId ?? null,
          target_message_id: targetMessageId ?? null,
          metadata: metadata ?? {},
        });

        if (dbError) throw dbError;
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id]
  );

  return {
    isLoading,
    error,
    toggleAnonymous,
    isAnonymous,
    getAnonymousAdminLogs,
    logAnonymousAction,
  };
}
