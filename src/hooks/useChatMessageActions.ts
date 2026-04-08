import { useState, useCallback } from "react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/hooks/useChat";

interface MessageActionDeps {
  conversationId: string;
  userId?: string;
  messages: ChatMessage[];
  visibleMessages: ChatMessage[];
  pinnedMessages: Array<{ message_id: string }>;
  pinMessage: (id: string) => Promise<void>;
  unpinMessage: (id: string) => Promise<void>;
  toggleReaction: (id: string, emoji: string) => Promise<void>;
  saveToSavedMessages: (data: {
    original_message_id: string;
    content: string;
    media_url: string | null;
    media_type: string | null;
    original_chat_id: string;
  }) => Promise<void>;
  removeSavedByOriginalId: (id: string) => Promise<void>;
  translate: (id: string, text: string, targetLang: string) => Promise<{ translatedText?: string } | null>;
  hideMessageForMe: (id: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  setEditingMessage: (v: { id: string; content: string } | null) => void;
  setInputText: (v: string) => void;
  setReplyTo: (v: { id: string; preview: string } | null) => void;
}

export function useChatMessageActions(deps: MessageActionDeps) {
  const {
    conversationId, userId, messages, visibleMessages,
    pinnedMessages, pinMessage, unpinMessage,
    toggleReaction, saveToSavedMessages, removeSavedByOriginalId,
    translate, hideMessageForMe, inputRef,
    setEditingMessage, setInputText, setReplyTo,
  } = deps;

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; messageId: string | null }>({ open: false, messageId: null });
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);

  const handleMessageDelete = useCallback((messageId: string) => {
    setDeleteDialog({ open: true, messageId });
  }, []);

  const handleMessagePin = useCallback(async (messageId: string) => {
    if (!conversationId || !userId) return;
    const alreadyPinned = pinnedMessages.some((p) => p.message_id === messageId);
    if (alreadyPinned) await unpinMessage(messageId);
    else await pinMessage(messageId);
  }, [conversationId, userId, pinnedMessages, pinMessage, unpinMessage]);

  const handleMessageReaction = useCallback(async (messageId: string, emoji: string) => {
    await toggleReaction(messageId, emoji);
  }, [toggleReaction]);

  const handleMessageEdit = useCallback((messageId: string, content: string) => {
    setEditingMessage({ id: messageId, content });
    setInputText(content);
    setReplyTo(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [setEditingMessage, setInputText, setReplyTo, inputRef]);

  const handleMessageReply = useCallback((messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    const preview = (msg.content || "").trim().slice(0, 140);
    setReplyTo({ id: msg.id, preview });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [messages, setReplyTo, inputRef]);

  const handleMessageForward = useCallback((messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    setForwardMessage(msg);
    setForwardOpen(true);
  }, [messages]);

  const handleMessageSelect = useCallback((messageId: string) => {
    setSelectionMode(true);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
  }, []);

  const handleMessageSave = useCallback(async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    await saveToSavedMessages({
      original_message_id: msg.id,
      content: msg.content ?? "",
      media_url: msg.media_url ?? null,
      media_type: msg.media_type ?? null,
      original_chat_id: conversationId,
    });
  }, [messages, conversationId, saveToSavedMessages]);

  const handleMessageUnsave = useCallback(async (messageId: string) => {
    await removeSavedByOriginalId(messageId);
  }, [removeSavedByOriginalId]);

  const handleMessageTranslate = useCallback(async (messageId: string, text: string) => {
    const source = text.trim();
    if (!source) return;
    const result = await translate(messageId, source, "ru");
    if (!result?.translatedText) {
      toast.error("Не удалось перевести сообщение");
      return;
    }
    const preview = result.translatedText.length > 140
      ? `${result.translatedText.slice(0, 140)}...`
      : result.translatedText;
    toast.success(preview);
  }, [translate]);

  const toggleSelected = useCallback((messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const deleteSelectedForMe = useCallback(() => {
    selectedIds.forEach((id) => hideMessageForMe(id));
    toast.success("Удалено у вас");
    clearSelection();
  }, [selectedIds, hideMessageForMe, clearSelection]);

  const copySelected = useCallback(async () => {
    const parts = visibleMessages
      .filter((m) => selectedIds.has(m.id))
      .map((m) => m.content)
      .filter(Boolean);
    try {
      await navigator.clipboard.writeText(parts.join("\n\n"));
      toast.success("Скопировано");
    } catch (err) {
      logger.warn("chat: failed to copy selected messages", { conversationId, count: selectedIds.size, error: err });
      toast.error("Не удалось скопировать");
    }
  }, [visibleMessages, selectedIds, conversationId]);

  return {
    selectionMode, selectedIds,
    deleteDialog, setDeleteDialog,
    forwardOpen, setForwardOpen, forwardMessage,
    handleMessageDelete,
    handleMessagePin,
    handleMessageReaction,
    handleMessageEdit,
    handleMessageReply,
    handleMessageForward,
    handleMessageSelect,
    handleMessageSave,
    handleMessageUnsave,
    handleMessageTranslate,
    toggleSelected,
    clearSelection,
    deleteSelectedForMe,
    copySelected,
  };
}
