import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AudioRoom {
  id: string;
  title: string;
  description: string | null;
  host_id: string;
  status: 'live' | 'scheduled' | 'ended';
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  max_speakers: number;
  listener_count: number;
  created_at: string;
  host?: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export interface AudioRoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  role: 'host' | 'speaker' | 'listener';
  hand_raised: boolean;
  is_muted: boolean;
  joined_at: string;
  profile?: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

export function useAudioRoom(roomId?: string) {
  const sb = supabase as any;
  const { user } = useAuth();
  const [room, setRoom] = useState<AudioRoom | null>(null);
  const [participants, setParticipants] = useState<AudioRoomParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [loading, setLoading] = useState(false);

  const isHost = room?.host_id === user?.id;
  const myParticipant = participants.find(p => p.user_id === user?.id);
  const isSpeaker = myParticipant?.role === 'speaker' || isHost;

  // Fetch room data
  const fetchRoom = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const { data } = await sb
        .from('audio_rooms')
        .select('*, host:profiles!audio_rooms_host_id_fkey(username, full_name, avatar_url)')
        .eq('id', roomId)
        .single();
      if (data) setRoom(data as AudioRoom);
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const fetchParticipants = useCallback(async () => {
    if (!roomId) return;
    const { data } = await sb
      .from('audio_room_participants')
      .select('*, profile:profiles!audio_room_participants_user_id_fkey(username, full_name, avatar_url)')
      .eq('room_id', roomId)
      .order('joined_at', { ascending: true });
    if (data) setParticipants(data as AudioRoomParticipant[]);
  }, [roomId]);

  useEffect(() => {
    fetchRoom();
    fetchParticipants();
  }, [fetchRoom, fetchParticipants]);

  // Realtime subscriptions
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase.channel(`audio_room:${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'audio_rooms', filter: `id=eq.${roomId}`
      }, () => fetchRoom())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'audio_room_participants', filter: `room_id=eq.${roomId}`
      }, () => fetchParticipants())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, fetchRoom, fetchParticipants]);

  const createRoom = async (title: string, description?: string, scheduledAt?: string) => {
    if (!user) return null;
    const { data, error } = await sb
      .from('audio_rooms')
      .insert({
        title,
        description: description || null,
        host_id: user.id,
        status: scheduledAt ? 'scheduled' : 'live',
        scheduled_at: scheduledAt || null,
        started_at: scheduledAt ? null : new Date().toISOString(),
        max_speakers: 10,
        listener_count: 0,
      })
      .select()
      .single();
    if (error) { console.error(error); return null; }
    // Auto-join as host
    await sb.from('audio_room_participants').insert({
      room_id: data.id,
      user_id: user.id,
      role: 'host',
      is_muted: false,
      hand_raised: false,
    });
    return data as AudioRoom;
  };

  const joinRoom = async (rid: string) => {
    if (!user) return;
    await sb.from('audio_room_participants').upsert({
      room_id: rid,
      user_id: user.id,
      role: 'listener',
      is_muted: true,
      hand_raised: false,
    }, { onConflict: 'room_id,user_id' });
    // increment listener count
    await sb.rpc('increment_audio_room_listeners', { room_id: rid }).catch((error: unknown) => {
      console.warn('[useAudioRoom] Failed to increment listeners', { roomId: rid, error });
    });
    fetchParticipants();
  };

  const leaveRoom = async () => {
    if (!user || !roomId) return;
    await sb
      .from('audio_room_participants')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', user.id);
  };

  const requestToSpeak = async () => {
    if (!user || !roomId) return;
    await sb
      .from('audio_room_participants')
      .update({ hand_raised: true })
      .eq('room_id', roomId)
      .eq('user_id', user.id);
  };

  const promoteToSpeaker = async (userId: string) => {
    if (!roomId) return;
    await sb
      .from('audio_room_participants')
      .update({ role: 'speaker', hand_raised: false })
      .eq('room_id', roomId)
      .eq('user_id', userId);
  };

  const demoteToListener = async (userId: string) => {
    if (!roomId) return;
    await sb
      .from('audio_room_participants')
      .update({ role: 'listener' })
      .eq('room_id', roomId)
      .eq('user_id', userId);
  };

  const endRoom = async () => {
    if (!roomId) return;
    await sb
      .from('audio_rooms')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', roomId);
  };

  const toggleMute = async () => {
    if (!user || !roomId) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    await sb
      .from('audio_room_participants')
      .update({ is_muted: newMuted })
      .eq('room_id', roomId)
      .eq('user_id', user.id);
  };

  return {
    room,
    participants,
    isHost,
    isSpeaker,
    isMuted,
    loading,
    createRoom,
    joinRoom,
    leaveRoom,
    requestToSpeak,
    promoteToSpeaker,
    demoteToListener,
    endRoom,
    toggleMute,
  };
}

// Hook for listing audio rooms
export function useAudioRooms() {
  const sb = supabase as any;
  const [liveRooms, setLiveRooms] = useState<AudioRoom[]>([]);
  const [scheduledRooms, setScheduledRooms] = useState<AudioRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await sb
        .from('audio_rooms')
        .select('*, host:profiles!audio_rooms_host_id_fkey(username, full_name, avatar_url)')
        .in('status', ['live', 'scheduled'])
        .order('listener_count', { ascending: false });

      if (data) {
        setLiveRooms((data as AudioRoom[]).filter(r => r.status === 'live'));
        setScheduledRooms((data as AudioRoom[]).filter(r => r.status === 'scheduled'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const channel = supabase.channel('audio_rooms_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audio_rooms' }, fetchRooms)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchRooms]);

  return { liveRooms, scheduledRooms, loading, refetch: fetchRooms };
}
