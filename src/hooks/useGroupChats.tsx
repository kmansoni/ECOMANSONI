import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getErrorMessage } from "@/lib/utils";
import { checkHashtagsAllowedForText } from "@/lib/hashtagModeration";
import { removeRealtimeMessage, upsertRealtimeMessage } from "@/lib/chat/realtimeMessageReducer";
import { canonicalizeOutgoingChatText } from "@/lib/chat/textPipeline";
import { fetchUserBriefMap, resolveUserBrief, type UserBriefClient } from "@/lib/users/userBriefs";

type UnknownRecord = Record<string, unknown>;

type RpcResult<T> = Promise<{ data: T | null; error: unknown }>;

interface GroupRpcClient {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => RpcResult<T>;
}

interface ErrorLike {
  code?: string;
  message?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function toErrorLike(error: unknown): ErrorLike {
  if (!isRecord(error)) return {};
  return error as ErrorLike;
}

function getStringField(source: UnknownRecord, key: string): string | null {
  const value = source[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getNullableStringField(source: UnknownRecord, key: string): string | null | undefined {
  const value = source[key];
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value;
}

function decodeRealtimeRow(payload: unknown): UnknownRecord | null {
  if (!isRecord(payload)) return null;
  const candidate = payload.new ?? payload.old;
  return isRecord(candidate) ? candidate : null;
}

function decodeGroupMessageRealtimeRow(value: unknown): GroupMessage | null {
  if (!isRecord(value)) return null;
  const id = getStringField(value, "id");
  const groupId = getStringField(value, "group_id");
  const senderId = getStringField(value, "sender_id");
  if (!id || !groupId || !senderId) return null;

  return {
    id,
    group_id: groupId,
    sender_id: senderId,
    content: getStringField(value, "content") ?? "",
    media_url: getNullableStringField(value, "media_url") ?? null,
    media_type: getNullableStringField(value, "media_type") ?? null,
    created_at: getStringField(value, "created_at") ?? new Date(0).toISOString(),
  };
}

function decodeDeletedGroupMessageRow(value: unknown): { id: string } | null {
  if (!isRecord(value)) return null;
  const id = getStringField(value, "id");
  return id ? { id } : null;
}

function getGroupRpcClient(): GroupRpcClient {
  return supabase as unknown as GroupRpcClient;
}

function isSchemaMissingError(error: unknown): boolean {
  const err = toErrorLike(error);
  const msg = String(err.message ?? error).toLowerCase();
  const code = String(err.code ?? "");
  return (
    code === "PGRST202" ||
    code === "42P01" ||
    code === "42883" ||
    msg.includes("does not exist") ||
    msg.includes("function") ||
    msg.includes("relation")
  );
}

export interface GroupChat {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  member_count: number;
  created_at: string;
  updated_at: string;
  last_message?: GroupMessage;
}

export interface GroupMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
  created_at: string;
  sender?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

type SenderProfile = {
  display_name: string | null;
  avatar_url: string | null;
};

type CachedSenderProfile = {
  profile: SenderProfile;
  cachedAt: number;
};

const LIST_REFRESH_DEBOUNCE_MS = 300;
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
const PROFILE_CACHE_MAX_ENTRIES = 200;

export function useGroupChats() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRefreshTimerRef = useRef<number | null>(null);
  const pendingGroupIdsRef = useRef<Set<string>>(new Set());

  const mapWithConcurrency = useCallback(async <T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>
  ): Promise<R[]> => {
    if (items.length === 0) return [];
    const results: R[] = new Array(items.length);
    let nextIndex = 0;

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (true) {
        const currentIndex = nextIndex++;
        if (currentIndex >= items.length) return;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    });

    await Promise.all(workers);
    return results;
  }, []);

