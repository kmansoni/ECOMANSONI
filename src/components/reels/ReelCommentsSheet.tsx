import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Send, X, MoreHorizontal, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useReelComments, ReelComment } from "@/hooks/useReelComments";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { getHashtagBlockedToastPayload } from "@/lib/hashtagModeration";

interface ReelCommentsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  reelId: string;
  commentsCount: number;
}

export function ReelCommentsSheet({
  isOpen,
  onClose,
  reelId,
  commentsCount
}: ReelCommentsSheetProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { comments, loading, addComment, toggleLike, deleteComment } = useReelComments(reelId);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (replyTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [replyTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Войдите, чтобы комментировать");
      navigate("/auth");
      return;
    }
    if (!newComment.trim() || submitting) return;

    setSubmitting(true);
    const result = await addComment(newComment, replyTo?.id);
    setSubmitting(false);

    if (result.ok) {
      setNewComment("");
      setReplyTo(null);
    } else {
      const payload = getHashtagBlockedToastPayload("error" in result ? result.error : undefined);
      if (payload) toast.error(payload.title, { description: payload.description });
      else toast.error("Не удалось добавить комментарий");
    }
  };

  const handleReply = (comment: ReelComment) => {
    setReplyTo({ id: comment.id, name: comment.author.display_name });
  };

  const handleDelete = async (commentId: string) => {
    const success = await deleteComment(commentId);
    if (success) {
      toast.success("Комментарий удалён");
    } else {
      toast.error("Не удалось удалить комментарий");
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ru });
    } catch {
      return "";
    }
  };

  const renderComment = (comment: ReelComment, isReply = false) => (
    <div key={comment.id} className={cn("flex gap-3", isReply && "ml-10 mt-3")}>
      <Avatar
        className="w-8 h-8 cursor-pointer flex-shrink-0"
        onClick={() => navigate(`/user/${comment.author.user_id}`)}
      >
        <AvatarImage src={comment.author.avatar_url || undefined} />
        <AvatarFallback className="bg-muted text-xs">
          {comment.author.display_name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <span
              className="font-semibold text-sm cursor-pointer hover:underline"
              onClick={() => navigate(`/user/${comment.author.user_id}`)}
            >
              {comment.author.display_name}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {formatTime(comment.created_at)}
            </span>
            <p className="text-sm mt-0.5 break-words">{comment.content}</p>
            
            <div className="flex items-center gap-4 mt-1">
              <button
                onClick={() => toggleLike(comment.id)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Heart
                  className={cn(
                    "w-3.5 h-3.5",
                    comment.liked_by_user && "fill-destructive text-destructive"
                  )}
                />
                {comment.likes_count > 0 && comment.likes_count}
              </button>
              
              <button
                onClick={() => handleReply(comment)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Ответить
              </button>
            </div>
          </div>

          {user?.id === comment.author_id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDelete(comment.id)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            {comment.replies.map((reply) => renderComment(reply, true))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="h-[92dvh] max-h-[92dvh] flex flex-col bg-background z-[200]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <h3 className="font-semibold">Комментарии ({commentsCount})</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Comments list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">Пока нет комментариев</p>
              <p className="text-sm text-muted-foreground mt-1">Будьте первым!</p>
            </div>
          ) : (
            comments.map((comment) => renderComment(comment))
          )}
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-border bg-background safe-area-bottom">
          {replyTo && (
            <div className="flex items-center justify-between px-4 py-2 bg-muted/50 text-sm">
              <span className="text-muted-foreground">
                Ответ для <span className="font-medium text-foreground">@{replyTo.name}</span>
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyTo(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
            <Input
              ref={inputRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={replyTo ? `Ответить @${replyTo.name}...` : "Добавить комментарий..."}
              className="flex-1 bg-muted border-0"
              disabled={submitting}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!newComment.trim() || submitting}
              className="flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
