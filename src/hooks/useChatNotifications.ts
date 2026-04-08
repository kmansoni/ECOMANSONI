import { useEffect, useMemo, useRef } from "react";
import type { ChatMessage } from "@/hooks/useChat";
import { logger } from "@/lib/logger";

interface Params {
  conversationId: string;
  user: { id: string } | null;
  messages: ChatMessage[];
  isGroup?: boolean;
  participantCount?: number;
  typingLabel: string | false | null;
  isOtherTyping: boolean;
  otherPresenceText: string;
  markConversationRead: (id: string) => Promise<void>;
  onRefetch?: () => void;
  markAsRead: (id: string) => void;
  markAsDelivered: (ids: string[]) => Promise<void>;
  chatNotifSettings: {
    notifications_enabled: boolean;
    notification_sound: string;
    notification_vibration: boolean;
  };
  globalNotifSettings: {
    in_app_sounds: boolean;
    in_app_vibrate: boolean;
  };
}

export function useChatNotifications({
  conversationId, user, messages, isGroup,
  participantCount, typingLabel, isOtherTyping, otherPresenceText,
  markConversationRead, onRefetch, markAsRead, markAsDelivered,
  chatNotifSettings, globalNotifSettings,
}: Params) {
  const lastNotifiedRef = useRef<string | null>(null);

  const headerStatusText = useMemo(() => {
    if (isGroup) {
      if (typingLabel) return String(typingLabel);
      const n = participantCount || 0;
      return `${n} участник${n === 1 ? "" : n < 5 ? "а" : "ов"}`;
    }
    if (isOtherTyping) return String(typingLabel) || "печатает…";
    return otherPresenceText;
  }, [isGroup, participantCount, isOtherTyping, typingLabel, otherPresenceText]);

  // Mark incoming messages as read
  useEffect(() => {
    if (!conversationId || !user || isGroup) return;
    void (async () => {
      await markConversationRead(conversationId);
      onRefetch?.();
    })();

    const unread = messages.filter((m) => m.sender_id !== user.id && !m.is_read);
    const unreadIds = unread.map((m) => m.id);
    if (unreadIds.length) void markAsDelivered(unreadIds);
    for (const msg of unread) markAsRead(msg.id);
  }, [conversationId, user, isGroup, messages, markConversationRead, onRefetch, markAsRead, markAsDelivered]);

  // Sound & vibration on new incoming message
  useEffect(() => {
    if (!user?.id || !messages.length) return;
    if (!chatNotifSettings.notifications_enabled) return;

    const latest = [...messages].reverse().find((m) => m.sender_id !== user.id && !m.disappeared);
    if (!latest || lastNotifiedRef.current === latest.id) return;
    lastNotifiedRef.current = latest.id;

    if (globalNotifSettings.in_app_sounds && chatNotifSettings.notification_sound !== "none") {
      try {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();

        const freq = chatNotifSettings.notification_sound === "chime" ? 880
          : chatNotifSettings.notification_sound === "pop" ? 660
          : chatNotifSettings.notification_sound === "ding" ? 1046
          : 784;

        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.value = 0.0001;
        osc.connect(g);
        g.connect(ctx.destination);

        const t = ctx.currentTime;
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

        osc.start(t);
        osc.stop(t + 0.2);
        osc.onended = () => void ctx.close();
      } catch (err) {
        logger.debug("chat: sound unavailable", { conversationId, error: err });
      }
    }

    if (globalNotifSettings.in_app_vibrate && chatNotifSettings.notification_vibration && "vibrate" in navigator) {
      try { navigator.vibrate(30); } catch { /* not supported */ }
    }
  }, [messages, user?.id, chatNotifSettings.notifications_enabled, chatNotifSettings.notification_sound, chatNotifSettings.notification_vibration, globalNotifSettings.in_app_sounds, globalNotifSettings.in_app_vibrate]);

  return { headerStatusText };
}
