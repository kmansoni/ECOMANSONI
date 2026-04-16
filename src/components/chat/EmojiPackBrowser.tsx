/**
 * EmojiPackBrowser — полноэкранный браузер эмодзи-паков.
 * Поиск, карточки паков с превью + install count, кнопка "Установить".
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Search, Download, Check, Package } from "lucide-react";
import { useCustomEmoji } from "@/hooks/useCustomEmoji";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface EmojiPackBrowserProps {
  onBack: () => void;
}

export function EmojiPackBrowser({ onBack }: EmojiPackBrowserProps) {
  const { myPacks, browseResults, browsePacks, installPack, uninstallPack, browseLoading } = useCustomEmoji();
  const [searchQuery, setSearchQuery] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);

  // Загружаем популярные при открытии
  useEffect(() => {
    void browsePacks();
  }, [browsePacks]);

  const handleSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      void browsePacks(query.trim() || undefined);
    },
    [browsePacks],
  );

  const handleInstall = useCallback(
    async (packId: string) => {
      setInstallingId(packId);
      await installPack(packId);
      setInstallingId(null);
    },
    [installPack],
  );

  const handleUninstall = useCallback(
    async (packId: string) => {
      setInstallingId(packId);
      await uninstallPack(packId);
      setInstallingId(null);
    },
    [uninstallPack],
  );

  const isInstalled = useCallback(
    (packId: string) => myPacks.some((p) => p.id === packId),
    [myPacks],
  );

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <button
          onClick={onBack}
          className="p-2 rounded-full hover:bg-white/10 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-semibold flex-1">Магазин эмодзи</h2>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Поиск паков эмодзи..."
            className="pl-9"
            aria-label="Поиск эмодзи-паков"
          />
        </div>
      </div>

      {/* Pack list */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {browseLoading && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        )}

        {!browseLoading && browseResults.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Package className="w-12 h-12 opacity-30" />
            <p className="text-sm">
              {searchQuery.trim() ? "Ничего не найдено" : "Нет доступных паков"}
            </p>
          </div>
        )}

        {!browseLoading &&
          browseResults.map((pack) => {
            const installed = isInstalled(pack.id);
            const isProcessing = installingId === pack.id;

            return (
              <motion.div
                key={pack.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 rounded-xl bg-white/5 border border-white/10"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{pack.name}</h3>
                    {pack.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {pack.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <Download className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {pack.install_count} установок
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {pack.emojis.length} эмодзи
                      </span>
                    </div>
                  </div>

                  <Button
                    variant={installed ? "outline" : "default"}
                    size="sm"
                    disabled={isProcessing}
                    onClick={() => (installed ? handleUninstall(pack.id) : handleInstall(pack.id))}
                    className="min-h-[44px] min-w-[44px] shrink-0"
                    aria-label={installed ? "Удалить пак" : "Установить пак"}
                  >
                    {isProcessing ? (
                      <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
                    ) : installed ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Удалить
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-1" />
                        Установить
                      </>
                    )}
                  </Button>
                </div>

                {/* Emoji preview */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {pack.emojis.slice(0, 10).map((emoji) => (
                    <img loading="lazy" key={emoji.id}
                      src={emoji.image_url}
                      alt={emoji.shortcode}
                      className="w-10 h-10 rounded-lg object-contain shrink-0 bg-white/5"
                      
                    />
                  ))}
                  {pack.emojis.length > 10 && (
                    <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <span className="text-xs text-muted-foreground">+{pack.emojis.length - 10}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}
