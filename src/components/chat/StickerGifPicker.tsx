import { useState, useEffect, useRef, useCallback } from "react";
import EmojiPicker, { EmojiStyle, EmojiClickData, Theme, Categories } from "emoji-picker-react";
import { useTheme } from "next-themes";
import { useStickers, type Sticker } from "@/hooks/useStickers";
import { useSavedGifs } from "@/hooks/useSavedGifs";
import { searchGifs, getTrendingGifs, type GifItem } from "@/lib/chat/gifService";
import { Heart } from "lucide-react";
import { logger } from "@/lib/logger";

type Tab = "stickers" | "gif" | "emoji";

interface StickerGifPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEmojiSelect: (emoji: string) => void;
  onStickerSelect: (sticker: Sticker) => void;
  onGifSelect: (gif: GifItem) => void;
}

interface GifMasonryProps {
  gifs: GifItem[];
  onSelect: (gif: GifItem) => void;
  savedGifUrls: string[];
  onToggleSave: (gif: GifItem) => void;
}

function GifMasonry({ gifs, onSelect, savedGifUrls, onToggleSave }: GifMasonryProps) {
  const col1 = gifs.filter((_, i) => i % 2 === 0);
  const col2 = gifs.filter((_, i) => i % 2 === 1);

  const renderGif = (gif: GifItem) => {
    const isSaved = savedGifUrls.includes(gif.url);
    const isVideo = gif.url.endsWith(".mp4") || gif.url.endsWith(".webm");
    const heartClass = isSaved ? "fill-white text-white" : "text-white";
    const btnBg = isSaved ? "bg-red-500" : "bg-black/50";
    return (
      <div key={gif.id} className="relative group rounded-xl overflow-hidden mb-2">
        <button className="w-full block" onClick={() => onSelect(gif)}>
          {isVideo ? (
            <video
              src={gif.url}
              autoPlay
              loop
              muted
              playsInline
              className="w-full rounded-xl"
              poster={gif.previewUrl}
            />
          ) : (
            <img src={gif.previewUrl} alt="GIF" className="w-full rounded-xl" loading="lazy" />
          )}
        </button>
        <button
          className={`absolute top-1 right-1 w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${btnBg}`}
          onClick={(e) => { e.stopPropagation(); onToggleSave(gif); }}
        >
          <Heart size={14} className={heartClass} />
        </button>
      </div>
    );
  };

  return (
    <div className="flex gap-2">
      <div className="flex-1">{col1.map(renderGif)}</div>
      <div className="flex-1">{col2.map(renderGif)}</div>
    </div>
  );
}

interface StickerCellProps {
  sticker: Sticker;
  onPressStart: (s: Sticker) => void;
  onPressEnd: (s: Sticker) => void;
}

function StickerCell({ sticker, onPressStart, onPressEnd }: StickerCellProps) {
  return (
    <button
      className="aspect-square flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors p-1"
      onTouchStart={() => onPressStart(sticker)}
      onTouchEnd={() => onPressEnd(sticker)}
      onMouseDown={() => onPressStart(sticker)}
      onMouseUp={() => onPressEnd(sticker)}
    >
      <img
        src={sticker.file_url}
        alt={sticker.emoji || "стикер"}
        className="w-full h-full object-contain"
        loading="lazy"
      />
    </button>
  );
}

