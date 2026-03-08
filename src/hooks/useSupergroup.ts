/**
 * useSupergroup — Supergroup management hook
 *
 * State machine for join requests:
 *   pending → approved (triggers member insertion via DB trigger)
 *   pending → rejected
 *
 * Admin operations require server-side RLS enforcement.
 * All writes are idempotent where possible.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SupergroupSettings {
  conversation_id: string;
  max_members: number;
  join_by_link: boolean;
  join_request_required: boolean;
  history_visible_to_new_members: boolean;
  messages_ttl: number;
  linked_channel_id: string | null;
  forum_mode: boolean;
  slow_mode_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface JoinRequest {
  id: string;
  conversation_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  message: string | null;
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
  /** Joined from profiles */
  profile?: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface UseSupergroup {
  settings: SupergroupSettings | null;
  joinRequests: JoinRequest[];
  membersCount: number;
  isLoading: boolean;
  error: string | null;
  updateSettings: (patch: Partial<Omit<SupergroupSettings, "conversation_id" | "created_at" | "updated_at">>) => Promise<void>;
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  requestToJoin: (message?: string) => Promise<void>;
  convertToSupergroup: () => Promise<void>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSupergroup(conversationId: string): UseSupergroup {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SupergroupSettings | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [membersCount, setMembersCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings + join requests + member count
  useEffect(() => {
    if (!conversationId || !user) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const loadAll = async () => {
      // Settings
      const { data: settingsData, error: settingsErr } = await (supabase as any)
        .from("supergroup_settings")
        .select("*")
        .eq("conversation_id", conversationId)
        .maybeSingle();

      if (settingsErr) {
        if (!cancelled) setError(settingsErr.message);
        return;
      }
      if (!cancelled) setSettings(settingsData as SupergroupSettings | null);

      // Join requests (admins only — RLS will filter for non-admins)
      const { data: requestsData } = await (supabase as any)
        .from("join_requests")
        .select(`
          *,
          profile:profiles(username, full_name, avatar_url)
        `)
        .eq("conversation_id", conversationId)
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (!cancelled) setJoinRequests((requestsData as JoinRequest[]) ?? []);

      // Member count
      const { count } = await (supabase as any)
        .from("conversation_participants")
        .select("user_id", { count: "exact", head: true })
        .eq("conversation_id", conversationId);

      if (!cancelled) setMembersCount(count ?? 0);
      if (!cancelled) setIsLoading(false);
    };

    loadAll();
    return () => { cancelled = true; };
  }, [conversationId, user]);

  // Realtime: join requests
  useEffect(() => {
    if (!conversationId) return;
    const channel = (supabase as any)
      .channel(`supergroup_requests:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "join_requests",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload: { eventType: string; new: JoinRequest; old: { id: string } }) => {
          if (payload.eventType === "INSERT") {
            setJoinRequests(prev => [...prev, payload.new]);
          } else if (payload.eventType === "UPDATE") {
            setJoinRequests(prev =>
              prev
                .map(r => r.id === payload.new.id ? payload.new : r)
                .filter(r => r.status === "pending") // remove non-pending from list
            );
          } else if (payload.eventType === "DELETE") {
            setJoinRequests(prev => prev.filter(r => r.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  const updateSettings = useCallback(
    async (patch: Partial<Omit<SupergroupSettings, "conversation_id" | "created_at" | "updated_at">>) => {
      if (!conversationId) return;
      const { data, error: err } = await (supabase as any)
        .from("supergroup_settings")
        .update(patch)
        .eq("conversation_id", conversationId)
        .select("*")
        .single();

      if (err) {
        setError(err.message);
        throw new Error(err.message);
      }
      setSettings(data as SupergroupSettings);
    },
    [conversationId]
  );

  const approveRequest = useCallback(
    async (requestId: string) => {
      if (!user) return;
      const { error: err } = await (supabase as any)
        .from("join_requests")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (err) {
        setError(err.message);
        throw new Error(err.message);
      }
      // DB trigger handles member insertion
      setMembersCount(c => c + 1);
    },
    [user]
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      if (!user) return;
      const { error: err } = await (supabase as any)
        .from("join_requests")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (err) {
        setError(err.message);
        throw new Error(err.message);
      }
    },
    [user]
  );

  const requestToJoin = useCallback(
    async (message?: string) => {
      if (!user) throw new Error("not_authenticated");

      // Check if join_request_required
      if (!settings?.join_request_required) {
        // Direct join — member count check
        if (membersCount >= (settings?.max_members ?? 200000)) {
          throw new Error("supergroup_full");
        }
        const { error: err } = await (supabase as any)
          .from("conversation_participants")
          .insert({ conversation_id: conversationId, user_id: user.id, role: "member" });
        if (err) throw new Error(err.message);
        setMembersCount(c => c + 1);
        return;
      }

      // Submit join request
      const { error: err } = await (supabase as any)
        .from("join_requests")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          message: message ?? null,
          status: "pending",
        });

      if (err) throw new Error(err.message);
    },
    [user, conversationId, settings, membersCount]
  );

  const convertToSupergroup = useCallback(async () => {
    const { error: err } = await (supabase as any)
      .rpc("convert_group_to_supergroup", { p_conversation_id: conversationId });

    if (err) {
      setError(err.message);
      throw new Error(err.message);
    }

    // Reload settings
    const { data } = await (supabase as any)
      .from("supergroup_settings")
      .select("*")
      .eq("conversation_id", conversationId)
      .single();

    setSettings(data as SupergroupSettings);
  }, [conversationId]);

  return {
    settings,
    joinRequests,
    membersCount,
    isLoading,
    error,
    updateSettings,
    approveRequest,
    rejectRequest,
    requestToJoin,
    convertToSupergroup,
  };
}
