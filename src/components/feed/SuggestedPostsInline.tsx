import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Heart } from "lucide-react";

interface SuggestedPost {
  id: string;
  image_url: string;
  likes_count: number;
  author: {
    id: string;
    username: string;
    avatar_url: string;
  };
}

export function SuggestedPostsInline() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<SuggestedPost[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("posts")
        .select(`
          id,
          image_url,
          likes_count,
          profiles:user_id (id, username, avatar_url)
        `)
        .not("image_url", "is", null)
        .order("likes_count", { ascending: false })
        .limit(8);
      if (data) {
        setPosts(
          data.map((p: any) => ({
            id: p.id,
            image_url: p.image_url,
            likes_count: p.likes_count ?? 0,
            author: {
              id: p.profiles?.id ?? "",
              username: p.profiles?.username ?? "user",
              avatar_url: p.profiles?.avatar_url ?? `https://i.pravatar.cc/40?u=${p.id}`,
            },
          }))
        );
      }
    })();
  }, []);

  if (posts.length === 0) return null;

  return (
    <div className="bg-card border-b border-border py-3">
      <p className="px-4 text-sm font-semibold text-foreground mb-2">Рекомендуемые для вас</p>
      <div className="flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-hide">
        {posts.map((post) => (
          <button
            key={post.id}
            onClick={() => navigate(`/post/${post.id}`)}
            className="flex-shrink-0 w-32 rounded-xl overflow-hidden relative"
          >
            <img
              src={post.image_url}
              alt=""
              className="w-32 h-40 object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 p-2">
              <div className="flex items-center gap-1">
                <img
                  src={post.author.avatar_url}
                  alt={post.author.username}
                  className="w-5 h-5 rounded-full border border-white"
                />
                <span className="text-white text-xs truncate">{post.author.username}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Heart className="w-3 h-3 text-white" />
                <span className="text-white text-xs">{post.likes_count}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