export function StickerGifPicker({
  open,
  onOpenChange: _onOpenChange,
  onEmojiSelect,
  onStickerSelect,
  onGifSelect,
}: StickerGifPickerProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeTab, setActiveTab] = useState<Tab>("stickers");
  const [stickerSearch, setStickerSearch] = useState("");
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState<GifItem[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [packStickers, setPackStickers] = useState<Record<string, Sticker[]>>({});
  const [previewSticker, setPreviewSticker] = useState<Sticker | null>(null);
  const [activePack, setActivePack] = useState<string>("recent");
  const gifSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { installedPacks, recentStickers, getPackStickers, trackUsage } = useStickers();
  const { savedGifs, saveGif, removeGif, isGifSaved } = useSavedGifs();

  // Загрузка стикеров из пака
  useEffect(() => {
    if (activePack !== "recent" && !packStickers[activePack]) {
      getPackStickers(activePack).then((stickers) => {
        setPackStickers((prev) => ({ ...prev, [activePack]: stickers }));
      });
    }
  }, [activePack, packStickers, getPackStickers]);

  // Предзагрузка стикеров для всех паков при открытии таба
  useEffect(() => {
    if (activeTab === "stickers" && installedPacks.length > 0) {
      installedPacks.forEach((pack) => {
        if (!packStickers[pack.id]) {
          getPackStickers(pack.id).then((stickers) => {
            setPackStickers((prev) => ({ ...prev, [pack.id]: stickers }));
          });
        }
      });
    }
  }, [activeTab, installedPacks, packStickers, getPackStickers]);

  // GIF: загрузка трендовых
  const loadTrendingGifs = useCallback(async () => {
    setGifLoading(true);
    try {
      const result = await getTrendingGifs(20);
      setGifResults(result.results);
    } catch (error) {
      logger.warn("sticker-gif-picker: failed to load trending gifs", { error });
      setGifResults([]);
    } finally {
      setGifLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "gif" && gifSearch === "") {
      loadTrendingGifs();
    }
  }, [activeTab, gifSearch, loadTrendingGifs]);

  // GIF: debounce поиск
  useEffect(() => {
    if (!gifSearch) return;
    if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current);
    gifSearchTimer.current = setTimeout(async () => {
      setGifLoading(true);
      try {
        const result = await searchGifs(gifSearch, 20);
        setGifResults(result.results);
      } catch (error) {
        logger.warn("sticker-gif-picker: gif search failed", { gifSearch, error });
        setGifResults([]);
      } finally {
        setGifLoading(false);
      }
    }, 300);
    return () => {
      if (gifSearchTimer.current) clearTimeout(gifSearchTimer.current);
    };
  }, [gifSearch]);

  const handleStickerPressStart = (sticker: Sticker) => {
    longPressTimer.current = setTimeout(() => setPreviewSticker(sticker), 500);
  };

  const handleStickerPressEnd = (sticker: Sticker) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (previewSticker) {
      setPreviewSticker(null);
      return;
    }
    trackUsage(sticker.id);
    onStickerSelect(sticker);
  };

  const filteredRecentStickers = stickerSearch
    ? recentStickers.filter((s) => s.emoji && s.emoji.includes(stickerSearch))
    : recentStickers;

  if (!open) return null;

  const tabBg = isDark ? "bg-[#1c1c1e] border-white/10" : "bg-[#f8f8f8] border-black/10";
  const inputClass = isDark
    ? "bg-white/10 text-white placeholder-white/40"
    : "bg-black/5 text-black placeholder-black/30";
  const emptyClass = isDark ? "text-white/30" : "text-black/30";
  const labelClass = isDark ? "text-white/40" : "text-black/40";
  const packLabelClass = isDark ? "text-white/60" : "text-black/60";

  return (
    <div
      className={`w-full border-t rounded-t-2xl overflow-hidden flex flex-col ${tabBg}`}
      style={{ height: "50vh", minHeight: 320 }}
    >
      {/* Drag handle */}
      <div className="flex justify-center py-2 flex-shrink-0">
        <div className={`w-10 h-1 rounded-full ${isDark ? "bg-white/30" : "bg-black/20"}`} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 flex-shrink-0">
        {(["stickers", "gif", "emoji"] as Tab[]).map((tab) => {
          const labels: Record<Tab, string> = {
            stickers: "🎭 Стикеры",
            gif: "GIF",
            emoji: "😀 Эмодзи",
          };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-cyan-400 border-b-2 border-cyan-400"
                  : isDark
                  ? "text-white/50 hover:text-white/70"
                  : "text-black/50 hover:text-black/70"
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">

        {/* ===== СТИКЕРЫ ===== */}
        {activeTab === "stickers" && (
          <div className="flex flex-col h-full">
            <div className="p-2 flex-shrink-0">
              <input
                type="text"
                placeholder="Поиск стикеров..."
                value={stickerSearch}
                onChange={(e) => setStickerSearch(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-xl text-sm outline-none ${inputClass}`}
              />
            </div>

            {/* Ряд паков */}
            <div className="flex gap-2 px-2 pb-2 overflow-x-auto flex-shrink-0 scrollbar-none">
              <button
                onClick={() => setActivePack("recent")}
                className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-colors ${
                  activePack === "recent"
                    ? "bg-cyan-400/20 text-cyan-400"
                    : isDark
                    ? "bg-white/10 hover:bg-white/20"
                    : "bg-black/5 hover:bg-black/10"
                }`}
              >
                🕐
              </button>
              {installedPacks.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => setActivePack(pack.id)}
                  className={`flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden transition-colors ${
                    activePack === pack.id ? "ring-2 ring-cyan-400" : ""
                  }`}
                >
                  {pack.thumbnail_url ? (
                    <img src={pack.thumbnail_url} alt={pack.title} className="w-full h-full object-contain" />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center text-xs font-bold ${isDark ? "bg-white/10 text-white" : "bg-black/10 text-black"}`}>
                      {pack.title.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Сетка */}
            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {activePack === "recent" ? (
                filteredRecentStickers.length > 0 ? (
                  <>
                    <p className={`text-xs mb-2 ${labelClass}`}>Недавние</p>
                    <div className="grid grid-cols-5 gap-2">
                      {filteredRecentStickers.map((s) => (
                        <StickerCell key={s.id} sticker={s} onPressStart={handleStickerPressStart} onPressEnd={handleStickerPressEnd} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={`flex flex-col items-center justify-center h-full ${emptyClass}`}>
                    <span className="text-4xl mb-2">🎭</span>
                    <p className="text-sm">Нет недавних стикеров</p>
                  </div>
                )
              ) : (
                installedPacks
                  .filter((p) => p.id === activePack)
                  .map((pack) => {
                    const stickers = packStickers[pack.id] || [];
                    return (
                      <div key={pack.id}>
                        <p className={`text-xs mb-2 font-medium ${packLabelClass}`}>{pack.title}</p>
                        {stickers.length > 0 ? (
                          <div className="grid grid-cols-5 gap-2">
                            {stickers.map((s) => (
                              <StickerCell key={s.id} sticker={s} onPressStart={handleStickerPressStart} onPressEnd={handleStickerPressEnd} />
                            ))}
                          </div>
                        ) : (
                          <div className={`text-center py-6 text-sm ${emptyClass}`}>
                            Стикеры загружаются...
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {/* ===== GIF ===== */}
        {activeTab === "gif" && (
          <div className="flex flex-col h-full">
            <div className="p-2 flex-shrink-0">
              <input
                type="text"
                placeholder="Поиск GIF..."
                value={gifSearch}
                onChange={(e) => setGifSearch(e.target.value)}
                className={`w-full px-3 py-1.5 rounded-xl text-sm outline-none ${inputClass}`}
              />
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-2">
              {!gifSearch && savedGifs.length > 0 && (
                <div className="mb-3">
                  <p className={`text-xs mb-2 ${labelClass}`}>❤️ Избранные</p>
                  <GifMasonry
                    gifs={savedGifs.map((g) => ({
                      id: g.id,
                      url: g.gif_url,
                      previewUrl: g.preview_url || g.gif_url,
                      width: g.width || 200,
                      height: g.height || 150,
                    }))}
                    onSelect={onGifSelect}
                    savedGifUrls={savedGifs.map((g) => g.gif_url)}
                    onToggleSave={(gif) => isGifSaved(gif.url) ? removeGif(gif.url) : saveGif(gif)}
                  />
                </div>
              )}

              {gifLoading ? (
                <div className={`flex items-center justify-center py-8 ${emptyClass}`}>
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-cyan-400 border-t-transparent" />
                </div>
              ) : gifResults.length > 0 ? (
                <>
                  {!gifSearch && <p className={`text-xs mb-2 ${labelClass}`}>В тренде</p>}
                  <GifMasonry
                    gifs={gifResults}
                    onSelect={onGifSelect}
                    savedGifUrls={savedGifs.map((g) => g.gif_url)}
                    onToggleSave={(gif) => isGifSaved(gif.url) ? removeGif(gif.url) : saveGif(gif)}
                  />
                </>
              ) : (
                <div className={`flex flex-col items-center justify-center h-32 ${emptyClass}`}>
                  <span className="text-3xl mb-2">🔍</span>
                  <p className="text-sm">Ничего не найдено</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== ЭМОДЗИ ===== */}
        {activeTab === "emoji" && (
          <div className="flex-1 overflow-hidden">
            <EmojiPicker
              onEmojiClick={(emojiData: EmojiClickData) => onEmojiSelect(emojiData.emoji)}
              emojiStyle={EmojiStyle.APPLE}
              theme={isDark ? Theme.DARK : Theme.LIGHT}
              width="100%"
              height="100%"
              searchDisabled={false}
              skinTonesDisabled={false}
              lazyLoadEmojis={true}
              previewConfig={{ showPreview: false }}
              searchPlaceHolder="Поиск эмодзи"
              categories={[
                { name: "Недавние", category: Categories.SUGGESTED },
                { name: "Смайлики", category: Categories.SMILEYS_PEOPLE },
                { name: "Животные", category: Categories.ANIMALS_NATURE },
                { name: "Еда", category: Categories.FOOD_DRINK },
                { name: "Путешествия", category: Categories.TRAVEL_PLACES },
                { name: "Активности", category: Categories.ACTIVITIES },
                { name: "Объекты", category: Categories.OBJECTS },
                { name: "Символы", category: Categories.SYMBOLS },
                { name: "Флаги", category: Categories.FLAGS },
              ]}
            />
          </div>
        )}
      </div>

      {/* Превью стикера */}
      {previewSticker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setPreviewSticker(null)}
        >
          <div className="bg-[#1c1c1e] rounded-3xl p-4 shadow-2xl">
            <img src={previewSticker.file_url} alt="стикер" className="w-48 h-48 object-contain" />
          </div>
        </div>
      )}

      <div className={`safe-area-bottom ${isDark ? "bg-[#1c1c1e]" : "bg-[#f8f8f8]"}`} />
    </div>
  );
}
