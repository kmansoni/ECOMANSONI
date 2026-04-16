/**
 * @file src/components/reels/ReelCommentsSheet.tsx
 * @description Bottom sheet с комментариями к Reel.
 *
 * Архитектурные решения:
 * - Framer Motion drag-to-dismiss: onDragEnd → if offsetY > 100px → onClose()
 * - dragConstraints.top = -(windowHeight * 0.3): расширение до 90% высоты экрана
 * - Backdrop отдельный motion.div с opacity fade — не блокирует drag gesture sheet
 * - Input sticky bottom-0 внутри flex-col контейнера (не портал)
 * - При ответе: replyTarget хранит { id, username } — передаётся в addComment как parentId
 * - Optimistic UI: toggleLike в useReelComments уже оптимистичен
 * - Infinite scroll: IntersectionObserver на sentinel div в конце списка
 * - Keyboard avoidance: visualViewport resize listener поднимает sheet на высоту клавиатуры
 * - Portal через createPortal → рендерится вне scroll-контейнера Reels (z-[60])
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Heart, MessageCircle, ChevronDown } from 'lucide-react';
import { useReelComments, type ReelComment } from '@/hooks/useReelComments';
import { useAuth } from '@/hooks/useAuth';
import { formatCount, formatRelativeTime } from '@/lib/reels/format';

// ---------------------------------------------------------------------------
// Type guard для user_metadata
// ---------------------------------------------------------------------------

interface UserMetadata {
  avatar_url?: string;
  display_name?: string;
}

function getUserMetadata(user: unknown): UserMetadata {
  if (user && typeof user === 'object' && 'user_metadata' in user) {
    const meta = (user as { user_metadata?: Record<string, unknown> }).user_metadata;
    return {
      avatar_url: typeof meta?.avatar_url === 'string' ? meta.avatar_url : undefined,
      display_name: typeof meta?.display_name === 'string' ? meta.display_name : undefined,
    };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReelCommentsSheetProps {
  reelId: string;
  isOpen: boolean;
  onClose: () => void;
  /** Число комментариев из родительского reel (для заголовка до загрузки) */
  commentsCount: number;
}

// ---------------------------------------------------------------------------
// Утилита: аватар-заглушка
// ---------------------------------------------------------------------------

