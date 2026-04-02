/**
 * CustomEmojiPicker — пикер кастомных эмодзи для чата.
 * Табы: "Мои паки" + "Поиск". Клик → вставить в сообщение.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, Package, Store } from "lucide-react";
import { useCustomEmoji } from "@/hooks/useCustomEmoji";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface CustomEmojiPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (shortcode: string, imageUrl: string) => void;
  onOpenBrowser?: () => void;
}

type TabType = "my" | "search";

export function CustomEmojiPicker({ open, onClose, onSelect, onOpenBrowser }: CustomEmojiPickerProps) {
  const { myPacks, browseResults, browsePacks, loading, browseLoading } = useCustomEmoji();
  const [tab, setTab] = useState<TabType>("my");
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      if (query.trim().length >= 2) {
        void browsePacks(query.trim());
      }
    },
    [browsePacks],
  );

  const handleEmojiClick = useCallback(
    (shortcode: string, imageUrl: string) => {
      onSelect(shortcode, imageUrl);
    },
    [onSelect],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="emoji-picker-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />

          <motion.div
            key="emoji-picker-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl border-t border-white/10 max-h-[60vh] flex flex-col"
          >
            {/* Handle */}
            <div className="flex items-center justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
              <h3 className="font-semibold text-base">Кастомные эмодзи</h3>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-white/10">
              <button
                onClick={() => setTab("my")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                  tab === "my" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                }`}
                aria-label="Мои паки"
              >
                <Package className="w-4 h-4 inline mr-1.5" />
                Мои паки
              </button>
              <button
                onClick={() => setTab("search")}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                  tab === "search" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"
                }`}
                aria-label="Поиск"
              >
                <Search className="w-4 h-4 inline mr-1.5" />
                Поиск
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {tab === "search" && (
                <Input
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Поиск паков..."
                  className="mb-3"
                  aria-label="Поиск эмодзи-паков"
                />
              )}

              {tab === "my" && loading && (
                <div className="grid grid-cols-6 gap-2">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="w-10 h-10 rounded-lg" />
                  ))}
                </div>
              )}

              {tab === "my" && !loading && myPacks.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <Package className="w-10 h-10 opacity-30" />
                  <p className="text-sm">Нет установленных паков</p>
                  <Button variant="outline" size="sm" onClick={() => setTab("search")} className="min-h-[44px]">
                    Найти паки
                  </Button>
                </div>
              )}

              {tab === "my" && !loading && myPacks.map((pack) => (
                <div key={pack.id} className="mb-4">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">{pack.name}</h4>
                  <div className="grid grid-cols-6 gap-2">
                    {pack.emojis.map((emoji) => (
                      <button
                        key={emoji.id}
                        onClick={() => handleEmojiClick(emoji.shortcode, emoji.image_url)}
                        className="w-10 h-10 rounded-lg hover:bg-white/10 transition-colors flex items-center justify-center min-h-[44px] min-w-[44px]"
                        title={`:${emoji.shortcode}:`}
                        aria-label={`Эмодзи ${emoji.shortcode}`}
                      >
                        <img
                          src={emoji.image_url}
                          alt={emoji.shortcode}
                          className="w-8 h-8 object-contain"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {tab === "search" && browseLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              )}

              {tab === "search" && !browseLoading && browseResults.length === 0 && searchQuery.trim().length >= 2 && (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <Search className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Ничего не найдено</p>
                </div>
              )}

              {tab === "search" && !browseLoading && browseResults.map((pack) => (
                <div key={pack.id} className="mb-3 p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-medium">{pack.name}</h4>
                      {pack.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{pack.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{pack.install_count} уст.</span>
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {pack.emojis.slice(0, 8).map((emoji) => (
                      <img
                        key={emoji.id}
                        src={emoji.image_url}
                        alt={emoji.shortcode}
                        className="w-8 h-8 rounded object-contain shrink-0"
                        loading="lazy"
                      />
                    ))}
                    {pack.emojis.length > 8 && (
                      <span className="text-xs text-muted-foreground self-center">+{pack.emojis.length - 8}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Магазин стикеров */}
            {onOpenBrowser && (
              <div className="p-3 border-t border-white/10">
                <Button
                  variant="outline"
                  className="w-full min-h-[44px]"
                  onClick={onOpenBrowser}
                  aria-label="Открыть магазин стикеров"
                >
                  <Store className="w-4 h-4 mr-2" />
                  Магазин стикеров
                </Button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
