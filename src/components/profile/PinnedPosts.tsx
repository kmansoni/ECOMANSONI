/**
 * @file src/components/profile/PinnedPosts.tsx
 * @description Закреплённые посты на профиле (до 3) — Instagram-стиль.
 * Отображаются первыми в сетке профиля с иконкой булавки.
 */

import { useState } from "react";
import { Pin, X } from "lucide-react";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface PinnedPost {
  id: string;
  post_id: string;
  position: number;
  post?: {
    id: string;
    media_url: string;
    media_type: string;
    thumbnail_url?: string;
  };
}

interface PinnedPostsProps {
  userId: string;
  isOwner: boolean;
  pinnedPosts: PinnedPost[];
  onPostPress: (postId: string) => void;
  onRefresh: () => void;
}

export function PinnedPosts({ userId, isOwner, pinnedPosts, onPostPress, onRefresh }: PinnedPostsProps) {
  const { user } = useAuth();
  const [unpinning, setUnpinning] = useState<string | null>(null);

  const handleUnpin = async (pinnedId: string) => {
    setUnpinning(pinnedId);
    const { error } = await dbLoose
      .from("pinned_posts")
      .delete()
      .eq("id", pinnedId)
      .eq("user_id", user?.id ?? "");
    setUnpinning(null);
    if (error) { toast.error("Ошибка открепления"); return; }
    toast.success("Пост откреплён");
    onRefresh();
  };

  if (pinnedPosts.length === 0) return null;

  return (
    <div className="w-full">
      {/* Заголовок секции */}
      <div className="flex items-center gap-2 px-4 py-2">
        <Pin className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Закреплённые</span>
      </div>

      {/* Сетка закреплённых постов */}
      <div className="grid grid-cols-3 gap-0.5 px-0.5">
        {pinnedPosts.map((pinned) => (
          <div key={pinned.id} className="relative aspect-square">
            <button
              onClick={() => onPostPress(pinned.post_id)}
              className="w-full h-full"
            >
              {pinned.post?.media_url ? (
                <img loading="lazy"
                  src={pinned.post.thumbnail_url ?? pinned.post.media_url}
                  alt="Pinned post"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center">
                  <Pin className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
            </button>

            {/* Иконка булавки */}
            <div className="absolute top-1 left-1 bg-black/60 rounded-full p-1">
              <Pin className="w-3 h-3 text-white fill-white" />
            </div>

            {/* Кнопка открепления для владельца */}
            {isOwner && (
              <button
                onClick={() => handleUnpin(pinned.id)}
                disabled={unpinning === pinned.id}
                className="absolute top-1 right-1 bg-black/60 rounded-full p-1"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Разделитель */}
      <div className="h-px bg-border mx-4 mt-2" />
    </div>
  );
}

/**
 * Хук для закрепления поста (вызывается из PostOptionsSheet)
 */
export function usePinPost() {
  const { user } = useAuth();

  const pinPost = async (postId: string, currentPinnedCount: number): Promise<boolean> => {
    if (!user) return false;
    if (currentPinnedCount >= 3) {
      toast.error("Максимум 3 закреплённых поста");
      return false;
    }
    const { error } = await dbLoose.from("pinned_posts").insert({
      user_id: user.id,
      post_id: postId,
      position: currentPinnedCount,
    });
    if (error) {
      if (error.code === "23505") {
        toast.error("Пост уже закреплён");
      } else {
        toast.error("Ошибка закрепления");
      }
      return false;
    }
    toast.success("Пост закреплён");
    return true;
  };

  return { pinPost };
}
