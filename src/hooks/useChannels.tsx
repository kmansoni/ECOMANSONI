import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/mediaUpload";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { checkChannelCapabilityViaRpc } from "@/lib/channel-capabilities";
import { checkHashtagsAllowedForText } from "@/lib/hashtagModeration";
import { removeRealtimeMessage, upsertRealtimeMessage } from "@/lib/chat/realtimeMessageReducer";
import { canonicalizeOutgoingChatText } from "@/lib/chat/textPipeline";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";

function isSchemaMissingError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error).toLowerCase();
  const code = String((error as any)?.code ?? "");
  return (
    code === "PGRST202" ||
    code === "42P01" ||
    code === "42883" ||
    msg.includes("does not exist") ||
    msg.includes("function") ||
    msg.includes("relation")
  );
}

function isMissingSilentColumnError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error).toLowerCase();
  const code = String((error as any)?.code ?? "");
  return (
    code === "42703" &&
    (msg.includes("silent") || msg.includes("column"))
  );
}

export interface Channel {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  owner_id: string;
  is_public: boolean;
  member_count: number;
  created_at: string;
  updated_at: string;
  is_member?: boolean;
  member_role?: string | null;
  auto_delete_seconds?: number | null;
  last_message?: ChannelMessage;
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  media_url?: string | null;
  media_type?: string | null;
  duration_seconds?: number | null;
  silent?: boolean | null;
  created_at: string;
  edited_at?: string | null;
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

export function useChannels() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const listRefreshTimerRef = useRef<number | null>(null);
  const pendingChannelIdsRef = useRef<Set<string>>(new Set());

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

  const fetchChannels = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch all public channels
      const { data: channelsData, error: channelsError } = await supabase
        .from("channels")
        .select("*")
        .eq("is_public", true)
        .order("member_count", { ascending: false });

      if (channelsError) throw channelsError;

      // If user is logged in, check which channels they're a member of
      let memberChannelIds: string[] = [];
      const memberRoleByChannelId: Record<string, string> = {};
      if (user) {
        const { data: memberData } = await supabase
          .from("channel_members")
          .select("channel_id, role")
          .eq("user_id", user.id);

        memberChannelIds = (memberData || []).map((m: any) => m.channel_id);
        (memberData || []).forEach((m: any) => {
          if (!m?.channel_id) return;
          memberRoleByChannelId[String(m.channel_id)] = String(m?.role ?? "member");
        });
      }

