/**
 * @file src/components/stories/StoryViewer.tsx
 * @description Полноэкранный просмотр Stories с прогресс-барами,
 * навигацией (тап, свайп, клавиатура), паузой, стикерами и реакциями.
 * Делегирует логику навигации в useStoryViewer.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Volume2, VolumeX, Eye, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useStoryViewer } from "@/hooks/useStoryViewer";
import { StoryStickers } from "./StoryStickers";
import { StoryReactionBar } from "@/components/feed/StoryReactionBar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { UserWithStories } from "@/hooks/useStories";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

interface StoryViewerProps {
  usersWithStories: UserWithStories[];
  initialUserIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

const PROGRESS_INTERVAL = 50;
const SWIPE_DOWN_THRESHOLD = 120;
const SWIPE_DOWN_RESISTANCE = 0.55;
const SWIPE_MIN_DISTANCE = 50;

// ---------------------------------------------------------------------------
// StoryViewer
// ---------------------------------------------------------------------------

export function StoryViewer({
  usersWithStories,
  initialUserIndex,
  isOpen,
  onClose,
}: StoryViewerProps) {
  const {
    currentUser,
    currentStory,
    currentStories,
    currentStoryIndex,
    progress,
    isPaused,
    views,
    viewers,
    isAuthor,
    goNext,
    goPrev,
    pause,
    resume,
    setVideoLoaded,
    sendReply,
  } = useStoryViewer({ usersWithStories, initialUserIndex, isOpen, onClose });

  const [isMuted, setIsMuted] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showViewers, setShowViewers] = useState(false);
  const [dragY, setDragY] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchEndXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const dragYRef = useRef(0);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, goNext, goPrev, onClose]);

  // Touch handlers
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      touchEndXRef.current = null;
      touchStartXRef.current = e.targetTouches[0].clientX;
      touchStartYRef.current = e.targetTouches[0].clientY;
      dragYRef.current = 0;
      setDragY(0);
      pause();
    },
    [pause],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndXRef.current = e.targetTouches[0].clientX;
    if (touchStartYRef.current !== null) {
      const dy = e.targetTouches[0].clientY - touchStartYRef.current;
      if (dy > 0) {
        const resisted = dy * SWIPE_DOWN_RESISTANCE;
        dragYRef.current = resisted;
        setDragY(resisted);
      } else {
        dragYRef.current = 0;
        setDragY(0);
      }
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    resume();

    if (dragYRef.current >= SWIPE_DOWN_THRESHOLD) {
      dragYRef.current = 0;
      touchStartYRef.current = null;
      setDragY(0);
      onClose();
      return;
    }

    dragYRef.current = 0;
    touchStartYRef.current = null;
    setDragY(0);

    const startX = touchStartXRef.current;
    const endX = touchEndXRef.current;
    if (startX === null || endX === null) return;

    const dist = startX - endX;
    if (dist > SWIPE_MIN_DISTANCE) goNext();
    else if (dist < -SWIPE_MIN_DISTANCE) goPrev();
  }, [resume, onClose, goNext, goPrev]);

  // Отправка ответа
  const handleReply = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!replyText.trim()) return;
      await sendReply(replyText);
      setReplyText("");
    },
    [replyText, sendReply],
  );

  if (!isOpen || !currentUser || !currentStory) return null;

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(currentStory.created_at), {
        addSuffix: false,
        locale: ru,
      });
    } catch {
      return "";
    }
  })();

  const dragProgress = Math.min(dragY / SWIPE_DOWN_THRESHOLD, 1);
  const dragScale = 1 - dragProgress * 0.08;
  const dragOpacity = 1 - dragProgress * 0.4;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      style={{ opacity: dragOpacity }}
    >
      <div
        className="relative w-full h-full overflow-hidden"
        style={{
          minHeight: "100dvh",
          height: "100dvh",
          transform: `translateY(${dragY}px) scale(${dragScale})`,
          transition: dragY === 0 ? "transform 0.25s cubic-bezier(0.4,0,0.2,1)" : "none",
          transformOrigin: "center top",
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Тап-зоны навигации */}
        <button
          type="button"
          className="absolute left-0 top-16 w-1/2 h-[calc(100%-8rem)] z-10 bg-transparent border-0 outline-none"
          style={{ WebkitTapHighlightColor: "transparent" }}
          onClick={goPrev}
          aria-label="Предыдущая история"
        />
        <button
          type="button"
          className="absolute right-0 top-16 w-1/2 h-[calc(100%-8rem)] z-10 bg-transparent border-0 outline-none"
          style={{ WebkitTapHighlightColor: "transparent" }}
          onClick={goNext}
          aria-label="Следующая история"
        />

        {/* Медиа */}
        <div className="absolute inset-0 pointer-events-none">
          {currentStory.media_type === "video" ? (
            <video
              ref={videoRef}
              src={currentStory.media_url}
              className="w-full h-full object-cover"
              autoPlay
              muted={isMuted}
              playsInline
              onLoadedMetadata={(e) => setVideoLoaded(e.currentTarget.duration)}
            />
          ) : (
            <img loading="lazy"
              src={currentStory.media_url}
              alt={`История ${currentUser.display_name}`}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
        </div>

        {/* Прогресс-бары */}
        <div className="absolute top-0 left-0 right-0 z-10 px-2 pt-2 flex gap-[3px]">
          {currentStories.map((_, i) => {
            const isCurrent = i === currentStoryIndex;
            const isDone = i < currentStoryIndex;
            return (
              <div
                key={i}
                className="flex-1 h-[2px] bg-white/30 rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={isCurrent ? Math.round(progress) : isDone ? 100 : 0}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-white rounded-full"
                  style={{
                    width: isDone ? "100%" : isCurrent ? `${progress}%` : "0%",
                    transition:
                      isCurrent && !isPaused
                        ? `width ${PROGRESS_INTERVAL}ms linear`
                        : "none",
                    willChange: isCurrent ? "width" : "auto",
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Заголовок: аватар + имя + время */}
        <div className="absolute top-6 left-0 right-0 z-30 px-3 flex items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <img loading="lazy"
              src={
                currentUser.avatar_url ??
                `https://i.pravatar.cc/150?u=${currentUser.user_id}`
              }
              alt=""
              className="w-9 h-9 rounded-full border-2 border-white/50 object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-white font-semibold text-sm truncate">
                  {currentUser.isOwn ? "Вы" : currentUser.display_name}
                </p>
                {currentUser.verified && <VerifiedBadge size="sm" />}
              </div>
              <p className="text-white/60 text-xs">{timeAgo} назад</p>
            </div>
          </div>

          {/* Звук (только видео) */}
          {currentStory.media_type === "video" && (
            <button
              type="button"
              className="p-2 text-white hover:bg-white/10 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                setIsMuted((m) => !m);
              }}
              aria-label={isMuted ? "Включить звук" : "Выключить звук"}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-2 text-white hover:bg-white/10 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Закрыть"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Caption */}
        {currentStory.caption && (
          <div className="absolute bottom-36 left-0 right-0 z-20 px-4">
            <p className="text-white text-center text-lg font-medium drop-shadow-lg">
              {currentStory.caption}
            </p>
          </div>
        )}

        {/* Стикеры */}
        <StoryStickers storyId={currentStory.id} />

        {/* Реакции */}
        <div className="absolute bottom-20 left-0 right-0 z-30 px-4">
          <StoryReactionBar storyId={currentStory.id} />
        </div>

        {/* Нижняя панель: просмотры (автор) или ответ (зритель) */}
        <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-6">
          {isAuthor ? (
            <>
              <button
                type="button"
                className="flex items-center gap-2 text-white/70 text-sm mb-2 min-h-[44px]"
                onClick={() => setShowViewers((v) => !v)}
                aria-label="Показать просмотры"
              >
                <Eye className="w-4 h-4" />
                {views}{" "}
                {views === 1 ? "просмотр" : views < 5 ? "просмотра" : "просмотров"}
              </button>
              {showViewers && (
                <div className="bg-black/70 backdrop-blur-md rounded-2xl p-3 max-h-48 overflow-y-auto space-y-2">
                  {viewers.length === 0 && (
                    <p className="text-white/50 text-sm text-center">
                      Нет просмотров
                    </p>
                  )}
                  {viewers.map((v) => (
                    <div key={v.viewer_id} className="flex items-center gap-2">
                      <img loading="lazy"
                        src={
                          v.avatar_url ??
                          `https://i.pravatar.cc/40?u=${v.viewer_id}`
                        }
                        className="w-7 h-7 rounded-full object-cover"
                        alt=""
                      />
                      <span className="text-white text-sm">
                        {v.display_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <form className="flex items-center gap-2" onSubmit={handleReply}>
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Ответить на историю..."
                className="flex-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2.5 text-white text-sm placeholder:text-white/40 outline-none min-h-[44px]"
                onClick={(e) => {
                  e.stopPropagation();
                  pause();
                }}
                onBlur={resume}
              />
              {replyText.trim() && (
                <button
                  type="submit"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center bg-primary rounded-full text-white"
                  aria-label="Отправить"
                >
                  <Send className="w-5 h-5" />
                </button>
              )}
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
