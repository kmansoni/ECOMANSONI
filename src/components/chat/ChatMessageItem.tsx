/**
 * src/components/chat/ChatMessageItem.tsx
 *
 * Renders a single chat message bubble (text, voice, image, video, sticker,
 * gif, gift, poll, document, self-destruct, shared post, video circle).
 * Extracted from ChatConversation.tsx renderMessages.map() body.
 */
import { Fragment, useMemo } from "react";
import { Play, Pause, CheckCheck, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { BubbleTail } from "./BubbleTail";
import { DateSeparator } from "./FloatingDate";
import { SwipeableMessage } from "./SwipeableMessage";
import { MessageHoverActions } from "./MessageHoverActions";
import { DoubleTapReaction } from "./DoubleTapReaction";
import { MessageReactions } from "./MessageReactions";
import { DisappearCountdown } from "./DisappearCountdown";
import { MessageStatus } from "./MessageStatus";
import { EncryptionBadge } from "./EncryptionBadge";
import { LinkPreview } from "./LinkPreview";
import { VideoCircleMessage } from "./VideoCircleMessage";
import { StickerMessage } from "./StickerMessage";
import { GifMessage } from "./GifMessage";
import { GiftMessage } from "./GiftMessage";
import { PollMessage } from "./PollMessage";
import { ContactCard } from "./ContactCard";
import { DocumentBubble } from "./DocumentBubble";
import { MusicMessage } from "./MusicMessage";
import { SelfDestructMedia } from "./SelfDestructMedia";
import { SharedPostCard } from "./SharedPostCard";
import { VideoPlayer } from "./VideoPlayer";
import { extractUrls } from "@/hooks/useLinkPreview";
import { sanitizeReceivedText } from "@/lib/text-encoding";
import { logger } from "@/lib/logger";
import type { ChatMessage } from "@/hooks/useChat";
import type { DeliveryStatus } from "@/hooks/useReadReceipts";
import {
  parseEncryptedPayload,
  formatTime,
  formatMessageTime,
  normalizeBrokenVerticalText,
} from "./chatConversationHelpers";

// ── Types ──────────────────────────────────────────────────────────────

interface MessageStyleConfig {
  bubbleClass: string;
  densityStyles: {
    gap: string;
    avatarSize: string;
    fontSize: string;
  };
  fontSizeSetting: "small" | "medium" | "large" | undefined;
  bubbleStyleSetting: "classic" | "minimal" | "modern" | undefined;
  messageCornerRadius: number;
  autoDownloadPhotos: boolean;
  autoDownloadVideos: boolean;
  mediaTapEnabled: boolean;
  linkPreviewEnabled: boolean;
}

interface MessageCallbacks {
  onReply: (messageId: string) => void;
  onDelete: (messageId: string) => Promise<void>;
  onReaction: (messageId: string, emoji: string) => void;
  onLongPressStart: (id: string, content: string, isOwn: boolean, e: React.MouseEvent | React.TouchEvent) => void;
  onLongPressEnd: () => void;
  onManualLoad: (messageId: string) => void;
  onViewImage: (url: string) => void;
  onViewVideo: (url: string) => void;
  toggleSelected: (messageId: string) => void;
  getReactions: (messageId: string) => Array<{ emoji: string; hasReacted: boolean; count: number }>;
  getMessageStatus: (messageId: string) => DeliveryStatus;
  toggleVoicePlay: (messageId: string, url?: string) => void;
  cycleVoiceSpeed: () => void;
  voicePlaybackRate: number;
  getWaveformHeights: (messageId: string) => number[];
  renderText: (text: string, userId?: string) => React.ReactNode;
}

export interface ChatMessageItemProps {
  message: ChatMessage;
  prevMessage: ChatMessage | null;
  userId: string | undefined;
  conversationId: string;
  chatAvatar: string | null;
  isGroup?: boolean;
  selectionMode: boolean;
  selectedIds: Set<string>;
  playingVoice: string | null;
  manualMediaLoaded: Set<string>;
  contextMenuMessageId: string | null;
  decryptedCache: Record<string, string | null>;
  senderProfiles: Record<string, { display_name: string | null; avatar_url: string | null }>;
  style: MessageStyleConfig;
  callbacks: MessageCallbacks;
}

// ── Component ──────────────────────────────────────────────────────────

export function ChatMessageItem({
  message,
  prevMessage,
  userId,
  conversationId,
  chatAvatar,
  isGroup,
  selectionMode,
  selectedIds,
  playingVoice,
  manualMediaLoaded,
  contextMenuMessageId,
  decryptedCache,
  senderProfiles,
  style,
  callbacks,
}: ChatMessageItemProps) {
  const isOwn = message.sender_id === userId;
  const senderProfile = senderProfiles[message.sender_id];
  const senderName = senderProfile?.display_name?.trim() || String(message.sender_id || "").slice(0, 8);
  const senderAvatar = senderProfile?.avatar_url || chatAvatar;

  const isVoice = message.media_type === "voice";
  const isVideoCircle = message.media_type === "video_circle";
  const isImage = message.media_type === "image";
  const isVideo = message.media_type === "video";
  const isSticker = message.media_type === "sticker";
  const isGif = message.media_type === "gif";
  const isGift = message.media_type === "gift";
  const isPoll = message.media_type === "poll" && !!message.poll_id;
  const isContact = message.media_type === "contact";
  const parsedLocationFromContent = useMemo(() => {
    if (message.location_lat != null) return null;
    try {
      const p = message.content && JSON.parse(message.content);
      if (p?.kind === 'location' && typeof p.lat === 'number') return p as { lat: number; lng: number };
    } catch { logger.debug("chat: content is not location JSON", { messageId: message.id }); }
    return null;
  }, [message.content, message.location_lat]);
  const isLocation = !message.media_type && (
    (message.location_lat != null && message.location_lng != null) || parsedLocationFromContent != null
  );
  const AUDIO_EXTENSIONS = /\.(mp3|ogg|flac|wav|aac|m4a|wma|opus)$/i;
  const isMusic = message.media_type === "document" && !!message.media_url &&
    !!message.file_name && AUDIO_EXTENSIONS.test(message.file_name);
  const isSharedPost = !!message.shared_post_id;
  const isSelfDestruct =
    message.metadata?.self_destruct === true ||
    ((message.ttl_seconds ?? 0) > 0 && (isImage || isVideo));
  const isDocument =
    !!message.media_url &&
    !!message.media_type &&
    !["voice", "video_circle", "image", "video", "sticker", "gif", "gift", "poll", "contact"].includes(message.media_type) &&
    !isMusic &&
    (message.media_type.startsWith("application/") ||
      message.media_type.startsWith("text/") ||
      message.media_type === "document");
  const isRead = message.is_read;

  const { bubbleClass, densityStyles, fontSizeSetting, bubbleStyleSetting, messageCornerRadius, autoDownloadPhotos, autoDownloadVideos, mediaTapEnabled, linkPreviewEnabled } = style;
  const { onReply, onDelete, onReaction, onLongPressStart, onLongPressEnd, onManualLoad, onViewImage, onViewVideo, toggleSelected: toggleSel, getReactions, getMessageStatus, toggleVoicePlay, cycleVoiceSpeed, voicePlaybackRate, getWaveformHeights, renderText } = callbacks;

  const textSizeClass =
    fontSizeSetting === "small"
      ? "text-[13px]"
      : fontSizeSetting === "large"
        ? "text-[17px]"
        : densityStyles.fontSize;

  const bubbleTailClass =
    bubbleStyleSetting === "classic"
      ? isOwn ? "rounded-br-xl" : "rounded-bl-xl"
      : bubbleStyleSetting === "minimal"
        ? "rounded-lg"
        : isOwn ? "rounded-br-sm" : "rounded-bl-sm";

  const effectiveBubbleRadius =
    bubbleStyleSetting === "classic"
      ? Math.max(messageCornerRadius, 18)
      : bubbleStyleSetting === "minimal"
        ? Math.min(messageCornerRadius, 12)
        : messageCornerRadius;

  const shouldTreatAsEncrypted =
    Boolean(message.is_encrypted) || Boolean(parseEncryptedPayload(message.content));
  const hasDecryptedEntry = Object.prototype.hasOwnProperty.call(decryptedCache, message.id);

  const showAvatar = !isOwn && (!prevMessage || prevMessage.sender_id !== message.sender_id);
  const showSenderName = isGroup && !isOwn && showAvatar;
  const isFirstInGroup = !prevMessage || prevMessage.sender_id !== message.sender_id;

  const msgDate = new Date(message.created_at);
  const prevMsgDate = prevMessage ? new Date(prevMessage.created_at) : null;
  const showDateSeparator =
    !prevMsgDate ||
    msgDate.getFullYear() !== prevMsgDate.getFullYear() ||
    msgDate.getMonth() !== prevMsgDate.getMonth() ||
    msgDate.getDate() !== prevMsgDate.getDate();
  const dateSepId = `${msgDate.getFullYear()}-${String(msgDate.getMonth() + 1).padStart(2, "0")}-${String(msgDate.getDate()).padStart(2, "0")}`;

  const isInContextMenu = contextMenuMessageId === message.id;

  const requiresManualLoad =
    (isImage && !!message.media_url && !autoDownloadPhotos) ||
    ((isVideo || isVideoCircle) && !!message.media_url && !autoDownloadVideos);
  const isManuallyLoaded = manualMediaLoaded.has(message.id);

  // ── Manual load placeholder ──────────────────────────────────────
  const renderManualLoadPlaceholder = (label: string) => (
    <div
      className={cn(
        "chat-bubble inline-block max-w-[min(75%,560px)] rounded-2xl px-4 py-3 backdrop-blur-xl border border-white/10",
        isOwn ? "bg-white/10 text-white rounded-br-md" : "bg-white/5 text-white rounded-bl-md",
      )}
      style={{ borderRadius: `${messageCornerRadius}px` }}
    >
      <p className="text-sm text-white/80">{label}</p>
      <Button variant="secondary" className="mt-2" onClick={() => onManualLoad(message.id)}>
        Загрузить
      </Button>
    </div>
  );

  // ── Timestamp + status row ───────────────────────────────────────
  const renderTimestamp = (extraClass?: string) => (
    <div className={cn("mt-0.5 flex items-center gap-1 px-1", extraClass ?? (isOwn ? "self-end" : "self-start"))}>
      <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
      {message.is_silent && <span className="text-[11px]" title="Отправлено без звука">🔕</span>}
      {message.edited_at && <span className="text-[10px] text-white/40 italic">ред.</span>}
      {message.disappear_at && message.disappear_in_seconds && !message.disappeared && (
        <DisappearCountdown disappearAt={message.disappear_at} disappearInSeconds={message.disappear_in_seconds} />
      )}
      {isOwn && <MessageStatus status={getMessageStatus(message.id)} />}
    </div>
  );

  // ── Timestamp (10px for stickers/gifs) ───────────────────────────
  const renderSmallTimestamp = () => (
    <div className={cn("flex items-center gap-1", isOwn ? "justify-end" : "justify-start")}>
      <span className="text-[10px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
      {isOwn && <CheckCheck className={cn("w-4 h-4", isRead ? "text-[#6ab3f3]" : "text-white/40")} />}
    </div>
  );

  // ── Message content ──────────────────────────────────────────────
  const renderContent = () => {
    if (isPoll && message.poll_id) {
      return <PollMessage pollId={message.poll_id} conversationId={conversationId} isOwn={isOwn} />;
    }

    if (isSharedPost && message.shared_post_id) {
      return (
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <SharedPostCard
            postId={message.shared_post_id}
            isOwn={isOwn}
            messageId={message.id}
            onDelete={(msgId) => onDelete(msgId)}
          />
          <div className={cn("flex items-center gap-1", isOwn ? "justify-end" : "justify-start")}>
            <span className="text-[11px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
            {isOwn && <CheckCheck className={cn("w-4 h-4", isRead ? "text-[#6ab3f3]" : "text-white/40")} />}
          </div>
        </div>
      );
    }

    if (isVideoCircle && message.media_url) {
      return (
        <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
          {requiresManualLoad && !isManuallyLoaded ? (
            renderManualLoadPlaceholder("Видео")
          ) : (
            <VideoCircleMessage videoUrl={message.media_url} duration={String(message.duration_seconds || 0)} isOwn={isOwn} />
          )}
          {renderTimestamp()}
        </div>
      );
    }

    if (isSticker && message.media_url) {
      return (
        <div className={cn("flex flex-col gap-1", isOwn ? "items-end" : "items-start")}>
          <StickerMessage
            fileUrl={message.media_url}
            fileType="webp"
            onReply={() => onReply(message.id)}
            onDelete={() => onDelete(message.id)}
          />
          {renderSmallTimestamp()}
        </div>
      );
    }

    if (isGif && message.media_url) {
      return (
        <div className={cn("flex flex-col gap-1", isOwn ? "items-end" : "items-start")}>
          <GifMessage gifUrl={message.media_url} />
          {renderSmallTimestamp()}
        </div>
      );
    }

    if (isGift) {
      let giftData: Record<string, unknown> = {};
      try { giftData = JSON.parse(message.content || "{}"); } catch (error) { logger.warn("chat: invalid gift payload", { conversationId, messageId: message.id, error }); }
      return (
        <div className="flex-1 min-w-0">
          <GiftMessage
            sentGiftId={String(giftData.sent_gift_id ?? "")}
            giftId={String(giftData.gift_id ?? "")}
            giftEmoji={String(giftData.gift_emoji ?? "🎁")}
            giftName={String(giftData.gift_name ?? "Подарок")}
            giftRarity={String(giftData.gift_rarity ?? "common") as "common" | "rare" | "epic" | "legendary"}
            starsSpent={Number(giftData.stars_spent ?? 0)}
            senderName={senderName}
            messageText={giftData.message_text != null ? String(giftData.message_text) : undefined}
            isOwn={isOwn}
            isOpened={Boolean(giftData.is_opened ?? false)}
            isRecipient={!isOwn}
          />
          <div className={cn("flex items-center gap-1 px-2", isOwn ? "justify-end" : "justify-start")}>
            <span className="text-[10px] text-muted-foreground dark:text-white/50">{formatMessageTime(message.created_at)}</span>
            {isOwn && <CheckCheck className={cn("w-4 h-4", isRead ? "text-[#6ab3f3]" : "text-white/40")} />}
          </div>
        </div>
      );
    }

    if (isContact) {
      let contactData: { name?: string; phone?: string } = {};
      try { contactData = JSON.parse(message.content || "{}"); } catch { logger.debug("chat: invalid contact JSON", { messageId: message.id }); }
      return (
        <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
          <ContactCard name={contactData.name || "Контакт"} phone={contactData.phone || ""} />
          {renderTimestamp()}
        </div>
      );
    }

    if (isLocation) {
      const lat = message.location_lat ?? parsedLocationFromContent?.lat;
      const lng = message.location_lng ?? parsedLocationFromContent?.lng;
      if (lat == null || lng == null) return null;
      return (
        <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur-xl border border-white/10 min-w-[200px] hover:bg-white/10 transition-colors",
              isOwn ? "bg-white/10" : "bg-white/5"
            )}
          >
            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
              <MapPin className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">📍 Геолокация</p>
              <p className="text-xs text-white/50">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
            </div>
          </a>
          {renderTimestamp()}
        </div>
      );
    }

    if (isMusic && message.media_url) {
      return (
        <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
          <MusicMessage
            fileUrl={message.media_url}
            fileName={message.file_name ?? "audio"}
            isOwn={isOwn}
          />
          {renderTimestamp()}
        </div>
      );
    }

    if (isDocument && message.media_url) {
      return (
        <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
          <DocumentBubble
            fileName={message.file_name ?? message.media_url.split("/").pop() ?? "file"}
            fileUrl={message.media_url}
            fileSize={message.file_size ?? 0}
            mimeType={message.media_type ?? undefined}
          />
          {renderTimestamp()}
        </div>
      );
    }

    if (isImage && message.media_url && isSelfDestruct) {
      return (
        <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
          <SelfDestructMedia
            mediaUrl={message.media_url}
            mediaType="image"
            ttlSeconds={message.ttl_seconds || 10}
            alreadyViewed={message.metadata?.viewed === true}
          />
          {renderTimestamp()}
        </div>
      );
    }

    if (isImage && message.media_url) {
      if (requiresManualLoad && !isManuallyLoaded) {
        return (
          <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
            <div
              className={cn(
                "chat-bubble inline-block max-w-[min(75%,560px)] rounded-2xl px-4 py-3 backdrop-blur-xl border border-white/10",
                isOwn ? "rounded-br-md bg-white/10" : "rounded-bl-md bg-white/5",
              )}
              style={{
                borderRadius: `${messageCornerRadius}px`,
                boxShadow: isOwn
                  ? "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.25)"
                  : "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.2)",
              }}
            >
              <p className="text-sm text-white/80">Фото</p>
              <Button variant="secondary" className="mt-2" onClick={() => onManualLoad(message.id)}>
                Загрузить
              </Button>
            </div>
            {renderTimestamp()}
          </div>
        );
      }
      return (
        <div className={cn("flex flex-col gap-1 flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
          <div
            className={cn(
              "chat-bubble inline-block media-frame media-frame--chat rounded-2xl backdrop-blur-xl",
              mediaTapEnabled && "cursor-pointer",
              isOwn ? "rounded-br-md bg-white/10 border border-white/10" : "rounded-bl-md bg-white/5 border border-white/10",
            )}
            style={{
              borderRadius: `${messageCornerRadius}px`,
              boxShadow: isOwn
                ? "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.25)"
                : "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={() => {
              if (mediaTapEnabled) onViewImage(message.media_url!);
            }}
          >
            <img src={message.media_url} alt="Изображение" className="media-object" />
          </div>
          {renderTimestamp()}
        </div>
      );
    }

    if (isVideo && message.media_url) {
      return (
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          {requiresManualLoad && !isManuallyLoaded ? (
            <div
              className={cn(
                "chat-bubble inline-block max-w-[min(75%,560px)] rounded-2xl px-4 py-3 backdrop-blur-xl border border-white/10",
                isOwn ? "rounded-br-md bg-white/10" : "rounded-bl-md bg-white/5",
              )}
              style={{ borderRadius: `${messageCornerRadius}px` }}
            >
              <p className="text-sm text-white/80">Видео</p>
              <Button variant="secondary" className="mt-2" onClick={() => onManualLoad(message.id)}>
                Загрузить
              </Button>
            </div>
          ) : (
            <VideoPlayer
              src={message.media_url}
              isOwn={isOwn}
              onFullscreen={() => onViewVideo(message.media_url!)}
            />
          )}
          {renderTimestamp()}
        </div>
      );
    }

    // ── Default: text bubble ──────────────────────────────────────
    return (
      <DoubleTapReaction
        messageId={message.id}
        onToggleReaction={onReaction}
        disabled={selectionMode}
        hasReaction={getReactions(message.id).some((r) => r.emoji === "❤️" && r.hasReacted)}
      >
        <div className={cn("flex flex-col flex-1 min-w-0", isOwn ? "items-end" : "items-start")}>
          <div
            className={cn(
              "chat-bubble relative inline-block min-w-[64px] max-w-[min(75%,560px)] rounded-2xl px-3 py-2 select-none backdrop-blur-xl border border-white/10",
              isOwn ? `${bubbleClass} text-white ${bubbleTailClass}` : `bg-white/5 text-white ${bubbleTailClass}`,
              selectionMode && selectedIds.has(message.id) && "ring-2 ring-white/30",
            )}
            style={{
              borderRadius: `${effectiveBubbleRadius}px`,
              boxShadow: isOwn
                ? "inset 0 1px 0 rgba(255,255,255,0.15), 0 4px 20px rgba(0,0,0,0.25)"
                : "inset 0 1px 0 rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.2)",
            }}
            onClick={() => {
              if (selectionMode) toggleSel(message.id);
            }}
            onMouseDown={(e) => {
              if (selectionMode) return;
              onLongPressStart(message.id, message.content, isOwn, e);
            }}
            onMouseUp={onLongPressEnd}
            onMouseLeave={onLongPressEnd}
            onTouchStart={(e) => {
              if (selectionMode) return;
              onLongPressStart(message.id, message.content, isOwn, e);
            }}
            onTouchEnd={onLongPressEnd}
          >
            {/* Forward label */}
            {message.content?.startsWith("↪ Переслано от") && (
              <p className="text-[11px] font-medium text-[#6ab3f3]/70 mb-0.5 italic">
                {message.content.split("\n")[0]}
              </p>
            )}
            {showSenderName && (
              <p className="text-[13px] font-medium text-[#6ab3f3] mb-0.5">{senderName}</p>
            )}

            {isVoice ? (
              <div className="flex items-center gap-3 min-w-[180px]">
                <button
                  className="w-10 h-10 shrink-0 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/15 transition-colors"
                  onClick={() => toggleVoicePlay(message.id, message.media_url || undefined)}
                >
                  {playingVoice === message.id ? (
                    <Pause className="w-5 h-5 text-white" />
                  ) : (
                    <Play className="w-5 h-5 text-white ml-0.5" />
                  )}
                </button>
                <div className="flex-1 flex items-center gap-[2px]">
                  {getWaveformHeights(message.id).map((height, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-[3px] rounded-full transition-all duration-150",
                        playingVoice === message.id ? "bg-white/80" : "bg-white/40",
                      )}
                      style={{
                        height: `${height}px`,
                        animationDelay: playingVoice === message.id ? `${i * 50}ms` : undefined,
                      }}
                    />
                  ))}
                </div>
                <span className="text-xs text-white/60 font-medium">
                  {message.duration_seconds ? formatTime(message.duration_seconds) : "0:00"}
                </span>
                {playingVoice === message.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); cycleVoiceSpeed(); }}
                    className="ml-1 px-1.5 py-0.5 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-[10px] text-white font-bold tabular-nums min-w-[32px]"
                  >
                    {voicePlaybackRate}x
                  </button>
                )}
              </div>
            ) : message.disappeared ? (
              <p className="text-[14px] italic text-white/40 flex items-center gap-1">
                <span>👻</span>
                <span>Сообщение исчезло</span>
              </p>
            ) : (
              <>
                <p className={cn(textSizeClass, "leading-[1.4] whitespace-pre-wrap break-normal max-h-[60vh] overflow-auto")}>
                  {shouldTreatAsEncrypted
                    ? hasDecryptedEntry
                      ? <>
                          <EncryptionBadge className="mr-1 align-middle" />
                          {renderText(normalizeBrokenVerticalText(sanitizeReceivedText(decryptedCache[message.id] ?? "🔒 Защищённое сообщение")), userId)}
                        </>
                      : <span className="opacity-50 italic text-sm">🔒 Расшифровка…</span>
                    : renderText(normalizeBrokenVerticalText(sanitizeReceivedText(message.content)), userId)
                  }
                </p>
                {linkPreviewEnabled && !shouldTreatAsEncrypted && (() => {
                  const urls = extractUrls(message.content || "");
                  return urls.length > 0 ? <LinkPreview key={urls[0]} url={urls[0]} enabled={linkPreviewEnabled} /> : null;
                })()}
              </>
            )}

            {isFirstInGroup && (
              <BubbleTail
                side={isOwn ? "right" : "left"}
                color={isOwn ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)"}
              />
            )}
          </div>

          {/* Reactions */}
          {(() => {
            const msgReactions = getReactions(message.id);
            return msgReactions.length > 0 ? (
              <MessageReactions
                messageId={message.id}
                reactions={msgReactions}
                showPicker={false}
                onPickerClose={() => {}}
                onReactionChange={() => {}}
                onToggle={onReaction}
              />
            ) : null;
          })()}

          {renderTimestamp()}
        </div>
      </DoubleTapReaction>
    );
  };

  return (
    <Fragment>
      {showDateSeparator && <DateSeparator date={msgDate} id={dateSepId} />}
      <SwipeableMessage
        messageId={message.id}
        onReply={(id) => onReply(id)}
      >
        <div
          className={cn(
            "group relative flex items-end min-w-0",
            densityStyles.gap,
            isOwn ? "justify-end" : "justify-start",
            isInContextMenu && "opacity-0",
          )}
        >
          {/* Avatar for incoming messages */}
          {!isOwn && (
            <div className={cn(densityStyles.avatarSize, "shrink-0")}>
              {showAvatar && (
                <GradientAvatar
                  name={senderName}
                  seed={message.sender_id}
                  avatarUrl={senderAvatar}
                  size="sm"
                  className={cn(densityStyles.avatarSize, "text-xs border-white/15")}
                />
              )}
            </div>
          )}
          {renderContent()}
          {/* Desktop hover action buttons */}
          {!selectionMode && (
            <MessageHoverActions
              isOwn={isOwn}
              onReply={() => onReply(message.id)}
              onReact={() => onReaction(message.id, "❤️")}
              onPin={() => {}}
              onForward={() => {}}
              onDelete={() => onDelete(message.id)}
            />
          )}
        </div>
      </SwipeableMessage>
    </Fragment>
  );
}
