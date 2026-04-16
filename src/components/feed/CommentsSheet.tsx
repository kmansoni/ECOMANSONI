import { useState, useRef, useEffect, useCallback } from "react";
import { Heart, Send, Loader2, Trash2, SortAsc, Clock } from "lucide-react";
import { CommentFilter } from "@/components/moderation/CommentFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useComments, Comment } from "@/hooks/useComments";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { toast } from "@/hooks/use-toast";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { getHashtagBlockedToastPayload } from "@/lib/hashtagModeration";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface CommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  commentsCount: number;
  onCommentsCountChange?: (count: number) => void;
}

interface ReplyingTo {
  commentId: string;
  authorName: string;
}

export function CommentsSheet({
  isOpen,
  onClose,
  postId,
  commentsCount,
  onCommentsCountChange,
}: CommentsSheetProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    comments,
    loading,
    addComment,
    toggleLike,
    deleteComment,
  } = useComments(postId);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<ReplyingTo | null>(null);
  const [sortMode, setSortMode] = useState<"new" | "popular">("new");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const formatTimeAgo = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), {
        addSuffix: false,
        locale: ru
      });
    } catch {
      return "";
    }
  };

  const handleLikeComment = async (comment: Comment) => {
    if (!user) return;
    await toggleLike(comment.id, comment.liked_by_user);
  };

  const handleReply = (comment: Comment) => {
    if (!user) return;
    setReplyingTo({
      commentId: comment.id,
      authorName: comment.author.display_name
    });
    setNewComment(`@${comment.author.display_name} `);
    inputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setNewComment("");
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    const result = await addComment(newComment.trim(), replyingTo?.commentId);
    setSubmitting(false);
    if (result.error) {
      const payload = getHashtagBlockedToastPayload(result.error);
      if (payload) {
        toast({
          title: payload.title,
          description: payload.description,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Ошибка",
          description: "Не удалось отправить комментарий. Попробуйте снова.",
          variant: "destructive",
        });
      }
    } else {
      setNewComment("");
      setReplyingTo(null);
    }
  };

  const goToProfile = (userId: string) => {
    onClose();
    navigate(`/user/${userId}`);
  };

  // Focus input when replying
  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyingTo]);

  const sortedComments = [...comments].sort((a, b) => {
    if (sortMode === "popular") return (b.likes_count ?? 0) - (a.likes_count ?? 0);
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const totalComments = comments.reduce((acc: number, c: Comment) => acc + 1 + (c.replies?.length || 0), 0);

  // ИСПРАВЛЕНИЕ дефекта #25: предотвращаем бесконечный цикл при нестабильной ссылке callback
  // Если onCommentsCountChange создаётся inline в PostCard — каждый ре-рендер даёт новую ссылку
  // Решение: проверяем что значение реально изменилось перед вызовом
  const prevCountRef = useRef(totalComments);
  useEffect(() => {
    if (prevCountRef.current === totalComments) return;
    prevCountRef.current = totalComments;
    onCommentsCountChange?.(totalComments);
  }, [onCommentsCountChange, totalComments]);

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="h-[92dvh] max-h-[92dvh] mt-0 flex flex-col">
        <DrawerHeader className="border-b border-border pb-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DrawerTitle>
              Комментарии {(totalComments || commentsCount) > 0 && `(${totalComments || commentsCount})`}
            </DrawerTitle>
            <button
              onClick={() => setSortMode((m) => m === "new" ? "popular" : "new")}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {sortMode === "new" ? <Clock className="w-3.5 h-3.5" /> : <SortAsc className="w-3.5 h-3.5" />}
              {sortMode === "new" ? "Новые" : "Популярные"}
            </button>
          </div>
        </DrawerHeader>
        
        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 native-scroll min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p className="text-base">Пока нет комментариев</p>
              <p className="text-sm mt-1">Будьте первым!</p>
            </div>
          ) : (
            sortedComments.map((comment: Comment) => (
              <div key={comment.id} className="space-y-3">
                <CommentFilter text={comment.content ?? ""}>
                  <CommentItem
                    comment={comment}
                    onLike={() => handleLikeComment(comment)}
                    onReply={() => handleReply(comment)}
                    onGoToProfile={goToProfile}
                    formatTimeAgo={formatTimeAgo}
                    onDelete={deleteComment ? () => deleteComment(comment.id) : undefined}
                    currentUserId={user?.id}
                  />
                </CommentFilter>
                {comment.replies && comment.replies.length > 0 && (
                  <div className="ml-12 space-y-3 border-l-2 border-border pl-3">
                    {comment.replies.map((reply: Comment) => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        onLike={() => handleLikeComment(reply)}
                        onReply={() => handleReply(comment)}
                        onGoToProfile={goToProfile}
                        formatTimeAgo={formatTimeAgo}
                        onDelete={deleteComment ? () => deleteComment(reply.id) : undefined}
                        currentUserId={user?.id}
                        isReply
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        
        {/* Input */}
        <div className="border-t border-border mt-auto">
          {/* Reply indicator */}
          {replyingTo && (
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 text-sm">
              <span className="text-muted-foreground">
                Ответ для <span className="font-medium text-foreground">{replyingTo.authorName}</span>
              </span>
              <button onClick={cancelReply} className="text-primary font-medium">
                Отмена
              </button>
            </div>
          )}
          
          <div className="p-4 flex items-start gap-3 safe-area-bottom">
            {user?.user_metadata?.avatar_url ? (
              <img loading="lazy"
                src={user.user_metadata.avatar_url}
                alt="Вы"
                className="w-9 h-9 rounded-full object-cover flex-shrink-0 mt-1"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0 mt-1 flex items-center justify-center text-sm font-bold text-muted-foreground">
                {user?.email?.slice(0, 1)?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="flex-1">
              <textarea
                ref={inputRef}
                placeholder={user ? (replyingTo ? "Напишите ответ..." : "Добавьте комментарий...") : "Войдите чтобы комментировать"}
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
                rows={1}
                className="w-full rounded-2xl bg-muted border-0 px-4 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-primary/50"
                disabled={!user || submitting}
              />
            </div>
            <Button 
              size="icon" 
              variant="ghost" 
              className="text-primary h-11 w-11" 
              disabled={!newComment.trim() || submitting || !user} 
              onClick={handleSubmitComment}
            >
              {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface CommentItemProps {
  comment: Comment;
  onLike: () => void;
  onReply: () => void;
  onGoToProfile: (userId: string) => void;
  formatTimeAgo: (date: string) => string;
  onDelete?: () => void;
  currentUserId?: string;
  isReply?: boolean;
}

function CommentItem({
  comment,
  onLike,
  onReply,
  onGoToProfile,
  formatTimeAgo,
  onDelete,
  currentUserId,
  isReply,
}: CommentItemProps) {
  const isOwn = currentUserId && currentUserId === comment.author.user_id;
  const avatarUrl = comment.author.avatar_url;

  return (
    <div className="flex gap-3">
      {avatarUrl ? (
        <img loading="lazy"
          src={avatarUrl}
          alt={comment.author.display_name}
          className={cn(
            "rounded-full object-cover flex-shrink-0 cursor-pointer",
            isReply ? "w-8 h-8" : "w-10 h-10",
          )}
          onClick={() => onGoToProfile(comment.author.user_id)}
        />
      ) : (
        <div
          className={cn(
            "rounded-full bg-muted flex-shrink-0 flex items-center justify-center text-xs font-bold text-muted-foreground cursor-pointer",
            isReply ? "w-8 h-8" : "w-10 h-10",
          )}
          onClick={() => onGoToProfile(comment.author.user_id)}
        >
          {comment.author.display_name?.slice(0, 1)?.toUpperCase() ?? "?"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <span
                className="font-semibold text-sm cursor-pointer hover:underline"
                onClick={() => onGoToProfile(comment.author.user_id)}
              >
                {comment.author.display_name}
              </span>
              {comment.author.verified && <VerifiedBadge size="xs" />}
              <span className="text-xs text-muted-foreground ml-1">
                {formatTimeAgo(comment.created_at)}
              </span>
            </div>
            <p className="text-sm text-foreground mt-1">{comment.content}</p>
            <div className="flex items-center gap-4 mt-2">
              <button
                onClick={onReply}
                className="text-xs text-muted-foreground font-medium hover:text-foreground transition-colors"
              >
                Ответить
              </button>
              {isOwn && onDelete && (
                <button
                  onClick={onDelete}
                  className="text-xs text-destructive/70 hover:text-destructive transition-colors flex items-center gap-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                  Удалить
                </button>
              )}
            </div>
          </div>
          <button onClick={onLike} className="flex flex-col items-center gap-0.5 pt-1">
            <Heart
              className={cn(
                "w-4 h-4",
                comment.liked_by_user ? "fill-destructive text-destructive" : "text-muted-foreground",
              )}
            />
            <span className="text-xs text-muted-foreground">{comment.likes_count}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
