import { useCallback, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type CallRecord = {
  id: string;
  caller_id: string;
  callee_id: string;
  conversation_id: string | null;
  call_type: "video" | "audio" | string;
  status: "ringing" | "answered" | "declined" | "ended" | "missed" | string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export type CallProfile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

export function useCallHistory() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, CallProfile>>({});
  const [loading, setLoading] = useState(true);

  const fetchCalls = useCallback(async () => {
    if (!user?.id) {
      setCalls([]);
      setProfilesById({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("video_calls")
        .select("id, caller_id, callee_id, conversation_id, call_type, status, started_at, ended_at, duration_seconds, created_at")
        .or(`caller_id.eq.${user.id},callee_id.eq.${user.id}`)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as CallRecord[];
      setCalls(rows);

      const otherIds = Array.from(
        new Set(
          rows
            .map((row) => (row.caller_id === user.id ? row.callee_id : row.caller_id))
            .filter(Boolean),
        ),
      );

      if (otherIds.length) {
        const { data: prof, error: profError } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .in("user_id", otherIds);
        if (profError) throw profError;

        const map: Record<string, CallProfile> = {};
        for (const p of prof ?? []) {
          const row = p as CallProfile;
          map[row.user_id] = row;
        }
        setProfilesById(map);
      } else {
        setProfilesById({});
      }
    } catch (e) {
      console.error("useCallHistory.fetchCalls error:", e);
      setCalls([]);
      setProfilesById({});
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void fetchCalls();
  }, [fetchCalls]);

  useEffect(() => {
    if (!user?.id) return;

    let channelCaller: RealtimeChannel | null = null;
    let channelCallee: RealtimeChannel | null = null;

    channelCaller = supabase
      .channel(`video-calls-caller:${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "video_calls", filter: `caller_id=eq.${user.id}` },
        () => void fetchCalls(),
      )
      .subscribe();

    channelCallee = supabase
      .channel(`video-calls-callee:${user.id}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "video_calls", filter: `callee_id=eq.${user.id}` },
        () => void fetchCalls(),
      )
      .subscribe();

    return () => {
      if (channelCaller) supabase.removeChannel(channelCaller);
      if (channelCallee) supabase.removeChannel(channelCallee);
    };
  }, [fetchCalls, user?.id]);

  const missedCalls = useMemo(() => {
    if (!user?.id) return [];
    return calls.filter((row) => {
      const isIncoming = row.callee_id === user.id;
      const missed = row.status === "missed" || row.status === "declined";
      return isIncoming && missed;
    });
  }, [calls, user?.id]);

  return {
    calls,
    missedCalls,
    profilesById,
    loading,
    refetch: fetchCalls,
  };
}
