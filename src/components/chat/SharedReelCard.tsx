import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Play, Trash2, Film } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { normalizeReelMediaUrl } from "@/hooks/useReels";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SharedReel {
  id: string;
  video_url: string;
  thumbnail_url: string | null;
  description: string | null;
  author_id: string;
  likes_count: number;
  comments_count: number;
  author?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface SharedReelCardProps {
  reelId: string;
  isOwn: boolean;
  messageId?: string;
  onDelete?: (messageId: string) => void;
}

export function SharedReelCard({ reelId, isOwn, messageId, onDelete }: SharedReelCardProps) {
  const [reel, setReel] = useState<SharedReel | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const navigate = useNavigate();
  
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPress = useRef(false);

  useEffect(() => {
    const fetchReel = async () => {
      try {
        // Fetch reel with author profile
        const { data: reelData, error: reelError } = await supabase
          .from("reels")
          .select("id, video_url, thumbnail_url, description, author_id, likes_count, comments_count")
          .eq("id", reelId)
          .single();

        if (reelError) throw reelError;

        // Fetch author profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("user_id", reelData.author_id)
          .single();

        setReel({
          ...reelData,
          video_url: normalizeReelMediaUrl((reelData as any)?.video_url, "reels-media"),
          thumbnail_url:
            normalizeReelMediaUrl((reelData as any)?.thumbnail_url, "reels-media") ||
            ((reelData as any)?.thumbnail_url ?? null),
          author: profile || undefined,
        });
      } catch (error) {
        console.error("Error fetching shared reel:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReel();
  }, [reelId]);

  const handleClick = () => {
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }
    navigate(`/reels`);
  };

  const handleTouchStart = () => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      if (isOwn && messageId) {
        setShowDeleteDialog(true);
      }
    }, 500);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleDelete = () => {
    if (messageId && onDelete) {
      onDelete(messageId);
    }
    setShowDeleteDialog(false);
  };

  if (loading) {
    return (
      <div
        className={`w-48 rounded-xl overflow-hidden ${
          isOwn ? "bg-[#1e3a4f]" : "bg-[#1a2733]"
        }`}
      >
        <div className="animate-pulse">
          <div className="h-64 bg-white/10" />
          <div className="p-3 space-y-2">
            <div className="h-3 bg-white/10 rounded w-3/4" />
            <div className="h-3 bg-white/10 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!reel) {
    return (
      <div
        className={`w-48 rounded-xl p-3 ${
          isOwn ? "bg-[#1e3a4f]" : "bg-[#1a2733]"
        }`}
      >
        <p className="text-sm text-white/50">Reel удалён</p>
      </div>
    );
  }

  const authorName = reel.author?.display_name || "Пользователь";
  const contentPreview = reel.description
    ? reel.description.slice(0, 60) + (reel.description.length > 60 ? "..." : "")
    : "";

  return (
    <>
      <button
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
        className={`w-48 rounded-xl overflow-hidden text-left transition-transform active:scale-[0.98] ${
          isOwn ? "bg-[#1e3a4f]" : "bg-[#1a2733]"
        }`}
      >
        {/* Video thumbnail */}
        <div className="relative h-64 overflow-hidden bg-black">
          {reel.thumbnail_url ? (
            <img
              src={reel.thumbnail_url}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              src={reel.video_url}
              className="w-full h-full object-cover"
              muted
              preload="metadata"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          
          {/* Play indicator */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-6 h-6 text-white fill-white ml-0.5" />
            </div>
          </div>

          {/* Reels badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm">
            <Film className="w-3 h-3 text-white" />
            <span className="text-[10px] text-white font-medium">Reels</span>
          </div>
        </div>

        {/* Content - only description */}
        {contentPreview && (
          <div className="p-3">
            <p className="text-xs text-white/80 line-clamp-2">
              {contentPreview}
            </p>
          </div>
        )}
      </button>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-[#1e2c3a] border-white/10 max-w-[300px] rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-center">
              Удалить сообщение?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 text-center">
              Сообщение будет удалено безвозвратно
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              onClick={handleDelete}
              className="w-full bg-red-500 hover:bg-red-600 text-white rounded-xl"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Удалить
            </AlertDialogAction>
            <AlertDialogCancel className="w-full bg-white/10 hover:bg-white/20 text-white border-0 rounded-xl">
              Отмена
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
