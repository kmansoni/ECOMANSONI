import { useEffect, useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import { getTrendingGifs, searchGifs, type GifItem } from "@/lib/chat/gifService";

interface StoryGifPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (gif: GifItem) => void;
}

export function StoryGifPicker({ isOpen, onClose, onSelect }: StoryGifPickerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GifItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const response = query.trim()
          ? await searchGifs(query.trim(), 24)
          : await getTrendingGifs(24);
        if (!cancelled) {
          setItems(response.results ?? []);
        }
      } catch {
        if (!cancelled) {
          setItems([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const timer = setTimeout(() => {
      void run();
    }, query.trim() ? 250 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, query]);

  const rows = useMemo(() => {
    const left: GifItem[] = [];
    const right: GifItem[] = [];
    items.forEach((item, index) => {
      if (index % 2 === 0) left.push(item);
      else right.push(item);
    });
    return [left, right] as const;
  }, [items]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 safe-area-top">
        <h2 className="text-white text-base font-semibold">GIF</h2>
        <button onClick={onClose} className="p-1 text-white/80 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-white/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск GIF..."
            className="w-full bg-transparent text-white placeholder:text-white/50 text-sm outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {loading ? (
          <div className="h-full flex items-center justify-center text-white/60 text-sm">Загрузка GIF...</div>
        ) : items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-white/60 text-sm">Ничего не найдено</div>
        ) : (
          <div className="flex gap-2">
            {rows.map((column, columnIndex) => (
              <div key={columnIndex} className="flex-1 space-y-2">
                {column.map((gif) => {
                  const isVideo = gif.url.endsWith(".mp4") || gif.url.endsWith(".webm");
                  return (
                    <button
                      key={gif.id}
                      onClick={() => onSelect(gif)}
                      className="w-full rounded-xl overflow-hidden bg-white/5"
                    >
                      {isVideo ? (
                        <video
                          src={gif.url}
                          poster={gif.previewUrl}
                          autoPlay
                          loop
                          muted
                          playsInline
                          className="w-full h-auto block"
                        />
                      ) : (
                        <img src={gif.previewUrl} alt={gif.title || "GIF"} className="w-full h-auto block" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}