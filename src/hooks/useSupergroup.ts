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
import { logger } from "@/lib/logger";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";

// ── Types ──────────────────────────────────────────────────────────────────

export type MemberRole = "owner" | "admin" | "member";

export interface MemberPermissions {
  can_send_messages: boolean;
  can_send_media: boolean;
  can_send_links: boolean;
  muted_until: string | null;
}

export interface GroupMember {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  permissions: MemberPermissions;
  profile?: {
    display_name: string | null;
    avatar_url: string | null;
    username?: string | null;
  };
}

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
  default_member_can_send_messages: boolean;
  default_member_can_send_media: boolean;
  default_member_can_send_links: boolean;
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
  members: GroupMember[];
  membersLoading: boolean;
  currentUserRole: MemberRole | null;
  isLoading: boolean;
  error: string | null;
  updateSettings: (patch: Partial<Omit<SupergroupSettings, "conversation_id" | "created_at" | "updated_at">>) => Promise<void>;
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  requestToJoin: (message?: string) => Promise<void>;
  convertToSupergroup: () => Promise<void>;
  loadMembers: () => Promise<void>;
  updateMemberRole: (userId: string, role: MemberRole) => Promise<void>;
  updateMemberPermissions: (userId: string, patch: Partial<MemberPermissions>) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSupergroup(conversationId: string): UseSupergroup {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SupergroupSettings | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [membersCount, setMembersCount] = useState(0);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<MemberRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const defaultPermissions: MemberPermissions = {
    can_send_messages: true,
    can_send_media: true,
    can_send_links: true,
    muted_until: null,
  };

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

      // Member count + current user role
      const { data: participantRows, count } = await (supabase as any)
        .from("conversation_participants")
        .select("user_id, role", { count: "exact" })
        .eq("conversation_id", conversationId);

      if (!cancelled) {
        setMembersCount(count ?? 0);
        const myRow = (participantRows as any[])?.find((r: any) => r.user_id === user?.id);
        setCurrentUserRole((myRow?.role as MemberRole) ?? null);
      }
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
        setError("Не удалось обновить настройки супергруппы. Попробуйте снова.");
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
        setError("Не удалось одобрить заявку. Попробуйте снова.");
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
        setError("Не удалось отклонить заявку. Попробуйте снова.");
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
      setError("Не удалось преобразовать группу в супергруппу. Попробуйте снова.");
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

  const loadMembers = useCallback(async () => {
    if (!conversationId) return;
    setMembersLoading(true);
    try {
      const { data, error: err } = await (supabase as any)
        .from("conversation_participants")
        .select("user_id, role, joined_at")
        .eq("conversation_id", conversationId)
        .order("joined_at", { ascending: true });

      if (err) throw err;

      const rows = (data as Array<{ user_id: string; role: MemberRole; joined_at: string }>) ?? [];
      const userIds = rows.map(r => r.user_id);
      const briefMap = userIds.length > 0 ? await fetchUserBriefMap(userIds, supabase as any) : new Map();

      const { data: permissionsRows, error: permissionsErr } = await (supabase as any)
        .from("supergroup_member_permissions")
        .select("user_id, can_send_messages, can_send_media, can_send_links, muted_until")
        .eq("conversation_id", conversationId)
        .in("user_id", userIds);

      if (permissionsErr) throw permissionsErr;

      const permissionsByUserId = new Map<string, MemberPermissions>();
      ((permissionsRows || []) as Array<{ user_id: string; can_send_messages: boolean; can_send_media: boolean; can_send_links: boolean; muted_until: string | null }>).forEach((p) => {
        permissionsByUserId.set(p.user_id, {
          can_send_messages: p.can_send_messages,
          can_send_media: p.can_send_media,
          can_send_links: p.can_send_links,
          muted_until: p.muted_until,
        });
      });

      const defaultBySettings: MemberPermissions = {
        can_send_messages: settings?.default_member_can_send_messages ?? defaultPermissions.can_send_messages,
        can_send_media: settings?.default_member_can_send_media ?? defaultPermissions.can_send_media,
        can_send_links: settings?.default_member_can_send_links ?? defaultPermissions.can_send_links,
        muted_until: null,
      };

      const result: GroupMember[] = rows.map(r => {
        const brief = resolveUserBrief(r.user_id, briefMap);
        return {
          user_id: r.user_id,
          role: r.role,
          joined_at: r.joined_at,
          permissions: permissionsByUserId.get(r.user_id) ?? defaultBySettings,
          profile: brief
            ? { display_name: brief.display_name, avatar_url: brief.avatar_url, username: brief.username }
            : undefined,
        };
      });

      setMembers(result);
    } catch (e) {
      logger.error("[useSupergroup] loadMembers failed", { error: e });
    } finally {
      setMembersLoading(false);
    }
  }, [conversationId, settings]);

  const updateMemberRole = useCallback(
    async (userId: string, role: MemberRole) => {
      if (!conversationId) return;
      const { error: err } = await (supabase as any)
        .from("conversation_participants")
        .update({ role })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      if (err) {
        setError("Не удалось обновить роль участника. Попробуйте снова.");
        throw new Error(err.message);
      }
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role } : m));
    },
    [conversationId]
  );

  const updateMemberPermissions = useCallback(
    async (userId: string, patch: Partial<MemberPermissions>) => {
      if (!conversationId) return;
      const payload: Record<string, unknown> = {
        conversation_id: conversationId,
        user_id: userId,
      };

      if (patch.can_send_messages !== undefined) payload.can_send_messages = patch.can_send_messages;
      if (patch.can_send_media !== undefined) payload.can_send_media = patch.can_send_media;
      if (patch.can_send_links !== undefined) payload.can_send_links = patch.can_send_links;
      if (patch.muted_until !== undefined) payload.muted_until = patch.muted_until;

      const { error: err } = await (supabase as any)
        .from("supergroup_member_permissions")
        .upsert(payload, { onConflict: "conversation_id,user_id" });

      if (err) {
        setError("Не удалось обновить права участника. Попробуйте снова.");
        throw new Error(err.message);
      }

      setMembers(prev => prev.map((m) => {
        if (m.user_id !== userId) return m;
        return {
          ...m,
          permissions: {
            ...m.permissions,
            ...patch,
          },
        };
      }));
    },
    [conversationId]
  );

  const removeMember = useCallback(
    async (userId: string) => {
      if (!conversationId) return;
      const { error: err } = await (supabase as any)
        .from("conversation_participants")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", userId);

      if (err) {
        setError("Не удалось удалить участника. Попробуйте снова.");
        throw new Error(err.message);
      }
      setMembers(prev => prev.filter(m => m.user_id !== userId));
      setMembersCount(c => Math.max(0, c - 1));
    },
    [conversationId]
  );

  return {
    settings,
    joinRequests,
    membersCount,
    members,
    membersLoading,
    currentUserRole,
    isLoading,
    error,
    updateSettings,
    approveRequest,
    rejectRequest,
    requestToJoin,
    convertToSupergroup,
    loadMembers,
    updateMemberRole,
    updateMemberPermissions,
    removeMember,
  };
}
