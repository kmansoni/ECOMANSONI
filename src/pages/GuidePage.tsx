import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import { getGuides, getGuideItems, deleteGuide, removeFromGuide } from "@/hooks/useGuides";
import type { Guide, GuideItem } from "@/hooks/useGuides";
import { dbLoose } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface GuidePostPreview {
  id: string;
  image_url?: string | null;
  caption?: string | null;
}

export default function GuidePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [guide, setGuide] = useState<Guide | null>(null);
  const [items, setItems] = useState<GuideItem[]>([]);
  const [posts, setPosts] = useState<Record<string, GuidePostPreview>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      try {
        const [guideData, itemsData] = await Promise.all([
          dbLoose.from("guides").select("*").eq("id", id).single().then((r) => r.data as unknown as Guide | null),
          getGuideItems(id),
        ]);
        setGuide(guideData);
        setItems(itemsData);

        // Load post data
        const postIds = itemsData.filter((i: GuideItem) => i.content_type === "post").map((i: GuideItem) => i.content_id);
        if (postIds.length) {
          const { data } = await dbLoose.from("posts").select("id, image_url, caption").in("id", postIds);
          if (data) {
            const map: Record<string, GuidePostPreview> = {};
            (data as unknown as GuidePostPreview[]).forEach((p) => { map[p.id] = p; });
            setPosts(map);
          }
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleDeleteGuide = async () => {
    if (!id || !confirm("Удалить этот гайд?")) return;
    try {
      await deleteGuide(id);
      toast.success("Гайд удалён");
      navigate(-1);
    } catch (_err) {
      toast.error("Не удалось удалить гайд");
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await removeFromGuide(itemId);
      setItems(prev => prev.filter(i => i.id !== itemId));
      toast.success("Удалено из гайда");
    } catch (_err) {
      toast.error("Ошибка");
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  if (!guide) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3">
      <p className="text-muted-foreground">Гайд не найден</p>
      <button onClick={() => navigate(-1)} className="text-primary text-sm">Назад</button>
    </div>
  );

  const isAuthor = user?.id === guide.author_id;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border">
        <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-foreground font-semibold flex-1 truncate">{guide.title}</h1>
        {isAuthor && (
          <button onClick={handleDeleteGuide} className="text-destructive">
            <Trash2 className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Cover */}
      {guide.cover_url && (
        <img loading="lazy" src={guide.cover_url} alt={guide.title} className="w-full aspect-video object-cover" />
      )}

      {/* Description */}
      {guide.description && (
        <div className="px-4 py-3">
          <p className="text-muted-foreground text-sm">{guide.description}</p>
        </div>
      )}

      {/* Items */}
      <div className="px-4 py-2 space-y-4">
        {items.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">Нет элементов в гайде</p>
        )}
        {items.map((item, i) => {
          const post = posts[item.content_id];
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-card rounded-2xl overflow-hidden"
            >
              {post?.image_url && (
                <img loading="lazy" src={post.image_url} alt="" className="w-full aspect-square object-cover" />
              )}
              <div className="p-3">
                {item.note && <p className="text-foreground text-sm mb-1">{item.note}</p>}
                {post?.caption && <p className="text-muted-foreground text-xs line-clamp-2">{post.caption}</p>}
                {isAuthor && (
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="mt-2 text-xs text-destructive"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
