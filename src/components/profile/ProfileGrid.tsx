import { useState } from "react";
import { Grid3X3, Bookmark, Play, AtSign } from "lucide-react";
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
  const [failedVariantByKey, setFailedVariantByKey] = useState<Record<string, number>>({});

  const selectPreviewVariant = (item: any, index: number) => {
    const key = String(item?.id ?? index);
    const isReel = type === "reels";

    const reelCandidates = [item?.thumbnail_url].filter((u: unknown): u is string => typeof u === "string" && u.trim().length > 0);
    const postMedia = Array.isArray(item?.post_media) ? item.post_media : [];
    const postCandidates = postMedia
      .map((m: any) => ({
        url: typeof m?.media_url === "string" ? m.media_url.trim() : "",
        mediaType: typeof m?.media_type === "string" ? m.media_type : null,
      }))
      .filter((m: { url: string }) => m.url.length > 0);

    const orderedPostCandidates = [
      ...postCandidates.filter((m: { mediaType: string | null }) => m.mediaType !== "video"),
      ...postCandidates.filter((m: { mediaType: string | null }) => m.mediaType === "video"),
    ];

    const variants = isReel
      ? reelCandidates.map((url: string) => ({ url, mediaType: "video" }))
      : orderedPostCandidates;

    const failedIndex = failedVariantByKey[key] ?? 0;
    const candidate = failedIndex >= 0 ? variants[failedIndex] : undefined;

    return {
      key,
      imageUrl: candidate?.url ?? "",
      isReel,
      isVideo: !isReel && (candidate?.mediaType === "video" || item?.post_media?.[0]?.media_type === "video"),
      multiMedia: !isReel && (item?.post_media?.length || 0) > 1,
      variantsCount: variants.length,
      failedIndex,
    };
  };

  const rotateToNextVariant = (key: string, variantsCount: number, failedIndex: number) => {
    setFailedVariantByKey((prev) => {
      if (variantsCount <= 1 || failedIndex >= variantsCount - 1) {
        return { ...prev, [key]: -1 };
      }
      return { ...prev, [key]: failedIndex + 1 };
    });
  };

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
        const { key, imageUrl, isReel, isVideo, multiMedia, variantsCount, failedIndex } = selectPreviewVariant(item, i);

        return (
          <motion.button
            key={key}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
            type="button"
            onClick={() => onItemClick?.(item)}
            disabled={!onItemClick}
            className="relative aspect-square overflow-hidden bg-muted group disabled:cursor-default"
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                onError={() => rotateToNextVariant(key, variantsCount, failedIndex)}
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
