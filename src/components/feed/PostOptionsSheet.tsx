import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Bookmark, UserPlus, UserMinus, Flag, Link2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSavedPosts } from "@/hooks/useSavedPosts";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface PostOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  postId: string;
  authorId: string;
  authorUsername: string;
}

export function PostOptionsSheet({
  isOpen,
  onClose,
  postId,
  authorId,
  authorUsername,
}: PostOptionsSheetProps) {
  const { user } = useAuth();
  const { isSaved, toggleSave } = useSavedPosts();
  const navigate = useNavigate();
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  const saved = isSaved(postId);
  const isOwnPost = user?.id === authorId;

  // Check if following the author
  useEffect(() => {
    const checkFollowing = async () => {
      if (!user || isOwnPost) return;

      const { data } = await supabase
        .from("followers")
        .select("id")
        .eq("follower_id", user.id)
        .eq("following_id", authorId)
        .maybeSingle();

      setIsFollowing(!!data);
    };

    if (isOpen) {
      checkFollowing();
    }
  }, [user, authorId, isOpen, isOwnPost]);

  const handleSave = async () => {
    if (!user) {
      toast.error("Войдите, чтобы сохранить");
      navigate("/auth");
      onClose();
      return;
    }

    try {
      await toggleSave(postId);
      toast.success(saved ? "Удалено из избранного" : "Добавлено в избранное");
      onClose();
    } catch (err) {
      toast.error("Ошибка при сохранении");
    }
  };

  const handleFollowToggle = async () => {
    if (!user) {
      toast.error("Войдите, чтобы подписаться");
      navigate("/auth");
      onClose();
      return;
    }

    setLoading(true);
    try {
      if (isFollowing) {
        await supabase
          .from("followers")
          .delete()
          .eq("follower_id", user.id)
          .eq("following_id", authorId);

        setIsFollowing(false);
        toast.success("Вы отписались");
      } else {
        await supabase
          .from("followers")
          .insert({ follower_id: user.id, following_id: authorId });

        setIsFollowing(true);
        toast.success("Вы подписались");
      }
      onClose();
    } catch (err) {
      toast.error("Произошла ошибка");
    } finally {
      setLoading(false);
    }
  };

  const handleReport = () => {
    toast.success("Жалоба отправлена");
    onClose();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`);
      toast.success("Ссылка скопирована");
      onClose();
    } catch {
      toast.error("Не удалось скопировать");
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl px-0 pb-8">
        <div className="flex flex-col gap-1 pt-4">
          {/* Save to favorites */}
          <Button
            variant="ghost"
            className="justify-start gap-3 h-14 px-6 text-base font-normal"
            onClick={handleSave}
          >
            <Bookmark className={saved ? "fill-current text-primary" : ""} />
            {saved ? "Удалить из избранного" : "Добавить в избранное"}
          </Button>

          {/* Follow/Unfollow - only show if not own post */}
          {!isOwnPost && (
            <Button
              variant="ghost"
              className="justify-start gap-3 h-14 px-6 text-base font-normal"
              onClick={handleFollowToggle}
              disabled={loading}
            >
              {isFollowing ? (
                <>
                  <UserMinus className="text-destructive" />
                  <span className="text-destructive">Отписаться от {authorUsername}</span>
                </>
              ) : (
                <>
                  <UserPlus />
                  Подписаться на {authorUsername}
                </>
              )}
            </Button>
          )}

          {/* Copy link */}
          <Button
            variant="ghost"
            className="justify-start gap-3 h-14 px-6 text-base font-normal"
            onClick={handleCopyLink}
          >
            <Link2 />
            Копировать ссылку
          </Button>

          {/* Report - only show if not own post */}
          {!isOwnPost && (
            <Button
              variant="ghost"
              className="justify-start gap-3 h-14 px-6 text-base font-normal text-destructive"
              onClick={handleReport}
            >
              <Flag />
              Пожаловаться
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
