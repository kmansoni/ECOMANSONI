import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getErrorMessage } from "@/lib/utils";
import { checkHashtagsAllowedForText } from "@/lib/hashtagModeration";

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

export function useGroupChats() {
  const { user } = useAuth();
  const [groups, setGroups] = useState<GroupChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      const groupsWithMessages = (groupsData || []).map(group => ({
        ...group,
        last_message: lastMessages[group.id]
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
        () => {
          fetchGroups();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchGroups]);

  return { groups, loading, error, refetch: fetchGroups };
}

export function useGroupMessages(groupId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading] = useState(true);

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
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", senderIds);

      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      (profiles || []).forEach(p => {
        profileMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      });

      const messagesWithSenders = (data || []).map(msg => ({
        ...msg,
        sender: profileMap[msg.sender_id]
      }));

      setMessages(messagesWithSenders);
    } catch (error) {
      console.error("Error fetching group messages:", error);
    } finally {
      setLoading(false);
    }
  }, [groupId]);

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
            const newMessage = payload.new as GroupMessage;
            
            // Получаем профиль отправителя
            const { data: profile } = await supabase
              .from("profiles")
              .select("display_name, avatar_url")
              .eq("user_id", newMessage.sender_id)
              .single();
            
            setMessages((prev) => [...prev, { ...newMessage, sender: profile || undefined }]);
          }
        )
        .subscribe();
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [groupId]);

  const sendMessage = async (content: string) => {
    if (!groupId || !user || !content.trim()) {
      if (!user) throw new Error("GROUP_NOT_AUTHENTICATED");
      if (!groupId) throw new Error("GROUP_NOT_SELECTED");
      throw new Error("GROUP_EMPTY_MESSAGE");
    }

    try {
      const hashtagVerdict = await checkHashtagsAllowedForText(String(content || "").trim());
      if (!hashtagVerdict.ok) {
        throw new Error(`HASHTAG_BLOCKED:${("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(", ")}`);
      }

      const { error } = await supabase.from("group_chat_messages").insert({
        group_id: groupId,
        sender_id: user.id,
        content: content.trim(),
      });

      if (error) throw error;

      // Обновляем updated_at группы
      await supabase
        .from("group_chats")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", groupId);
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
        p_description: description || null,
        p_avatar_url: avatarUrl || null
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
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url")
        .in("user_id", userIds);

      const profileMap: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
      (profiles || []).forEach(p => {
        profileMap[p.user_id] = { display_name: p.display_name, avatar_url: p.avatar_url };
      });

      const membersWithProfiles = (data || []).map(m => ({
        ...m,
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
