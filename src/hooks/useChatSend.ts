import { useRef, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { isSingleEmoji } from "@/components/chat/emojiUtils";
import { buildChatBodyEnvelope, sendMessageV1 } from "@/lib/chat/sendMessageV1";
import { getHashtagBlockedToastPayload } from "@/lib/hashtagModeration";
import { getChatSendErrorToast } from "@/lib/chat/sendError";
import { diagnoseDmSendReadiness } from "@/lib/chat/readiness";
import { isChatProtocolV11EnabledForUser } from "@/lib/chat/protocolV11";
import { toCompactErrorDetails } from "@/components/chat/chatConversationHelpers";
import { detectInlineBotTrigger } from "@/components/chat/inlineBotTrigger";
import { detectMentionTrigger } from "@/hooks/useMentions";
import { supabase } from "@/integrations/supabase/client";
import type { EncryptedPayload } from "@/lib/e2ee/crypto";
import type { MessageEffectType } from "@/components/chat/MessageEffectOverlay";

const MAX_MESSAGE_CHARS = 4096;

interface UseChatSendParams {
  conversationId: string;
  user: { id: string } | null;
  inputText: string;
  setInputText: React.Dispatch<React.SetStateAction<string>>;
  editingMessage: { id: string; content: string } | null;
  setEditingMessage: (v: { id: string; content: string } | null) => void;
  editMessage?: (id: string, content: string) => Promise<{ error?: unknown }>;
  replyTo: { id: string; preview: string } | null;
  setReplyTo: (v: { id: string; preview: string } | null) => void;
  setQuotedText: (v: string | null) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  setIsSending: (v: boolean) => void;
  setLastSentEmoji: (v: string | null) => void;
  isSilentSend: boolean;
  setIsSilentSend: (v: boolean) => void;
  setActiveEffect: (v: MessageEffectType | null) => void;
  clearDraft: (id: string) => void;
  sendMessage: (content: string, opts?: Record<string, unknown>) => Promise<unknown>;
  sendTyping: (isTyping: boolean, activity?: "typing" | "recording_voice" | "recording_video") => void;
  encryptionEnabled: boolean;
  encryptContent: (text: string) => Promise<EncryptedPayload | null>;
  enrichMessageWithDisappear: (fields: Record<string, unknown>) => Record<string, unknown>;
  // handleInputChange deps
  setInlineBotTrigger: (v: { botUsername: string; query: string } | null) => void;
  setMentionTrigger: (v: { query: string; triggerStart: number } | null) => void;
  setMentionActiveIndex: (v: number) => void;
  typingOnKeyDown: () => void;
}

export function useChatSend({
  conversationId, user,
  inputText, setInputText,
  editingMessage, setEditingMessage, editMessage,
  replyTo, setReplyTo, setQuotedText,
  inputRef, setIsSending,
  setLastSentEmoji, isSilentSend, setIsSilentSend,
  setActiveEffect, clearDraft,
  sendMessage, sendTyping,
  encryptionEnabled, encryptContent, enrichMessageWithDisappear,
  setInlineBotTrigger, setMentionTrigger, setMentionActiveIndex, typingOnKeyDown,
}: UseChatSendParams) {
  const sendingFingerprintsRef = useRef(new Set<string>());
  const draftClientMsgIdRef = useRef<string>(crypto.randomUUID());
  const lastDraftTrimmedRef = useRef<string>("");
  const pendingEffectRef = useRef<MessageEffectType | null>(null);

  const handleInputChange = useCallback(
    (value: string, caretPos?: number) => {
      setInputText(value);

      const trimmed = value.trim();
      if (trimmed !== lastDraftTrimmedRef.current) {
        lastDraftTrimmedRef.current = trimmed;
        draftClientMsgIdRef.current = crypto.randomUUID();
      }

      setInlineBotTrigger(detectInlineBotTrigger(value));

      const caret = caretPos ?? value.length;
      const trigger = detectMentionTrigger(value, caret);
      setMentionTrigger(trigger);
      setMentionActiveIndex(0);

      typingOnKeyDown();
    },
    [setInputText, setInlineBotTrigger, setMentionTrigger, setMentionActiveIndex, typingOnKeyDown],
  );

  const handleSendMessage = async (silent = false, overrideText?: string) => {
    const trimmed = (overrideText ?? inputText).trim();
    if (!trimmed) {
      sendTyping(false);
      return;
    }

    if (editingMessage) {
      const editing = editingMessage;
      setEditingMessage(null);
      setInputText("");
      sendTyping(false);
      const result = await editMessage?.(editing.id, trimmed);
      if (result?.error) {
        toast.error("Не удалось отредактировать сообщение. Попробуйте снова.");
        setEditingMessage(editing);
        setInputText(trimmed);
      }
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }

    const fingerprint = `${conversationId}:${trimmed}`;
    if (sendingFingerprintsRef.current.has(fingerprint)) return;

    const reply = replyTo;
    const withReply = reply ? `↩️ Ответ на сообщение:\n${reply.preview}\n\n${trimmed}` : trimmed;
    const clientMsgId = draftClientMsgIdRef.current;

    sendingFingerprintsRef.current.add(fingerprint);
    setIsSending(true);

    setInputText("");
    setReplyTo(null);
    setQuotedText(null);
    sendTyping(false);
    clearDraft(conversationId);

    draftClientMsgIdRef.current = crypto.randomUUID();
    lastDraftTrimmedRef.current = "";

    try {
      let contentToSend = withReply;
      let extraFields: Record<string, unknown> = {};
      if (encryptionEnabled) {
        const encrypted = await encryptContent(withReply);
        if (!encrypted) {
          sendingFingerprintsRef.current.delete(fingerprint);
          setIsSending(false);
          setInputText(trimmed);
          setReplyTo(reply);
          draftClientMsgIdRef.current = clientMsgId;
          lastDraftTrimmedRef.current = trimmed;
          toast.error("Шифрование недоступно", {
            description: "Ключ E2EE не готов. Подождите или отключите сквозное шифрование.",
          });
          return;
        }
        contentToSend = JSON.stringify(encrypted);
        extraFields = {
          is_encrypted: true,
          encryption_iv: encrypted.iv,
          encryption_key_version: encrypted.epoch,
        };
      }

      const effectToSend = pendingEffectRef.current;
      if (effectToSend) {
        contentToSend = buildChatBodyEnvelope({
          kind: 'text',
          text: contentToSend,
          message_effect: effectToSend,
        });
      }

      await sendMessage(contentToSend, {
        clientMsgId,
        ...(silent ? { is_silent: true } : {}),
        ...enrichMessageWithDisappear(extraFields),
      });
      if (isSingleEmoji(trimmed)) {
        setLastSentEmoji(trimmed);
      }
      if (silent) {
        setIsSilentSend(false);
      }

      if (effectToSend) {
        pendingEffectRef.current = null;
        setActiveEffect(effectToSend);
      }

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } catch (error) {
      const compactErr = toCompactErrorDetails(error);
      logger.error("chat: handleSendMessage failed", {
        conversationId,
        error,
        errorCode: compactErr.code || undefined,
        errorStatus: compactErr.status ?? undefined,
        errorMessage: compactErr.message,
      });
      const payload = getHashtagBlockedToastPayload(error);
      if (payload) {
        setInputText(trimmed);
        setReplyTo(reply);
        draftClientMsgIdRef.current = clientMsgId;
        lastDraftTrimmedRef.current = trimmed;
        toast.error(payload.title, { description: payload.description });
      } else {
        if (compactErr.message.startsWith("CHAT_MESSAGE_TOO_LONG:")) {
          const current = Number(compactErr.message.split(":")[1] || 0);
          toast.error("Сообщение слишком длинное", {
            description: `Лимит: ${MAX_MESSAGE_CHARS} символов (сейчас ${current})`,
          });
          return;
        }

        const sendPayload = getChatSendErrorToast(error);
        if (sendPayload) {
          setInputText(trimmed);
          setReplyTo(reply);
          draftClientMsgIdRef.current = clientMsgId;
          lastDraftTrimmedRef.current = trimmed;
          toast.error(sendPayload.title, { description: sendPayload.description });
          return;
        }

        setInputText(trimmed);
        setReplyTo(reply);
        draftClientMsgIdRef.current = clientMsgId;
        lastDraftTrimmedRef.current = trimmed;
        const diagnostic = await diagnoseDmSendReadiness({
          supabase,
          userId: user?.id,
          conversationId,
          expectV11: isChatProtocolV11EnabledForUser(user?.id),
        });
        const reasonHint = [
          compactErr.code ? `code=${compactErr.code}` : null,
          compactErr.status != null ? `status=${compactErr.status}` : null,
          compactErr.message ? compactErr.message : null,
        ]
          .filter(Boolean)
          .join("; ");
        toast.error("Не удалось отправить сообщение", {
          description: diagnostic || reasonHint || undefined,
        });
      }
    } finally {
      sendingFingerprintsRef.current.delete(fingerprint);
      setIsSending(false);
    }
  };

  const sendWithEffect = (effect: MessageEffectType) => {
    pendingEffectRef.current = effect;
    void handleSendMessage(false);
  };

  const handleStickerSend = useCallback(async (fileUrl: string) => {
    if (!conversationId || !user) return;
    const envelope = buildChatBodyEnvelope({ kind: 'sticker', media_url: fileUrl });
    try {
      await sendMessageV1({ conversationId, clientMsgId: crypto.randomUUID(), body: envelope });
    } catch (e) {
      toast.error("Не удалось отправить");
      logger.error("chat: send sticker failed", { conversationId, error: e });
    }
  }, [conversationId, user]);

  const handleGifSend = useCallback(async (gifUrl: string) => {
    if (!conversationId || !user) return;
    const envelope = buildChatBodyEnvelope({ kind: 'gif', media_url: gifUrl });
    try {
      await sendMessageV1({ conversationId, clientMsgId: crypto.randomUUID(), body: envelope });
    } catch (e) {
      toast.error("Не удалось отправить");
      logger.error("chat: send gif failed", { conversationId, error: e });
    }
  }, [conversationId, user]);

  return { handleSendMessage, handleInputChange, sendWithEffect, handleStickerSend, handleGifSend };
}
