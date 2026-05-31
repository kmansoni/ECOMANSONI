/**
 * Supabase Persistence Adapter — implements CallPersistencePort.
 *
 * Handles all database operations for calls:
 * - Creating/updating call records
 * - Fetching call history
 * - Realtime subscriptions for incoming calls
 */

import { supabase } from "@/integrations/supabase/client";
import type { VideoCall } from "@/calls-v2/types";
import type { CallPersistencePort } from "../runtime/ports";

/**
 * Supabase adapter for call persistence.
 */
export class SupabaseCallPersistenceAdapter implements CallPersistencePort {
  async createCall(payload: {
    callerId: string;
    calleeId: string;
    callType: "audio" | "video";
    conversationId?: string;
  }): Promise<VideoCall> {
    const { data, error } = await supabase
      .from("video_calls")
      .insert({
        caller_id: payload.callerId,
        callee_id: payload.calleeId,
        call_type: payload.callType,
        conversation_id: payload.conversationId ?? null,
        status: "calling",
      })
      .select()
      .single();

    if (error) throw error;
    return data as VideoCall;
  }

  async updateCallStatus(callId: string, status: string): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (status === "ended") {
      updates.ended_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from("video_calls")
      .update(updates)
      .eq("id", callId);

    if (error) throw error;
  }

  async getCall(callId: string): Promise<VideoCall | null> {
    const { data, error } = await supabase
      .from("video_calls")
      .select("*")
      .eq("id", callId)
      .maybeSingle();

    if (error) throw error;
    return data as VideoCall | null;
  }

  async getActiveCalls(userId: string): Promise<VideoCall[]> {
    const { data, error } = await supabase
      .from("video_calls")
      .select("*")
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .in("status", ["calling", "ringing", "active"])
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;
    return (data ?? []) as VideoCall[];
  }

  async getCallHistory(userId: string, limit = 50): Promise<VideoCall[]> {
    const { data, error } = await supabase
      .from("video_calls")
      .select("*")
      .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
      .not("status", "eq", "calling")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as VideoCall[];
  }

  subscribeToIncomingCalls(
    userId: string,
    onIncoming: (call: VideoCall) => void
  ): () => void {
    const channel = supabase
      .channel(`incoming-calls:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "video_calls",
          filter: `callee_id=eq.${userId}`,
        },
        (payload) => {
          const call = payload.new as VideoCall;
          if (call.status === "calling") {
            onIncoming(call);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }
}

// Singleton for app-wide use
export const supabaseCallPersistence = new SupabaseCallPersistenceAdapter();