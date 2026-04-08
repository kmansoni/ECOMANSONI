import { useEffect, useMemo, useState } from "react";
import type { Conversation } from "@/hooks/useChat";
import { useE2EEncryption } from "@/hooks/useE2EEncryption";
import { getStringField, parseJsonRecord } from "@/lib/chat/decode";
import { parseEncryptedPayload } from "@/components/chat/chatConversationHelpers";

interface ChatLastMessagePreviewProps {
  conversationId: string;
  lastMessage: Conversation["last_message"];
  isMyMessage: boolean;
  activityText: string | null;
}

export function ChatLastMessagePreview({
  conversationId,
  lastMessage,
  isMyMessage,
  activityText,
}: ChatLastMessagePreviewProps) {
  const encryptedPayload = useMemo(
    () => parseEncryptedPayload(lastMessage?.content),
    [lastMessage?.content],
  );
  const { decryptContent } = useE2EEncryption(conversationId);
  const [decryptedPreview, setDecryptedPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDecryptedPreview(null);

    if (!encryptedPayload || !lastMessage?.sender_id) return;

    const run = async () => {
      const plain = await decryptContent(encryptedPayload, lastMessage.sender_id);
      if (!cancelled) {
        setDecryptedPreview(plain && plain.trim() ? plain : "Зашифрованное сообщение");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [decryptContent, encryptedPayload, lastMessage?.sender_id]);

  const envelopeKind = useMemo(() => {
    const envelope = parseJsonRecord(lastMessage?.content);
    return envelope ? getStringField(envelope, "kind") : null;
  }, [lastMessage?.content]);

  const locationFromContent = useMemo(() => {
    if (lastMessage?.location_lat != null) return true;
    return envelopeKind === "location";
  }, [envelopeKind, lastMessage?.location_lat]);

  const previewText = activityText
    ? activityText
    : lastMessage?.location_lat != null || locationFromContent
      ? "📍 Геолокация"
      : lastMessage?.media_type === "poll" || envelopeKind === "poll"
        ? "📊 Опрос"
      : lastMessage?.media_type === "video_circle"
        ? "🎥 Видеосообщение"
      : lastMessage?.media_type === "voice"
        ? "🎤 Голосовое сообщение"
      : lastMessage?.media_type === "video"
        ? "🎬 Видео"
      : lastMessage?.media_url
        ? "📷 Фото"
      : encryptedPayload
        ? decryptedPreview || "Зашифрованное сообщение"
      : (lastMessage?.content || "Нет сообщений");

  return <>{isMyMessage && !activityText ? `Вы: ${previewText}` : previewText}</>;
}