  const fetchGroups = useCallback(async () => {
    if (!user) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Получаем группы, в которых пользователь является участником
      const { data: memberData, error: memberError } = await supabase
        .from("group_chat_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (memberError) throw memberError;

      const groupIds = (memberData || []).map(m => m.group_id);
      
      if (groupIds.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      // Получаем данные групп
      const { data: groupsData, error: groupsError } = await supabase
        .from("group_chats")
        .select("*")
        .in("id", groupIds)
        .order("updated_at", { ascending: false });

      if (groupsError) throw groupsError;

      // Получаем последнее сообщение по каждой группе (correctness > one global limit)
      const lastMessages: Record<string, GroupMessage> = {};
      const rows = await mapWithConcurrency(groupIds, 6, async (groupId) => {
        const { data, error: msgError } = await supabase
          .from("group_chat_messages")
          .select("*")
          .eq("group_id", groupId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (msgError) throw msgError;
        return { groupId, msg: (data && data[0]) as GroupMessage | undefined };
      });
      for (const row of rows) {
        if (row.msg) lastMessages[row.groupId] = row.msg;
      }

      const groupsWithMessages = (groupsData || []).map((group) => ({
        ...group,
        member_count: group.member_count ?? 0,
        created_at: group.created_at ?? new Date(0).toISOString(),
        updated_at: group.updated_at ?? group.created_at ?? new Date(0).toISOString(),
        last_message: lastMessages[group.id],
      }));

      setGroups(groupsWithMessages);
    } catch (err) {
      const msg = getErrorMessage(err);
      console.error("Error fetching groups:", msg, err);
      setError(msg || "Failed to fetch groups");
    } finally {
      setLoading(false);
    }
  }, [user, mapWithConcurrency]);

  const refreshGroupsByIds = useCallback(async (groupIds: string[]) => {
    const uniqueIds = [...new Set(groupIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    try {
      const rows = await mapWithConcurrency(uniqueIds, 6, async (id) => {
        const { data, error: msgError } = await supabase
          .from("group_chat_messages")
          .select("*")
          .eq("group_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (msgError) throw msgError;
        return { id, msg: (data && data[0]) as GroupMessage | undefined };
      });

      const msgById: Record<string, GroupMessage | undefined> = {};
      for (const row of rows) {
        msgById[row.id] = row.msg;
      }

      const idSet = new Set(uniqueIds);
      setGroups((prev) =>
        prev.map((group) => {
          if (!idSet.has(group.id)) return group;
          const nextLastMessage = msgById[group.id];
          return {
            ...group,
            last_message: nextLastMessage,
            updated_at: nextLastMessage?.created_at ?? group.updated_at,
          };
        }),
      );
    } catch (err) {
      console.error("Error refreshing groups by ids:", err);
      void fetchGroups();
    }
  }, [mapWithConcurrency, fetchGroups]);

  const scheduleGroupsRefresh = useCallback((groupId?: string | null) => {
    if (groupId) {
      pendingGroupIdsRef.current.add(String(groupId));
    }

    if (listRefreshTimerRef.current !== null) return;

    listRefreshTimerRef.current = window.setTimeout(() => {
      listRefreshTimerRef.current = null;
      const pendingIds = [...pendingGroupIdsRef.current];
      pendingGroupIdsRef.current.clear();
      if (pendingIds.length > 0) {
        void refreshGroupsByIds(pendingIds);
      } else {
        void fetchGroups();
      }
    }, LIST_REFRESH_DEBOUNCE_MS);
  }, [fetchGroups, refreshGroupsByIds]);

  useEffect(() => {
    const pendingGroupIds = pendingGroupIdsRef.current;

    return () => {
      if (listRefreshTimerRef.current !== null) {
        window.clearTimeout(listRefreshTimerRef.current);
        listRefreshTimerRef.current = null;
      }
      pendingGroupIds.clear();
    };
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  // Realtime subscription for group updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('group-chats-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_chats',
        },
        (payload) => {
          const row = decodeRealtimeRow(payload);
          scheduleGroupsRefresh(row ? getStringField(row, "id") : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, scheduleGroupsRefresh]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('group-messages-list-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_chat_messages',
        },
        (payload) => {
          const row = decodeRealtimeRow(payload);
          scheduleGroupsRefresh(row ? getStringField(row, "group_id") : null);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'group_chat_messages',
        },
        (payload) => {
          const row = decodeRealtimeRow(payload);
          scheduleGroupsRefresh(row ? getStringField(row, "group_id") : null);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'group_chat_messages',
        },
        (payload) => {
          const row = decodeRealtimeRow(payload);
          scheduleGroupsRefresh(row ? getStringField(row, "group_id") : null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, scheduleGroupsRefresh]);

  return { groups, loading, error, refetch: fetchGroups };
}

export function useGroupMessages(groupId: string | null) {
  const { user } = useAuth();
  const rpc = getGroupRpcClient();
  const briefClient = supabase as unknown as UserBriefClient;
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const profileCacheRef = useRef<Map<string, CachedSenderProfile>>(new Map());
  const profileInFlightRef = useRef<Record<string, Promise<SenderProfile | undefined>>>({});

  const getCachedProfile = useCallback((senderId: string): SenderProfile | undefined => {
    const entry = profileCacheRef.current.get(senderId);
    if (!entry) return undefined;

    if (Date.now() - entry.cachedAt > PROFILE_CACHE_TTL_MS) {
      profileCacheRef.current.delete(senderId);
      return undefined;
    }

    profileCacheRef.current.delete(senderId);
    profileCacheRef.current.set(senderId, entry);
    return entry.profile;
  }, []);

  const setCachedProfile = useCallback((senderId: string, profile: SenderProfile) => {
    profileCacheRef.current.delete(senderId);
    profileCacheRef.current.set(senderId, { profile, cachedAt: Date.now() });

    while (profileCacheRef.current.size > PROFILE_CACHE_MAX_ENTRIES) {
      const oldestKey = profileCacheRef.current.keys().next().value as string | undefined;
      if (!oldestKey) break;
      profileCacheRef.current.delete(oldestKey);
    }
  }, []);

  const getSenderProfile = useCallback(async (senderId: string) => {
    if (!senderId) return undefined;
    const cached = getCachedProfile(senderId);
    if (cached) return cached;

    if (!profileInFlightRef.current[senderId]) {
      profileInFlightRef.current[senderId] = (async () => {
        try {
          const briefMap = await fetchUserBriefMap([senderId], briefClient);
          const brief = resolveUserBrief(senderId, briefMap);
          const normalized = brief
            ? {
                display_name: brief.display_name,
                avatar_url: brief.avatar_url,
              }
            : undefined;

          if (normalized) {
            setCachedProfile(senderId, normalized);
          }
          return normalized;
        } finally {
          delete profileInFlightRef.current[senderId];
        }
      })();
    }

    return profileInFlightRef.current[senderId];
  }, [getCachedProfile, setCachedProfile]);

  const fetchMessages = useCallback(async () => {
    if (!groupId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("group_chat_messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Получаем профили отправителей
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      const briefMap = await fetchUserBriefMap(senderIds, briefClient);
      const profileMap: Record<string, SenderProfile> = {};
      senderIds.forEach((senderId) => {
        const brief = resolveUserBrief(senderId, briefMap);
        if (!brief) return;
        profileMap[senderId] = {
          display_name: brief.display_name,
          avatar_url: brief.avatar_url,
        };
        setCachedProfile(senderId, profileMap[senderId]);
      });

      const messagesWithSenders = (data || []).map((msg) => ({
        ...msg,
        created_at: msg.created_at ?? new Date(0).toISOString(),
        sender: profileMap[msg.sender_id]
      }));

      setMessages(messagesWithSenders);
    } catch (error) {
      console.error("Error fetching group messages:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId, setCachedProfile]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Realtime подписка
  useEffect(() => {
    if (!groupId) return;

    let channel: RealtimeChannel;

    const setupSubscription = () => {
      channel = supabase
        .channel(`group_messages:${groupId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "group_chat_messages",
            filter: `group_id=eq.${groupId}`,
          },
          async (payload) => {
            const newMessage = decodeGroupMessageRealtimeRow(payload.new);
            if (!newMessage) return;
            const profile = await getSenderProfile(newMessage.sender_id);

            setMessages((prev) =>
              upsertRealtimeMessage(prev, {
                ...newMessage,
                created_at: newMessage.created_at ?? new Date(0).toISOString(),
                sender: profile,
              }),
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "group_chat_messages",
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            const updatedMessage = decodeGroupMessageRealtimeRow(payload.new);
            if (!updatedMessage) return;
            setMessages((prev) => {
              const existing = prev.find((message) => message.id === updatedMessage.id);
              return upsertRealtimeMessage(prev, {
                ...updatedMessage,
                created_at: updatedMessage.created_at ?? existing?.created_at ?? new Date(0).toISOString(),
                sender: updatedMessage.sender ?? existing?.sender,
              });
            });
          }
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "group_chat_messages",
            filter: `group_id=eq.${groupId}`,
          },
          (payload) => {
            const deletedMessage = decodeDeletedGroupMessageRow(payload.old);
            if (!deletedMessage) return;
            setMessages((prev) => removeRealtimeMessage(prev, deletedMessage.id));
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            void fetchMessages();
          }
        });
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [groupId, fetchMessages, getSenderProfile]);

  useEffect(() => {
    if (!groupId) return;

    const handleOnline = () => {
      void fetchMessages();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [groupId, fetchMessages]);

  const sendMessage = async (content: string) => {
    const normalizedContent = canonicalizeOutgoingChatText(content);

    if (!groupId || !user || !normalizedContent) {
      if (!user) throw new Error("GROUP_NOT_AUTHENTICATED");
      if (!groupId) throw new Error("GROUP_NOT_SELECTED");
      throw new Error("GROUP_EMPTY_MESSAGE");
    }

    try {
      const hashtagVerdict = await checkHashtagsAllowedForText(normalizedContent);
      if (!hashtagVerdict.ok) {
        throw new Error(`HASHTAG_BLOCKED:${("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(", ")}`);
      }

      const rpcResult = await rpc.rpc<unknown>("send_group_message_v1", {
        p_group_id: groupId,
        p_content: normalizedContent,
        p_media_url: undefined,
        p_media_type: undefined,
      });

      if (rpcResult.error && !isSchemaMissingError(rpcResult.error)) {
        throw rpcResult.error;
      }

      if (rpcResult.error && isSchemaMissingError(rpcResult.error)) {
        const { error } = await supabase.from("group_chat_messages").insert({
          group_id: groupId,
          sender_id: user.id,
          content: normalizedContent,
        });

        if (error) throw error;

        // Обновляем updated_at группы
        await supabase
          .from("group_chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", groupId);
      }
    } catch (error) {
      console.error("Error sending group message:", error);
      throw error;
    }
  };

  return { messages, loading, sendMessage, refetch: fetchMessages };
}

export function useCreateGroup() {
  const { user } = useAuth();

  const createGroup = async (name: string, description?: string, avatarUrl?: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc("create_group_chat", {
        p_name: name,
        p_description: description || undefined,
        p_avatar_url: avatarUrl || undefined
      });

      if (error) throw error;
      return data as string;
    } catch (error) {
      console.error("Error creating group:", error);
      return null;
    }
  };

  return { createGroup };
}

export function useGroupMembers(groupId: string | null) {
  const [members, setMembers] = useState<{ user_id: string; role: string; profile?: { display_name: string | null; avatar_url: string | null } }[]>([]);
  const [loading, setLoading] = useState(true);
  const briefClient = supabase as unknown as UserBriefClient;

  const fetchMembers = useCallback(async () => {
    if (!groupId) {
      setMembers([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("group_chat_members")
        .select("user_id, role")
        .eq("group_id", groupId);

      if (error) throw error;

      const userIds = (data || []).map(m => m.user_id);
      const briefMap = await fetchUserBriefMap(userIds, briefClient);
      const profileMap: Record<string, SenderProfile> = {};
      userIds.forEach((memberId) => {
        const brief = resolveUserBrief(memberId, briefMap);
        if (!brief) return;
        profileMap[memberId] = {
          display_name: brief.display_name,
          avatar_url: brief.avatar_url,
        };
      });

      const membersWithProfiles = (data || []).map(m => ({
        ...m,
        role: m.role ?? "member",
        profile: profileMap[m.user_id]
      }));

      setMembers(membersWithProfiles);
    } catch (error) {
      console.error("Error fetching members:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return { members, loading, refetch: fetchMembers };
}
