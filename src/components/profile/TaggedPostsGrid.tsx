import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { dbLoose } from "@/lib/supabase";

interface TaggedPostsGridProps {
  userId: string;
  onPostClick?: (postId: string) => void;
}

interface TaggedPost {
  post_id: string;
  image_url?: string;
}

export function TaggedPostsGrid({ userId, onPostClick }: TaggedPostsGridProps) {
  const [posts, setPosts] = useState<TaggedPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      try {
        const { data } = await dbLoose
          .from("post_user_tags")
          .select("post_id, posts(id, image_url)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(30);
        const rows = (data ?? []) as Array<{ post_id: string; posts: { image_url: string | null } | null }>;
        setPosts(
          rows.map((d) => ({
            post_id: d.post_id,
            image_url: d.posts?.image_url,
          }))
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
        <p className="text-sm">Нет отмеченных публикаций</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-px">
      {posts.map(post => (
        <button
          key={post.post_id}
          onClick={() => onPostClick?.(post.post_id)}
          className="aspect-square bg-muted overflow-hidden"
        >
          {post.image_url && (
            <img src={post.image_url} alt="" className="w-full h-full object-cover" />
          )}
        </button>
      ))}
    </div>
  );
}