function AvatarFallback({
  name,
  size = 32,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}): JSX.Element {
  const initials = name.trim().slice(0, 1).toUpperCase() || '?';
  return (
    <div
      className={`flex-shrink-0 rounded-full bg-zinc-600 flex items-center justify-center text-white font-semibold select-none ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

function Avatar({
  src,
  name,
  size = 32,
  className = '',
}: {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}): JSX.Element {
  const [error, setError] = useState(false);

  if (!src || error) {
    return <AvatarFallback name={name} size={size} className={className} />;
  }

  return (
    <img loading="lazy"
      src={src}
      alt={name}
      width={size}
      height={size}
      className={`flex-shrink-0 rounded-full object-cover ${className}`}
      style={{ width: size, height: size }}
      onError={() => setError(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function CommentSkeleton(): JSX.Element {
  return (
    <div className="flex gap-3 py-3 animate-pulse">
      <div className="w-8 h-8 rounded-full bg-zinc-700 flex-shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <div className="h-3 w-1/3 bg-zinc-700 rounded" />
        <div className="h-3 w-full bg-zinc-700 rounded" />
        <div className="h-3 w-2/3 bg-zinc-700 rounded" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CommentItem
// ---------------------------------------------------------------------------

interface CommentItemProps {
  comment: ReelComment;
  currentUserId?: string;
  onReply: (id: string, username: string) => void;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
  depth?: number;
}

function CommentItem({
  comment,
  currentUserId,
  onReply,
  onLike,
  onDelete,
  depth = 0,
}: CommentItemProps): JSX.Element {
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const isOwn = comment.author_id === currentUserId;
  const hasReplies = (comment.replies?.length ?? 0) > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={depth > 0 ? 'ml-10' : ''}
    >
      <div className="flex gap-3 py-3">
        {/* Аватар */}
        <Avatar
          src={comment.author.avatar_url}
          name={comment.author.display_name}
          size={32}
        />

        {/* Тело комментария */}
        <div className="flex-1 min-w-0">
          {/* Шапка */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-semibold leading-tight">
              {comment.author.display_name}
            </span>
            {comment.author.verified && (
              <span className="text-blue-400 text-xs" aria-label="Верифицирован">✓</span>
            )}
            <span className="text-zinc-500 text-xs">
              {formatRelativeTime(comment.created_at)}
            </span>
          </div>

          {/* Текст */}
          <p className="text-white text-sm mt-0.5 leading-relaxed break-words">
            {comment.content}
          </p>

          {/* Действия */}
          <div className="flex items-center gap-4 mt-1.5">
            <button
              onClick={() => onReply(comment.id, comment.author.display_name)}
              className="text-zinc-400 text-xs font-medium hover:text-white transition-colors active:scale-95"
            >
              Ответить
            </button>
            {isOwn && (
              <button
                onClick={() => onDelete(comment.id)}
                className="text-zinc-500 text-xs hover:text-red-400 transition-colors active:scale-95"
              >
                Удалить
              </button>
            )}
          </div>
        </div>

        {/* Лайк */}
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 pt-1">
          <motion.button
            onClick={() => onLike(comment.id)}
            whileTap={{ scale: 1.4 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className="p-1"
            aria-label={comment.liked_by_user ? 'Убрать лайк' : 'Лайкнуть'}
          >
            <Heart
              size={14}
              className={
                comment.liked_by_user
                  ? 'fill-red-500 text-red-500'
                  : 'text-zinc-400'
              }
            />
          </motion.button>
          {comment.likes_count > 0 && (
            <span className="text-zinc-400 text-[10px] leading-none">
              {formatCount(comment.likes_count)}
            </span>
          )}
        </div>
      </div>

      {/* Replies toggle */}
      {hasReplies && !repliesExpanded && (
        <button
          onClick={() => setRepliesExpanded(true)}
          className="ml-11 flex items-center gap-1.5 text-zinc-400 text-xs font-medium py-1 hover:text-white transition-colors"
        >
          <div className="w-5 h-px bg-zinc-600" />
          Показать ответы ({comment.replies?.length ?? 0})
        </button>
      )}

      {/* Replies */}
      <AnimatePresence>
        {repliesExpanded && comment.replies && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                onReply={onReply}
                onLike={onLike}
                onDelete={onDelete}
                depth={depth + 1}
              />
            ))}
            <button
              onClick={() => setRepliesExpanded(false)}
              className="ml-11 flex items-center gap-1.5 text-zinc-400 text-xs font-medium py-1 hover:text-white transition-colors"
            >
              <ChevronDown size={12} className="rotate-180" />
              Скрыть ответы
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ReelCommentsSheet
// ---------------------------------------------------------------------------

export function ReelCommentsSheet({
  reelId,
  isOpen,
  onClose,
  commentsCount,
}: ReelCommentsSheetProps): JSX.Element | null {
  const { user } = useAuth();
  const { comments, loading, addComment, toggleLike, deleteComment, refetch } =
    useReelComments(reelId);

  // ---------------------------------------------------------------------------
  // Reply state
  // ---------------------------------------------------------------------------

  const [replyTarget, setReplyTarget] = useState<{
    id: string;
    username: string;
  } | null>(null);

  const handleReply = useCallback((id: string, username: string) => {
    setReplyTarget({ id, username });
    inputRef.current?.focus();
  }, []);

  const cancelReply = useCallback(() => setReplyTarget(null), []);

  // ---------------------------------------------------------------------------
  // Input state
  // ---------------------------------------------------------------------------

  const [inputText, setInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    const text = inputText.trim();
    if (!text || submitting) return;

    setSubmitting(true);
    const result = await addComment(text, replyTarget?.id);
    setSubmitting(false);

    if (result.ok) {
      setInputText('');
      setReplyTarget(null);
    }
  }, [inputText, submitting, addComment, replyTarget]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  // ---------------------------------------------------------------------------
  // Drag / dismiss
  // ---------------------------------------------------------------------------

  const [windowHeight, setWindowHeight] = useState(
    typeof window !== 'undefined' ? window.innerHeight : 800,
  );

  useEffect(() => {
    const handleResize = () => setWindowHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number } }) => {
      if (info.offset.y > 100) {
        onClose();
      }
    },
    [onClose],
  );

  // ---------------------------------------------------------------------------
  // Keyboard avoidance (Visual Viewport API)
  // ---------------------------------------------------------------------------

  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const vv = window.visualViewport!;
    const onVVResize = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };

    vv.addEventListener('resize', onVVResize);
    vv.addEventListener('scroll', onVVResize);
    return () => {
      vv.removeEventListener('resize', onVVResize);
      vv.removeEventListener('scroll', onVVResize);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Infinite scroll sentinel
  // ---------------------------------------------------------------------------

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void refetch();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Reset на открытие
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (isOpen) {
      setInputText('');
      setReplyTarget(null);
    }
  }, [isOpen]);

  // ---------------------------------------------------------------------------
  // Portal target
  // ---------------------------------------------------------------------------

  const portalTarget =
    typeof document !== 'undefined' ? document.body : null;

  if (!portalTarget) return null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const sheetHeightDefault = windowHeight * 0.6;
  const dragTopConstraint = -(windowHeight * 0.3); // расширение до 90%

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-black/40 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            className="fixed bottom-0 left-0 right-0 bg-zinc-900 rounded-t-2xl z-[61] flex flex-col"
            style={{
              height: sheetHeightDefault,
              paddingBottom: keyboardOffset,
              maxHeight: '90dvh',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="y"
            dragConstraints={{ top: dragTopConstraint, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.3 }}
            onDragEnd={handleDragEnd}
            aria-modal="true"
            role="dialog"
            aria-label="Комментарии"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-zinc-600 rounded-full" aria-hidden="true" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-zinc-400" />
                <span className="text-white font-semibold text-sm">
                  Комментарии
                </span>
                <span className="text-zinc-400 text-sm">
                  {formatCount(comments.length || commentsCount)}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 text-zinc-400 hover:text-white transition-colors active:scale-90"
                aria-label="Закрыть"
              >
                <X size={20} />
              </button>
            </div>

            {/* Comment list */}
            <div
              className="flex-1 overflow-y-auto px-4 overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {/* Loading skeleton */}
              {loading && comments.length === 0 && (
                <>
                  <CommentSkeleton />
                  <CommentSkeleton />
                  <CommentSkeleton />
                </>
              )}

              {/* Empty state */}
              {!loading && comments.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <MessageCircle size={40} className="text-zinc-600" />
                  <p className="text-zinc-400 text-sm text-center">
                    Пока нет комментариев.
                    <br />
                    Будьте первым!
                  </p>
                </div>
              )}

              {/* Comments */}
              {comments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={user?.id}
                  onReply={handleReply}
                  onLike={toggleLike}
                  onDelete={deleteComment}
                />
              ))}

              {/* Infinite scroll sentinel */}
              <div ref={sentinelRef} className="h-px" aria-hidden="true" />
            </div>

            {/* Input area */}
            <div
              className="sticky bottom-0 flex flex-col border-t border-zinc-700 bg-zinc-900 flex-shrink-0"
              // stopPropagation предотвращает drag gesture на input area
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Reply banner */}
              <AnimatePresence>
                {replyTarget && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-between px-4 py-2 bg-zinc-800"
                  >
                    <span className="text-zinc-400 text-xs">
                      Ответ{' '}
                      <span className="text-white font-medium">
                        @{replyTarget.username}
                      </span>
                    </span>
                    <button
                      onClick={cancelReply}
                      className="p-1 text-zinc-400 hover:text-white transition-colors"
                      aria-label="Отменить ответ"
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Input row */}
              <div className="flex items-center gap-2 px-4 py-3">
                <Avatar
                  src={getUserMetadata(user).avatar_url ?? null}
                  name={getUserMetadata(user).display_name ?? 'Я'}
                  size={32}
                />

                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    replyTarget
                      ? `Ответ @${replyTarget.username}...`
                      : 'Добавить комментарий...'
                  }
                  rows={1}
                  className={[
                    'flex-1 bg-zinc-800 rounded-full px-4 py-2',
                    'text-white text-sm placeholder:text-zinc-500',
                    'resize-none outline-none border-none',
                    'leading-relaxed max-h-24 overflow-y-auto',
                    '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  ].join(' ')}
                  style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                  aria-label="Поле ввода комментария"
                  disabled={!user || submitting}
                />

                <motion.button
                  onClick={() => void handleSubmit()}
                  disabled={!inputText.trim() || submitting || !user}
                  whileTap={{ scale: 0.9 }}
                  className={[
                    'p-2 rounded-full transition-colors flex-shrink-0',
                    inputText.trim() && user
                      ? 'text-blue-400 hover:text-blue-300 active:scale-90'
                      : 'text-zinc-600 cursor-not-allowed',
                  ].join(' ')}
                  aria-label="Отправить комментарий"
                >
                  {submitting ? (
                    <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, portalTarget);
}

export default ReelCommentsSheet;
