import { useMemo, useLayoutEffect, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChatMessageItem, type MessageStyleConfig, type MessageCallbacks } from "./ChatMessageItem";
import { AlbumBubble } from "./AlbumBubble";
import { buildAlbumMap } from "@/lib/chat/albumGrouping";

/**
 * Оценка высоты сообщения до реального замера через measureElement.
 * Точная оценка уменьшает скачки скролла при первом рендере и
 * уменьшает overscan-перерисовки в виртуализаторе.
 *
 * Реальные измерения кешируются virtualizer'ом автоматически по data-index,
 * поэтому эта функция работает только на первой отрисовке каждого ряда.
 */
function estimateMessageHeight(msg: any): number {
  if (!msg) return 64;
  const mediaType = msg.media_type as string | null | undefined;

  // Альбомы группируются в ChatMessageList и имеют собственный рендер,
  // здесь оцениваем только индивидуальные сообщения.
  if (mediaType === "voice") return 72;
  if (mediaType === "video_circle") return 240;
  if (mediaType === "sticker" || mediaType === "gif") return 140;
  if (mediaType === "image") return 280;
  if (mediaType === "video") return 280;
  if (mediaType === "gift") return 200;
  if (mediaType === "poll") return 180;
  if (mediaType === "document") return 88;
  if (mediaType === "contact") return 88;
  if (msg.shared_post_id) return 260;
  if (msg.location_lat != null || msg.location_lng != null) return 96;

  // Текст: оценка по длине; учитываем перенос и padding бабла.
  const len = (msg.content?.length ?? 0) | 0;
  if (len > 400) return 180;
  if (len > 200) return 120;
  if (len > 80) return 84;
  return 56;
}

interface MessageListProps {
  messages: any[];
  userId?: string;
  conversationId: string;
  chatAvatar: string | null;
  isGroup?: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  playingVoice: string | null;
  manualMediaLoaded: Set<string>;
  contextMenuMessageId: string | null;
  decryptedCache: Record<string, string | null>;
  senderProfiles: Record<string, any>;
  style: MessageStyleConfig;
  callbacks: MessageCallbacks;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

function SimpleMessageList({
  messages, userId, conversationId, chatAvatar, isGroup,
  selectionMode, selectedIds, playingVoice, manualMediaLoaded,
  contextMenuMessageId, decryptedCache, senderProfiles, style, callbacks, messagesEndRef,
}: MessageListProps) {
  const { albumMap, skipIds } = useMemo(() => buildAlbumMap(messages), [messages]);

  return (
    <>
      <div className="space-y-1 min-w-0">
        {messages.map((message, index) => {
          if (skipIds.has(message.id)) return null;

          const album = albumMap.get(message.id);
          if (album) {
            const lastMsg = album.messages[album.messages.length - 1];
            const urls = album.messages.map((m) => m.media_url!).filter(Boolean);
            const types = album.messages.map((m) =>
              (m.media_type === "video" ? "video" : "image") as "image" | "video",
            );
            const caption = album.messages[0].content !== "📷 Изображение" &&
              album.messages[0].content !== "🎥 Видео"
              ? album.messages[0].content
              : undefined;

            return (
              <AlbumBubble
                key={`album-${album.albumId}`}
                mediaUrls={urls}
                mediaTypes={types}
                caption={caption}
                isOwn={message.sender_id === userId}
                timestamp={lastMsg.created_at}
                isRead={lastMsg.is_read}
                onMediaClick={(idx) => {
                  const url = urls[idx];
                  if (types[idx] === "video") callbacks.onViewVideo?.(url);
                  else callbacks.onViewImage?.(url);
                }}
              />
            );
          }

          return (
            <ChatMessageItem
              key={message.id}
              message={message}
              prevMessage={index > 0 ? messages[index - 1] : null}
              userId={userId}
              conversationId={conversationId}
              chatAvatar={chatAvatar}
              isGroup={isGroup}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              playingVoice={playingVoice}
              manualMediaLoaded={manualMediaLoaded}
              contextMenuMessageId={contextMenuMessageId}
              decryptedCache={decryptedCache}
              senderProfiles={senderProfiles}
              style={style}
              callbacks={callbacks}
            />
          );
        })}
      </div>
      <div ref={messagesEndRef} />
    </>
  );
}

function VirtualizedMessageList({
  messages, userId, conversationId, chatAvatar, isGroup,
  selectionMode, selectedIds, playingVoice, manualMediaLoaded,
  contextMenuMessageId, decryptedCache, senderProfiles, style, callbacks,
  scrollContainerRef, messagesEndRef,
}: MessageListProps) {
  const estimateSize = useCallback(
    (index: number) => estimateMessageHeight(messages[index]),
    [messages],
  );

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize,
    overscan: 8,
  });

  useLayoutEffect(() => {
    if (messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages.length]);

  return (
    <>
      <div
        className="min-w-0"
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const idx = virtualRow.index;
          const msg = messages[idx];
          return (
            <div
              key={msg.id}
              data-index={idx}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ChatMessageItem
                message={msg}
                prevMessage={idx > 0 ? messages[idx - 1] : null}
                userId={userId}
                conversationId={conversationId}
                chatAvatar={chatAvatar}
                isGroup={isGroup}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                playingVoice={playingVoice}
                manualMediaLoaded={manualMediaLoaded}
                contextMenuMessageId={contextMenuMessageId}
                decryptedCache={decryptedCache}
                senderProfiles={senderProfiles}
                style={style}
                callbacks={callbacks}
              />
            </div>
          );
        })}
      </div>
      <div ref={messagesEndRef} />
    </>
  );
}

/** Выбирает простой или виртуализированный рендер */
export function ChatMessageList(props: MessageListProps) {
  if (props.messages.length < 60) return <SimpleMessageList {...props} />;
  return <VirtualizedMessageList {...props} />;
}
