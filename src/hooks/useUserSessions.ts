import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type UserSessionRow = {
  id: string;
  user_id: string;
  session_key: string;
  device_name: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

export function useUserSessions() {
  const { user } = useAuth();
  const [rows, setRows] = useState<UserSessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRows = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_sessions")
        .select("id, user_id, session_key, device_name, user_agent, created_at, last_seen_at, revoked_at")
        .eq("user_id", user.id)
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      setRows((data ?? []) as any);
    } catch (e) {
      console.error("useUserSessions.fetchRows error:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!user?.id) return;

    let ch: RealtimeChannel | null = null;
    ch = supabase
      .channel(`user-sessions:${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "user_sessions", filter: `user_id=eq.${user.id}` },
        () => void fetchRows(),
      )
      .subscribe();

    return () => {
      if (ch) supabase.removeChannel(ch);
    };
  }, [fetchRows, user?.id]);

  const active = useMemo(() => rows.filter((r) => !r.revoked_at), [rows]);

  return {
    rows,
    active,
    loading,
    refetch: fetchRows,
  };
}
