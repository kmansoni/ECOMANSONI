import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { VideoCall } from "./useVideoCall";

interface UseIncomingCallsOptions {
  onIncomingCall?: (call: VideoCall) => void;
}

const POLL_INTERVAL_MS = 2000; // Poll every 2 seconds as fallback

export function useIncomingCalls(options: UseIncomingCallsOptions = {}) {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<VideoCall | null>(null);
  
  // Use ref to avoid recreating subscription when callback changes
  const onIncomingCallRef = useRef(options.onIncomingCall);
  onIncomingCallRef.current = options.onIncomingCall;
  
  // Track which calls we've already notified about
  const notifiedCallsRef = useRef<Set<string>>(new Set());

  const clearIncomingCall = useCallback(() => {
    console.log("[IncomingCalls] Clearing incoming call");
    setIncomingCall(null);
  }, []);

  // Helper to process a new incoming call
  const processIncomingCall = useCallback(async (call: VideoCall) => {
    // Skip if we already notified about this call
    if (notifiedCallsRef.current.has(call.id)) {
      return;
    }
    
    console.log("[IncomingCalls] Processing incoming call:", call.id.slice(0, 8), "type:", call.call_type);
    notifiedCallsRef.current.add(call.id);

    // Fetch caller profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("user_id", call.caller_id)
      .single();

    const callWithProfile: VideoCall = {
      ...call,
      call_type: call.call_type as "video" | "audio",
      caller_profile: profile || undefined,
    };

    setIncomingCall(callWithProfile);
    onIncomingCallRef.current?.(callWithProfile);
  }, []);

  // Cleanup stale ringing calls on mount
  useEffect(() => {
    if (!user) return;

    const cleanupStaleRingingCalls = async () => {
      const cutoff = new Date(Date.now() - 60000).toISOString();
      const { error } = await supabase
        .from("video_calls")
        .update({ status: "missed", ended_at: new Date().toISOString() })
        .eq("callee_id", user.id)
        .eq("status", "ringing")
        .lt("created_at", cutoff);
      
      if (error) {
        console.log("[IncomingCalls] Cleanup error:", error.message);
      } else {
        console.log("[IncomingCalls] Cleaned up stale ringing calls");
      }
    };

    cleanupStaleRingingCalls();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    console.log("[IncomingCalls] Setting up for user:", user.id.slice(0, 8));

    // === REALTIME SUBSCRIPTION (primary) ===
    const channel = supabase
      .channel(`incoming-video-calls-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "video_calls",
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const call = payload.new as VideoCall;
          // Check call age - ignore calls older than 60 seconds
          const callAge = Date.now() - new Date(call.created_at).getTime();
          if (callAge > 60000 || call.status !== "ringing") {
            console.log("[IncomingCalls] Ignoring stale/non-ringing call:", call.id.slice(0, 8), "age:", Math.round(callAge / 1000), "s");
            return;
          }
          console.log("[IncomingCalls] Realtime INSERT detected:", call.id.slice(0, 8));
          await processIncomingCall(call);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "video_calls",
          filter: `callee_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new as VideoCall;
          
          // Clear incoming call if it was answered, declined, ended, or missed
          if (["answered", "declined", "ended", "missed"].includes(updated.status)) {
            console.log("[IncomingCalls] Call status changed to:", updated.status);
            notifiedCallsRef.current.delete(updated.id);
            setIncomingCall((current) => {
              if (current?.id === updated.id) {
                return null;
              }
              return current;
            });
          }
        }
      )
      .subscribe((status) => {
        console.log("[IncomingCalls] Realtime subscription status:", status);
      });

    // === POLLING FALLBACK ===
    // This catches incoming calls if Realtime subscription is delayed or missed
    const pollInterval = setInterval(async () => {
      try {
        const cutoff = new Date(Date.now() - 60000).toISOString();
        const { data: ringingCalls } = await supabase
          .from("video_calls")
          .select("*")
          .eq("callee_id", user.id)
          .eq("status", "ringing")
          .gt("created_at", cutoff) // Only calls from last 60 seconds
          .order("created_at", { ascending: false })
          .limit(1);

        if (ringingCalls && ringingCalls.length > 0) {
          const call = ringingCalls[0] as VideoCall;
          // Only process if not already notified
          if (!notifiedCallsRef.current.has(call.id)) {
            console.log("[IncomingCalls] Poll fallback found ringing call:", call.id.slice(0, 8));
            await processIncomingCall(call);
          }
        }
      } catch (err) {
        // Silent fail for polling
      }
    }, POLL_INTERVAL_MS);

    return () => {
      console.log("[IncomingCalls] Cleaning up");
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
      notifiedCallsRef.current.clear();
    };
  }, [user, processIncomingCall]);

  return {
    incomingCall,
    clearIncomingCall,
  };
}
