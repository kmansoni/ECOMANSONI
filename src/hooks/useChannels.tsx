import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
  last_message?: ChannelMessage;
}

export interface ChannelMessage {
  id: string;
  channel_id: string;
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

export function useChannels() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      if (user) {
        const { data: memberData } = await supabase
          .from("channel_members")
          .select("channel_id")
          .eq("user_id", user.id);
        
        memberChannelIds = (memberData || []).map(m => m.channel_id);
      }

      // Fetch last messages for channels
      const channelIds = (channelsData || []).map(c => c.id);
      const { data: messagesData } = await supabase
        .from("channel_messages")
        .select("*")
        .in("channel_id", channelIds)
        .order("created_at", { ascending: false })
        .limit(100);

      const lastMessages: Record<string, ChannelMessage> = {};
      (messagesData || []).forEach(msg => {
        if (!lastMessages[msg.channel_id]) {
          lastMessages[msg.channel_id] = msg;
        }
      });

      const channelsWithMembership = (channelsData || []).map(channel => ({
        ...channel,
        is_member: memberChannelIds.includes(channel.id),
        last_message: lastMessages[channel.id]
      }));

      setChannels(channelsWithMembership);
    } catch (err) {
      console.error("Error fetching channels:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch channels");
    } finally {
      setLoading(false);
    }
  }, [user]);

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
        () => {
          fetchChannels();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchChannels]);

  return { channels, loading, error, refetch: fetchChannels };
}

export function useChannelMessages(channelId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);

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
      console.error("Error fetching channel messages:", error);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

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
            
            // Fetch sender profile
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
  }, [channelId]);

  const sendMessage = async (content: string) => {
    if (!channelId || !user || !content.trim()) return;

    try {
      const { error } = await supabase.from("channel_messages").insert({
        channel_id: channelId,
        sender_id: user.id,
        content: content.trim(),
      });

      if (error) throw error;

      // Update channel updated_at
      await supabase
        .from("channels")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", channelId);
    } catch (error) {
      console.error("Error sending channel message:", error);
      throw error;
    }
  };

  return { messages, loading, sendMessage, refetch: fetchMessages };
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
