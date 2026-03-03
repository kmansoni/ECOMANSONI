import { useEffect, useState } from 'react';
import { Sparkles, Play } from 'lucide-react';
import { useRecommendations } from '@/hooks/useRecommendations';
import { tracker } from '@/lib/recommendations/tracker';
import type { ContentItem } from '@/lib/recommendations/engine';

interface ForYouSectionProps {
  className?: string;
}

export function ForYouSection({ className = '' }: ForYouSectionProps) {
  const { getRecommendedFeed, getRecommendedReels } = useRecommendations();
  const [items, setItems] = useState<Array<ContentItem & { thumbnail?: string; title?: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [posts, reels] = await Promise.all([
          getRecommendedFeed(0, 3),
          getRecommendedReels(3),
        ]);
        const combined = [...(reels ?? []), ...(posts ?? [])].slice(0, 6);
        setItems(combined);
      } finally {
        setLoading(false);
      }
    })();
  }, [getRecommendedFeed, getRecommendedReels]);

  if (loading) {
    return (
      <section className={`${className} px-4 py-4`} aria-label="Загрузка раздела Для вас">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 bg-muted rounded animate-pulse" />
          <div className="w-24 h-4 bg-muted rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (!items.length) return null;

  return (
    <section className={`${className} px-4 py-4`} aria-labelledby="for-you-heading">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 id="for-you-heading" className="text-sm font-semibold text-foreground">
          Для вас
        </h2>
        <span className="text-xs text-muted-foreground ml-1">· На основе ваших интересов</span>
      </div>

      <div
        className="grid grid-cols-3 gap-1.5"
        role="list"
        aria-label="Рекомендованный контент"
      >
        {items.map((item) => (
          <button
            key={item.id}
            role="listitem"
            className="aspect-square relative rounded-lg overflow-hidden bg-muted group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => {
              tracker.trackView(item.contentType, item.id);
            }}
            aria-label={`${item.contentType === 'reel' ? 'Reels' : 'Пост'} от автора`}
          >
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt=""
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                aria-hidden="true"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                {item.contentType === 'reel' ? (
                  <Play className="w-6 h-6 text-primary/60" aria-hidden="true" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20" aria-hidden="true" />
                )}
              </div>
            )}

            {item.contentType === 'reel' && (
              <div className="absolute top-1.5 right-1.5">
                <Play className="w-3 h-3 text-white fill-white drop-shadow" aria-hidden="true" />
              </div>
            )}

            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}
