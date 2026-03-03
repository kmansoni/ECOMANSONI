import { Grid3X3, Bookmark, Play, AtSign, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface ProfileGridProps {
  items: any[];
  loading: boolean;
  type: "posts" | "reels" | "tagged" | "saved";
  onItemClick?: (item: any) => void;
}

const emptyMessage: Record<string, { icon: any; title: string; desc: string }> = {
  posts: { icon: Grid3X3, title: "Нет публикаций", desc: "Создайте свою первую публикацию" },
  reels: { icon: Play, title: "Нет Reels", desc: "Снимите своё первое видео" },
  tagged: { icon: AtSign, title: "Нет отметок", desc: "Публикации с вашими отметками появятся здесь" },
  saved: { icon: Bookmark, title: "Сохранённое", desc: "Сохраняйте понравившиеся публикации" },
};

export function ProfileGrid({ items, loading, type, onItemClick }: ProfileGridProps) {
  if (loading && items.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square bg-muted animate-pulse rounded-sm" />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    const { icon: Icon, title, desc } = emptyMessage[type];
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-16 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-card/80 border border-border flex items-center justify-center mx-auto mb-3">
          <Icon className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-[1px]">
      {items.map((item, i) => {
        const isReel = type === "reels";
        const imageUrl = isReel
          ? item.thumbnail_url
          : item.post_media?.[0]?.media_url;
        const isVideo = !isReel && item.post_media?.[0]?.media_type === "video";
        const multiMedia = !isReel && (item.post_media?.length || 0) > 1;

        return (
          <motion.button
            key={item.id || i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
            onClick={() => onItemClick?.(item)}
            className="relative aspect-square overflow-hidden bg-muted group"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-neutral-800">
                {isReel ? (
                  <Play className="w-6 h-6 text-white/40 fill-white/40" />
                ) : (
                  <Grid3X3 className="w-6 h-6 text-white/40" />
                )}
              </div>
            )}
            {/* Indicators */}
            {isReel && (
              <div className="absolute top-1.5 right-1.5">
                <Play className="w-4 h-4 text-white fill-white drop-shadow-lg" />
              </div>
            )}
            {isVideo && !isReel && (
              <div className="absolute top-1.5 right-1.5">
                <Play className="w-4 h-4 text-white fill-white drop-shadow-lg" />
              </div>
            )}
            {multiMedia && (
              <div className="absolute top-1.5 right-1.5">
                <div className="w-4 h-4 rounded-sm border-2 border-white/80 bg-white/20" />
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
