import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";
import { getOrCreateUserQuickReaction, listQuickReactionCatalog } from "@/lib/stickers-reactions";
import { useMentions, type MentionUser } from "@/hooks/useMentions";
import { parseEncryptedPayload } from "@/components/chat/chatConversationHelpers";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/hooks/useChat";
import type { ReplyKeyboardButton } from "@/components/chat/ReplyKeyboard";
import type { EncryptedPayload } from "@/lib/e2ee/crypto";

interface UseChatDataLoadingParams {
  conversationId: string;
  user: { id: string } | null;
  messages: ChatMessage[];
  isGroup?: boolean;
  decryptContent: (payload: EncryptedPayload, senderId: string) => Promise<string | null>;
  messageRefs: RefObject<Record<string, HTMLDivElement | null>>;
}

export function useChatDataLoading({
  conversationId, user, messages, isGroup,
  decryptContent, messageRefs,
}: UseChatDataLoadingParams) {
  // ── Decrypt cache ──────────────────────────────────────────────
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string | null>>({});
  const decryptInProgressRef = useRef<Set<string>>(new Set());

  const encryptedUndecrypted = useMemo(
    () => messages.filter(
      (m) =>
        (Boolean(m.is_encrypted) || Boolean(parseEncryptedPayload(m.content))) &&
        !(m.id in decryptedCache) &&
        !decryptInProgressRef.current.has(m.id),
    ),
    [messages, decryptedCache],
  );

  useEffect(() => {
    if (!encryptedUndecrypted.length) return;
    for (const m of encryptedUndecrypted) decryptInProgressRef.current.add(m.id);

    let cancelled = false;
    void Promise.all(
      encryptedUndecrypted.map(async (m) => {
        const payload = parseEncryptedPayload(m.content);
        if (!payload) {
          if (!cancelled) setDecryptedCache((prev) => ({ ...prev, [m.id]: null }));
          return;
        }
        try {
          const plain = await decryptContent(payload, m.sender_id);
          if (!cancelled) setDecryptedCache((prev) => ({ ...prev, [m.id]: plain }));
        } catch (err) {
          logger.warn("chat: failed to decrypt message", { messageId: m.id, error: err });
          if (!cancelled) setDecryptedCache((prev) => ({ ...prev, [m.id]: null }));
        } finally {
          decryptInProgressRef.current.delete(m.id);
        }
      }),
    ).catch((err) => logger.error("chat: unexpected decrypt pipeline error", { conversationId, error: err }));
    return () => { cancelled = true; };
  }, [encryptedUndecrypted, decryptContent, conversationId]);

  // ── Hidden messages ────────────────────────────────────────────
  const hiddenKey = user && conversationId ? `chat.hiddenMessages.v1.${user.id}.${conversationId}` : null;
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!hiddenKey) return;
    try {
      const raw = localStorage.getItem(hiddenKey);
      if (!raw) { setHiddenIds(new Set()); return; }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return;
      setHiddenIds(new Set(parsed.filter((x) => typeof x === "string")));
    } catch (error) {
      logger.warn("chat: failed to restore hidden message ids", { hiddenKey, error });
      setHiddenIds(new Set());
    }
  }, [hiddenKey]);

  const persistHiddenIds = useCallback((next: Set<string>) => {
    if (!hiddenKey) return;
    try {
      localStorage.setItem(hiddenKey, JSON.stringify([...next]));
    } catch (error) {
      logger.warn("chat: failed to persist hidden message ids", { hiddenKey, error });
    }
  }, [hiddenKey]);

  const hideMessageForMe = useCallback((messageId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      persistHiddenIds(next);
      return next;
    });
  }, [persistHiddenIds]);

  const visibleMessages = useMemo(() => {
    if (!hiddenIds.size) return messages;
    return messages.filter((m) => !hiddenIds.has(m.id));
  }, [messages, hiddenIds]);

  const scrollToMessage = useCallback((messageId: string) => {
    const el = messageRefs.current?.[messageId];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [messageRefs]);

  // ── Quick reactions ────────────────────────────────────────────
  const [quickReactions, setQuickReactions] = useState<string[]>(["❤️", "🔥", "👍", "😂", "😮", "🎉"]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const [saved, catalog] = await Promise.all([
          getOrCreateUserQuickReaction(user.id),
          listQuickReactionCatalog(),
        ]);
        if (cancelled) return;
        setQuickReactions([saved.emoji, ...catalog.filter((e) => e !== saved.emoji)].slice(0, 8));
      } catch (error) {
        logger.debug("chat: failed to load quick reactions, using defaults", { conversationId, error });
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, conversationId]);

  // ── Sender profiles (group chats) ─────────────────────────────
  const [senderProfiles, setSenderProfiles] = useState<
    Record<string, { display_name: string | null; avatar_url: string | null }>
  >({});

  const senderIdsKey = useMemo(() => {
    if (!isGroup) return "";
    return [...new Set(visibleMessages.map((m) => m.sender_id).filter(Boolean))].sort().join(",");
  }, [isGroup, visibleMessages]);

  useEffect(() => {
    const senderIds = senderIdsKey ? senderIdsKey.split(",") : [];
    if (!isGroup || !senderIds.length) { setSenderProfiles({}); return; }
    let cancelled = false;
    void (async () => {
      try {
        const briefMap = await fetchUserBriefMap(senderIds);
        if (cancelled) return;
        const next: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
        for (const id of senderIds) {
          const brief = resolveUserBrief(id, briefMap);
          if (brief) next[id] = { display_name: brief.display_name, avatar_url: brief.avatar_url };
        }
        setSenderProfiles(next);
      } catch (error) {
        logger.warn("chat: failed to resolve sender profiles", { conversationId, error });
        if (!cancelled) setSenderProfiles({});
      }
    })();
    return () => { cancelled = true; };
  }, [isGroup, senderIdsKey, conversationId]);

  // ── Mention participants ───────────────────────────────────────
  const [mentionParticipants, setMentionParticipants] = useState<MentionUser[]>([]);

  useEffect(() => {
    if (!conversationId || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: partRows } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", conversationId);
        const ids = (partRows ?? []).map((r) => r.user_id as string).filter(Boolean);
        if (!ids.length) return;
        const briefMap = await fetchUserBriefMap(ids);
        if (cancelled) return;
        const participants = ids
          .map((pid) => {
            const brief = resolveUserBrief(pid, briefMap);
            if (!brief) return null;
            return { user_id: pid, display_name: brief.display_name, username: brief.username, avatar_url: brief.avatar_url } as MentionUser;
          })
          .filter(Boolean) as MentionUser[];
        setMentionParticipants(participants);
      } catch (error) {
        logger.warn("chat: failed to load mention participants", { conversationId, error });
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, user]);

  const { renderText } = useMentions(mentionParticipants);

  // ── Bot reply keyboard ─────────────────────────────────────────
  const [replyKeyboard, setReplyKeyboard] = useState<ReplyKeyboardButton[][] | null>(null);

  useEffect(() => {
    if (!visibleMessages.length) return;
    const last = visibleMessages[visibleMessages.length - 1];
    if (!last || last.sender_id === user?.id) return;
    const markup = (last.metadata as Record<string, unknown> | null)?.reply_markup as
      | { keyboard?: ReplyKeyboardButton[][]; remove_keyboard?: boolean }
      | undefined;
    if (!markup) return;
    if (markup.keyboard) setReplyKeyboard(markup.keyboard);
    else if (markup.remove_keyboard) setReplyKeyboard(null);
  }, [visibleMessages, user?.id]);

  return {
    decryptedCache,
    hiddenIds, hideMessageForMe,
    visibleMessages, scrollToMessage,
    quickReactions, senderProfiles,
    mentionParticipants, renderText,
    replyKeyboard,
  };
}
