import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { VideoCall } from "./useVideoCall";
import { logger } from "@/lib/logger";
import {
  activateForegroundCallWake,
  stopRingtone,
} from "@/lib/platform/callWakeStrategy";
import type { WakeLockHandle } from "@/lib/platform/wakelock";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";
import { dbLoose } from "@/lib/supabase";

interface UseIncomingCallsOptions {
  onIncomingCall?: (call: VideoCall) => void;
}

const POLL_INTERVAL_MS = 2000; // kept for reference — polling removed (WS relay is primary)

const isSchemaCompatibilityError = (error: unknown): boolean => {
  const code = String((error as { code?: unknown } | null)?.code ?? "").toUpperCase();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    code === "PGRST204" ||
    code === "42703" ||
    code === "42P01" ||
    message.includes("column") ||
    message.includes("could not find") ||
    message.includes("does not exist")
  );
};

export function useIncomingCalls(options: UseIncomingCallsOptions = {}) {
  const { user } = useAuth();
  const [incomingCall, setIncomingCall] = useState<VideoCall | null>(null);
  
  // Use ref to avoid recreating subscription when callback changes
  const onIncomingCallRef = useRef(options.onIncomingCall);
  onIncomingCallRef.current = options.onIncomingCall;
  
  // Track which calls we've already notified about
  const notifiedCallsRef = useRef<Set<string>>(new Set());
  const wakeLockHandleRef = useRef<WakeLockHandle | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const releaseCallWake = useCallback(async () => {
    stopRingtone();
    if (!wakeLockHandleRef.current) return;
    try {
      await wakeLockHandleRef.current.release();
    } catch (error) {
      logger.warn("incoming_calls.wake_release_failed", { error });
    } finally {
      wakeLockHandleRef.current = null;
    }
  }, []);

  const resolveIncomingCallAlertPolicy = useCallback(async (call: VideoCall) => {
    const now = new Date();
    let notificationsEnabled = true;
    let soundEnabled = true;
    let vibrationEnabled = true;

    if (user) {
      const { data: globalSettings } = await supabase
        .from("user_global_chat_settings" as never)
        .select("in_app_sounds, in_app_vibrate")
        .eq("user_id", user.id)
        .maybeSingle();

      if (globalSettings && typeof globalSettings === "object") {
        const gs = globalSettings as { in_app_sounds?: boolean | null; in_app_vibrate?: boolean | null };
        if (gs.in_app_sounds === false) soundEnabled = false;
        if (gs.in_app_vibrate === false) vibrationEnabled = false;
      }
    }

    if (user && call.conversation_id) {
      const { data: chatSettings, error: chatSettingsError } = await supabase
        .from("user_chat_settings" as never)
        .select("notifications_enabled, muted_until")
        .eq("user_id", user.id)
        .eq("conversation_id", call.conversation_id)
        .maybeSingle();

      let resolvedChatSettings: {
        notifications_enabled?: boolean | null;
        muted_until?: string | null;
      } | null = chatSettings && typeof chatSettings === "object"
        ? (chatSettings as {
            notifications_enabled?: boolean | null;
            muted_until?: string | null;
          })
        : null;

      if (!resolvedChatSettings && chatSettingsError && isSchemaCompatibilityError(chatSettingsError)) {
        const { data: compatChatSettings } = await supabase
          .from("user_chat_settings" as never)
          .select("notifications_enabled, muted_until")
          .eq("user_id", user.id)
          .eq("conversation_id", call.conversation_id)
          .maybeSingle();

        if (compatChatSettings && typeof compatChatSettings === "object") {
          resolvedChatSettings = compatChatSettings as {
            notifications_enabled?: boolean | null;
            muted_until?: string | null;
          };
        }
      }

      if (resolvedChatSettings) {
        const cs = resolvedChatSettings;

        const mutedUntil = cs.muted_until ? new Date(cs.muted_until) : null;
        const mutedByTime = !!mutedUntil && mutedUntil > now;
        notificationsEnabled = (cs.notifications_enabled ?? true) && !mutedByTime;
      }
    }

    if (!notificationsEnabled) {
      soundEnabled = false;
      vibrationEnabled = false;
    }

    return { soundEnabled, vibrationEnabled };
  }, [user]);

  const clearIncomingCall = useCallback(() => {
    logger.info("incoming_calls.clear");
    if (isMountedRef.current) {
      setIncomingCall(null);
    }
    void releaseCallWake();
  }, [releaseCallWake]);

  // Helper to process a new incoming call
  const processIncomingCall = useCallback(async (call: VideoCall) => {
    // Skip if we already notified about this call
    if (notifiedCallsRef.current.has(call.id)) {
      return;
    }
    
    logger.info("incoming_calls.process", { callId: call.id, callType: call.call_type });
    notifiedCallsRef.current.add(call.id);

    const briefMap = await fetchUserBriefMap([call.caller_id]);
    const callerBrief = resolveUserBrief(call.caller_id, briefMap);

    const callWithProfile: VideoCall = {
      ...call,
      call_type: call.call_type as "video" | "audio",
      caller_profile: callerBrief
        ? {
            display_name: callerBrief.display_name,
            avatar_url: callerBrief.avatar_url,
          }
        : undefined,
    };

    const alertPolicy = await resolveIncomingCallAlertPolicy(callWithProfile);

    await releaseCallWake();
    if (alertPolicy.soundEnabled || alertPolicy.vibrationEnabled) {
      try {
        wakeLockHandleRef.current = await activateForegroundCallWake(
          {
            callId: callWithProfile.id,
            callerName: callWithProfile.caller_profile?.display_name || "Unknown caller",
            hasVideo: callWithProfile.call_type === "video",
          },
          {
            playSound: alertPolicy.soundEnabled,
            vibrate: alertPolicy.vibrationEnabled,
          }
        );
      } catch (error) {
        logger.warn("incoming_calls.wake_activation_failed", { error, callId: call.id });
      }
    }

    if (isMountedRef.current) {
      setIncomingCall(callWithProfile);
      onIncomingCallRef.current?.(callWithProfile);
    }
  }, [resolveIncomingCallAlertPolicy, releaseCallWake]);

  // Cleanup stale ringing calls on mount
  useEffect(() => {
    if (!user) return;
    const notifiedCalls = notifiedCallsRef.current;

    const cleanupStaleRingingCalls = async () => {
      const cutoff = new Date(Date.now() - 60000).toISOString();
      const { error } = await supabase
        .from("video_calls")
        .update({ status: "missed", ended_at: new Date().toISOString() })
        .eq("callee_id", user.id)
        .eq("status", "ringing")
        .lt("created_at", cutoff);
      
      if (error) {
        logger.warn("incoming_calls.cleanup_stale_failed", { error: error.message });
      } else {
        logger.info("incoming_calls.cleanup_stale_ok");
      }
    };

    cleanupStaleRingingCalls();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const notifiedCalls = notifiedCallsRef.current;

    logger.info("incoming_calls.setup", { userId: user.id });

    // === REALTIME SUBSCRIPTION (primary) ===
    // NB: video_calls — это VIEW над calls. Realtime слушает WAL на ТАБЛИЦЕ calls,
    // поэтому подписываемся на "calls" и маппим state→status.
    const channel = supabase
      .channel(`incoming-video-calls-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${user.id}`,
        },
        async (payload) => {
          const raw = payload.new as Record<string, unknown>;
          const call = { ...raw, status: raw.state ?? raw.status } as VideoCall;
          // Check call age - ignore calls older than 60 seconds
          const callAge = Date.now() - new Date(call.created_at).getTime();
          if (callAge > 60000 || call.status !== "ringing") {
            logger.debug("incoming_calls.realtime_ignored", {
              callId: call.id,
              ageSec: Math.round(callAge / 1000),
              status: call.status,
            });
            return;
          }
          logger.info("incoming_calls.realtime_insert", { callId: call.id });
          await processIncomingCall(call);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "calls",
          filter: `callee_id=eq.${user.id}`,
        },
        (payload) => {
          const raw = payload.new as Record<string, unknown>;
          const updated = { ...raw, status: raw.state ?? raw.status } as VideoCall;
          
          // Clear incoming call if it was answered, declined, ended, or missed
          if (["answered", "active", "connected", "declined", "ended", "missed"].includes(updated.status)) {
            logger.info("incoming_calls.status_changed", { callId: updated.id, status: updated.status });
            notifiedCalls.delete(updated.id);
            void releaseCallWake();
            if (isMountedRef.current) {
              setIncomingCall((current) => {
                if (current?.id === updated.id) {
                  return null;
                }
                return current;
              });
            }
          }
        }
      )
      .subscribe((status) => {
        logger.info("incoming_calls.realtime_status", { status });
      });

    // === Realtime is now fallback ===
    // Primary delivery is via calls-ws WS relay (VideoCallProvider receives call.invite
    // frames and calls setPendingIncomingCall directly). Realtime handles offline/reconnect cases.
    void POLL_INTERVAL_MS; // suppress unused-var lint

    return () => {
      logger.info("incoming_calls.cleanup");
      supabase.removeChannel(channel);
      notifiedCalls.clear();
      void releaseCallWake();
    };
  }, [user, processIncomingCall, releaseCallWake]);

  return {
    incomingCall,
    clearIncomingCall,
  };
}