      // Fetch last message per channel (correctness > one global limit)
      const channelIds = (channelsData || []).map((c: any) => c.id).filter(Boolean) as string[];
      const lastMessages: Record<string, ChannelMessage> = {};
      const rows = await mapWithConcurrency(channelIds, 6, async (channelId) => {
        const { data, error: msgError } = await supabase
          .from("channel_messages")
          .select("*")
          .eq("channel_id", channelId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (msgError) throw msgError;
        return { channelId, msg: (data && data[0]) as ChannelMessage | undefined };
      });
      for (const row of rows) {
        if (row.msg) lastMessages[row.channelId] = row.msg;
      }

      const channelsWithMembership = (channelsData || []).map(channel => ({
        ...channel,
        is_member: memberChannelIds.includes(channel.id),
        member_role: memberRoleByChannelId[String(channel.id)] ?? null,
        last_message: lastMessages[channel.id]
      }));

      setChannels(channelsWithMembership);
    } catch (err) {
      console.error("Error fetching channels:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch channels");
    } finally {
      setLoading(false);
    }
  }, [user, mapWithConcurrency]);

  const refreshChannelsByIds = useCallback(async (channelIds: string[]) => {
    const uniqueIds = [...new Set(channelIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    try {
      const rows = await mapWithConcurrency(uniqueIds, 6, async (id) => {
        const { data, error: msgError } = await supabase
          .from("channel_messages")
          .select("*")
          .eq("channel_id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (msgError) throw msgError;
        return { id, msg: (data && data[0]) as ChannelMessage | undefined };
      });

      const msgById: Record<string, ChannelMessage | undefined> = {};
      for (const row of rows) {
        msgById[row.id] = row.msg;
      }

      const idSet = new Set(uniqueIds);
      setChannels((prev) =>
        prev.map((channel) => {
          if (!idSet.has(channel.id)) return channel;
          const nextLastMessage = msgById[channel.id];
          return {
            ...channel,
            last_message: nextLastMessage,
            updated_at: nextLastMessage?.created_at ?? channel.updated_at,
          };
        }),
      );
    } catch (err) {
      console.error("Error refreshing channels by ids:", err);
      void fetchChannels();
    }
  }, [mapWithConcurrency, fetchChannels]);

  const scheduleChannelsRefresh = useCallback((channelId?: string | null) => {
    if (channelId) {
      pendingChannelIdsRef.current.add(String(channelId));
    }

    if (listRefreshTimerRef.current !== null) return;

    listRefreshTimerRef.current = window.setTimeout(() => {
      listRefreshTimerRef.current = null;
      const pendingIds = [...pendingChannelIdsRef.current];
      pendingChannelIdsRef.current.clear();
      if (pendingIds.length > 0) {
        void refreshChannelsByIds(pendingIds);
      } else {
        void fetchChannels();
      }
    }, LIST_REFRESH_DEBOUNCE_MS);
  }, [fetchChannels, refreshChannelsByIds]);

  useEffect(() => {
    const pendingChannelIds = pendingChannelIdsRef.current;

    return () => {
      if (listRefreshTimerRef.current !== null) {
        window.clearTimeout(listRefreshTimerRef.current);
        listRefreshTimerRef.current = null;
      }
      pendingChannelIds.clear();
    };
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Realtime subscription for channel updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('channels-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channels',
        },
        (payload) => {
          const row = (payload as any)?.new ?? (payload as any)?.old;
          scheduleChannelsRefresh(row?.id ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, scheduleChannelsRefresh]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('channel-messages-list-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'channel_messages',
        },
        (payload) => {
          const row = (payload as any)?.new ?? (payload as any)?.old;
          scheduleChannelsRefresh(row?.channel_id ?? null);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'channel_messages',
        },
        (payload) => {
          const row = (payload as any)?.new ?? (payload as any)?.old;
          scheduleChannelsRefresh(row?.channel_id ?? null);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'channel_messages',
        },
        (payload) => {
          const row = (payload as any)?.new ?? (payload as any)?.old;
          scheduleChannelsRefresh(row?.channel_id ?? null);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, scheduleChannelsRefresh]);

  return { channels, loading, error, refetch: fetchChannels };
}

export function useChannelMessages(channelId: string | null): {
  messages: ChannelMessage[];
  loading: boolean;
  sendMessage: (content: string, options?: { silent?: boolean }) => Promise<void>;
  sendMediaMessage: (
    file: File,
    mediaType: "image" | "video" | "document" | "voice" | "video_circle",
    options?: { silent?: boolean; durationSeconds?: number },
  ) => Promise<void>;
  editChannelMessage: (messageId: string, newContent: string) => Promise<{ error: string | null }>;
  refetch: () => Promise<void>;
} {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
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
          const briefMap = await fetchUserBriefMap([senderId], supabase as any);
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
    if (!channelId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("channel_messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch sender profiles
      const senderIds = [...new Set((data || []).map(m => m.sender_id))];
      const briefMap = await fetchUserBriefMap(senderIds, supabase as any);
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

      const messagesWithSenders = (data || []).map(msg => ({
        ...msg,
        sender: profileMap[msg.sender_id]
      }));

      setMessages(messagesWithSenders);
    } catch (error) {
      console.error("Error fetching channel messages:", error);
    } finally {
      setLoading(false);
    }
  }, [channelId, setCachedProfile]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Subscribe to realtime messages
  useEffect(() => {
    if (!channelId) return;

    let channel: RealtimeChannel;

    const setupSubscription = () => {
      channel = supabase
        .channel(`channel_messages:${channelId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "channel_messages",
            filter: `channel_id=eq.${channelId}`,
          },
          async (payload) => {
            const newMessage = payload.new as ChannelMessage;
            const profile = await getSenderProfile(newMessage.sender_id);

            setMessages((prev) =>
              upsertRealtimeMessage(prev, {
                ...newMessage,
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
            table: "channel_messages",
            filter: `channel_id=eq.${channelId}`,
          },
          (payload) => {
            const updatedMessage = payload.new as ChannelMessage;
            setMessages((prev) => {
              const existing = prev.find((message) => message.id === updatedMessage.id);
              return upsertRealtimeMessage(prev, {
                ...updatedMessage,
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
            table: "channel_messages",
            filter: `channel_id=eq.${channelId}`,
          },
          (payload) => {
            const deletedMessage = payload.old as Pick<ChannelMessage, "id">;
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
  }, [channelId, fetchMessages, getSenderProfile]);

  useEffect(() => {
    if (!channelId) return;

    const handleOnline = () => {
      void fetchMessages();
    };

    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [channelId, fetchMessages]);

  const sendMessage = async (content: string, options?: { silent?: boolean }) => {
    const normalizedContent = canonicalizeOutgoingChatText(content);

    if (!channelId || !user || !normalizedContent) {
      if (!user) throw new Error("CHANNEL_NOT_AUTHENTICATED");
      if (!channelId) throw new Error("CHANNEL_NOT_SELECTED");
      throw new Error("CHANNEL_EMPTY_MESSAGE");
    }

    try {
      const hashtagVerdict = await checkHashtagsAllowedForText(normalizedContent);
      if (!hashtagVerdict.ok) {
        throw new Error(`HASHTAG_BLOCKED:${("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(", ")}`);
      }
      const rpc = await (supabase as any).rpc("send_channel_message_v1", {
        p_channel_id: channelId,
        p_content: normalizedContent,
        p_silent: Boolean(options?.silent),
        p_media_url: null,
        p_media_type: null,
        p_duration_seconds: null,
      });

      if (rpc.error && !isSchemaMissingError(rpc.error)) {
        throw rpc.error;
      }

      if (rpc.error && isSchemaMissingError(rpc.error)) {
        let canPost = true;
        try {
          canPost = await checkChannelCapabilityViaRpc(channelId, user.id, "channel.posts.create");
        } catch (err) {
          if (!isSchemaMissingError(err)) throw err;
        }
        if (!canPost) {
          throw new Error("No permission to publish in this channel");
        }

        const basePayload = {
          channel_id: channelId,
          sender_id: user.id,
          content: normalizedContent,
        };

        let { error } = await supabase.from("channel_messages").insert({
          ...basePayload,
          silent: Boolean(options?.silent),
        });

        // Backward compatibility: environments without `silent` column.
        if (error && isMissingSilentColumnError(error)) {
          const retry = await supabase.from("channel_messages").insert(basePayload);
          error = retry.error;
        }

        if (error) throw error;

        await supabase
          .from("channels")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", channelId);
      }
    } catch (error) {
      console.error("Error sending channel message:", error);
      throw error;
    }
  };

  const sendMediaMessage = async (
    file: File,
    mediaType: "image" | "video" | "document" | "voice" | "video_circle",
    options?: { silent?: boolean; durationSeconds?: number },
  ) => {
    if (!channelId || !user) return;

    try {
      const mime = String(file.type || "").toLowerCase();
      const fileExt =
        file.name.split(".").pop() ||
        (mediaType === "image"
          ? "jpg"
          : mediaType === "video" || mediaType === "video_circle"
            ? "webm"
            : mediaType === "voice"
              ? (mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm")
              : "bin");
      const fileName = `${user.id}/channels/${channelId}/${Date.now()}.${fileExt}`;

      const uploadResult = await uploadMedia(file, { bucket: 'chat-media' });
      const publicUrl = uploadResult.url;

      const contentLabel =
        mediaType === "image"
          ? "📷 Изображение"
          : mediaType === "video"
            ? "🎥 Видео"
            : mediaType === "video_circle"
              ? "🎬 Видео-кружок"
              : mediaType === "voice"
                ? "🎤 Голосовое сообщение"
                : "📎 Документ";

      const rpc = await (supabase as any).rpc("send_channel_message_v1", {
        p_channel_id: channelId,
        p_content: contentLabel,
        p_silent: Boolean(options?.silent),
        p_media_url: publicUrl,
        p_media_type: mediaType,
        p_duration_seconds: options?.durationSeconds ?? null,
      });

      if (rpc.error && !isSchemaMissingError(rpc.error)) {
        throw rpc.error;
      }

      if (rpc.error && isSchemaMissingError(rpc.error)) {
        let canPost = true;
        try {
          canPost = await checkChannelCapabilityViaRpc(channelId, user.id, "channel.posts.create");
        } catch (err) {
          if (!isSchemaMissingError(err)) throw err;
        }
        if (!canPost) {
          throw new Error("No permission to publish in this channel");
        }

        const basePayload = {
          channel_id: channelId,
          sender_id: user.id,
          content: contentLabel,
          media_url: publicUrl,
          media_type: mediaType,
          duration_seconds: options?.durationSeconds ?? null,
        };

        let { error } = await supabase.from("channel_messages").insert({
          ...basePayload,
          silent: Boolean(options?.silent),
        });

        // Backward compatibility: environments without `silent` column.
        if (error && isMissingSilentColumnError(error)) {
          const retry = await supabase.from("channel_messages").insert(basePayload);
          error = retry.error;
        }

        if (error) throw error;

        await supabase
          .from("channels")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", channelId);
      }
    } catch (error) {
      console.error("Error sending channel media message:", error);
      throw error;
    }
  };

  const editChannelMessage = async (messageId: string, newContent: string) => {
    if (!user) return { error: 'Not authenticated' };
    const trimmed = newContent.trim();
    if (!trimmed) return { error: 'Content cannot be empty' };

    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return { error: 'Message not found' };
    if (msg.sender_id !== user.id) return { error: 'Cannot edit someone else message' };
    const ageMs = Date.now() - new Date(msg.created_at).getTime();
    if (ageMs > 48 * 60 * 60 * 1000) return { error: 'Message is too old to edit' };

    const now = new Date().toISOString();
    // Optimistic
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content: trimmed, edited_at: now } : m))
    );

    try {
      const { error } = await (supabase as any)
        .from("channel_messages")
        .update({ content: trimmed, edited_at: now })
        .eq("id", messageId)
        .eq("sender_id", user.id);

      if (error) {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, content: msg.content, edited_at: msg.edited_at ?? null } : m))
        );
        throw error;
      }
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Failed to edit message' };
    }
  };

  return { messages, loading, sendMessage, sendMediaMessage, editChannelMessage, refetch: fetchMessages };
}

export function useCreateChannel() {
  const { user } = useAuth();

  const createChannel = async (name: string, description?: string, avatarUrl?: string) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase.rpc("create_channel", {
        p_name: name,
        p_description: description || null,
        p_avatar_url: avatarUrl || null,
        p_is_public: true
      });

      if (error) throw error;
      return data as string;
    } catch (error) {
      console.error("Error creating channel:", error);
      return null;
    }
  };

  return { createChannel };
}

export function useJoinChannel() {
  const { user } = useAuth();

  const joinChannel = async (channelId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase.from("channel_members").insert({
        channel_id: channelId,
        user_id: user.id,
        role: "member"
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error joining channel:", error);
      return false;
    }
  };

  const leaveChannel = async (channelId: string) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", channelId)
        .eq("user_id", user.id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error leaving channel:", error);
      return false;
    }
  };

  return { joinChannel, leaveChannel };
}
