import React, { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Package,
  Search,
  ArrowUp,
  ArrowDown,
  Heart,
  Star,
  Trash2,
} from "lucide-react";
import {
  useReactionPacks,
  type ReactionPack,
  type ReactionPackItem,
} from "@/hooks/useReactionPacks";

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Props
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface ReactionPacksSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Sub-component: Pack card shown in the Catalogue tab
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface PackCardProps {
  pack: ReactionPack;
  items: ReactionPackItem[];
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  actionLoading: boolean;
}

function PackCard({ pack, items, onInstall, onUninstall, actionLoading }: PackCardProps) {
  return (
    <Card className="p-3 flex flex-col gap-2 bg-white/5 border-white/10">
      <div className="flex items-start gap-3">
        {/* Cover */}
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
          {pack.cover_url ? (
            <img
              src={pack.cover_url}
              alt={pack.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <Package className="w-6 h-6 text-white/40" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-white truncate">
              {pack.name}
            </span>
            {pack.is_official && (
              <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-300 border-blue-500/30">
                Official
              </Badge>
            )}
          </div>
          {pack.description && (
            <p className="text-xs text-white/50 mt-0.5 line-clamp-2">
              {pack.description}
            </p>
          )}
          <div className="flex items-center gap-1 mt-1 text-xs text-white/40">
            <Heart className="w-3 h-3" />
            <span>{pack.install_count.toLocaleString()}</span>
          </div>
        </div>

        {/* Action */}
        <Button
          size="sm"
          variant={pack.installed ? "destructive" : "default"}
          className="flex-shrink-0 h-8 text-xs"
          disabled={actionLoading}
          onClick={() =>
            pack.installed ? onUninstall(pack.id) : onInstall(pack.id)
          }
        >
          {pack.installed ? "Ð£Ð´Ð°Ð»Ð¸ÑÑ" : "Ð£ÑÑÐ°Ð½Ð¾Ð²Ð¸ÑÑ"}
        </Button>
      </div>

      {/* Emoji preview */}
      {items.length > 0 && (
        <ScrollArea className="w-full">
          <div className="flex gap-1 pb-1">
            {items.slice(0, 24).map((item) => (
              <div
                key={item.id}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xl rounded-lg hover:bg-white/10 cursor-default select-none"
                title={item.emoji}
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.emoji}
                    className="w-6 h-6 object-contain"
                  />
                ) : (
                  item.emoji
                )}
              </div>
            ))}
            {items.length > 24 && (
              <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center text-xs text-white/40">
                +{items.length - 24}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Sub-component: Installed pack row with ââ reorder buttons
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

interface InstalledRowProps {
  pack: ReactionPack;
  index: number;
  total: number;
  items: ReactionPackItem[];
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onUninstall: (id: string) => void;
  actionLoading: boolean;
}

function InstalledRow({
  pack,
  index,
  total,
  items,
  onMoveUp,
  onMoveDown,
  onUninstall,
  actionLoading,
}: InstalledRowProps) {
  return (
    <Card className="p-3 flex flex-col gap-2 bg-white/5 border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 flex items-center justify-center flex-shrink-0">
          {pack.cover_url ? (
            <img src={pack.cover_url} alt={pack.name} className="w-full h-full object-cover" />
          ) : (
            <Package className="w-5 h-5 text-white/40" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm text-white truncate block">
            {pack.name}
          </span>
          <span className="text-xs text-white/40">{items.length} ÑÐµÐ°ÐºÑÐ¸Ð¹</span>
        </div>

        {/* Reorder buttons */}
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7 text-white/50 hover:text-white"
            disabled={index === 0 || actionLoading}
            onClick={() => onMoveUp(index)}
          >
            <ArrowUp className="w-3 h-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7 text-white/50 hover:text-white"
            disabled={index === total - 1 || actionLoading}
            onClick={() => onMoveDown(index)}
          >
            <ArrowDown className="w-3 h-3" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7 text-red-400/70 hover:text-red-400"
            disabled={actionLoading}
            onClick={() => onUninstall(pack.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Emoji preview */}
      {items.length > 0 && (
        <ScrollArea className="w-full">
          <div className="flex gap-1 pb-1">
            {items.slice(0, 16).map((item) => (
              <div
                key={item.id}
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-lg rounded hover:bg-white/10 select-none"
              >
                {item.image_url ? (
                  <img src={item.image_url} alt={item.emoji} className="w-5 h-5 object-contain" />
                ) : (
                  item.emoji
                )}
              </div>
            ))}
            {items.length > 16 && (
              <div className="w-7 h-7 flex-shrink-0 flex items-center justify-center text-xs text-white/40">
                +{items.length - 16}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </Card>
  );
}

// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ
// Main component
// âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function ReactionPacksSheet({ open, onOpenChange }: ReactionPacksSheetProps) {
  const {
    loading,
    error,
    getPublicPacks,
    getMyPacks,
    getPackItems,
    installPack,
    uninstallPack,
  } = useReactionPacks();

  const [tab, setTab] = useState<"installed" | "catalog">("installed");
  const [search, setSearch] = useState("");
  const [catalogPacks, setCatalogPacks] = useState<ReactionPack[]>([]);
  const [installedPacks, setInstalledPacks] = useState<ReactionPack[]>([]);
  // packId â items
  const [itemsCache, setItemsCache] = useState<Record<string, ReactionPackItem[]>>({});
  const [actionLoading, setActionLoading] = useState(false);

  // Load pack items for a list of packs
  const loadItems = useCallback(
    async (packs: ReactionPack[]) => {
      const toLoad = packs.filter((p) => !itemsCache[p.id]);
      if (toLoad.length === 0) return;
      const results = await Promise.all(
        toLoad.map(async (p) => ({ id: p.id, items: await getPackItems(p.id) }))
      );
      setItemsCache((prev) => {
        const next = { ...prev };
        results.forEach(({ id, items }) => { next[id] = items; });
        return next;
      });
    },
    [getPackItems, itemsCache]
  );

  // Refresh installed packs
  const refreshInstalled = useCallback(async () => {
    const packs = await getMyPacks();
    setInstalledPacks(packs);
    await loadItems(packs);
  }, [getMyPacks, loadItems]);

  // Refresh catalog packs
  const refreshCatalog = useCallback(async () => {
    const packs = await getPublicPacks(search || undefined);
    setCatalogPacks(packs);
    await loadItems(packs);
  }, [getPublicPacks, search, loadItems]);

  // Initial load
  useEffect(() => {
    if (!open) return;
    refreshInstalled();
    refreshCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-search on debounce
  useEffect(() => {
    if (!open || tab !== "catalog") return;
    const t = setTimeout(() => refreshCatalog(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, open, tab]);

  // âââ Install handler âââââââââââââââââââââââââââââââââââââââââââââââââââââ

  const handleInstall = useCallback(
    async (packId: string) => {
      setActionLoading(true);
      const ok = await installPack(packId);
      if (ok) {
        await Promise.all([refreshInstalled(), refreshCatalog()]);
      }
      setActionLoading(false);
    },
    [installPack, refreshInstalled, refreshCatalog]
  );

  // âââ Uninstall handler âââââââââââââââââââââââââââââââââââââââââââââââââââ

  const handleUninstall = useCallback(
    async (packId: string) => {
      setActionLoading(true);
      const ok = await uninstallPack(packId);
      if (ok) {
        await Promise.all([refreshInstalled(), refreshCatalog()]);
      }
      setActionLoading(false);
    },
    [uninstallPack, refreshInstalled, refreshCatalog]
  );

  // âââ Reorder (move up) âââââââââââââââââââââââââââââââââââââââââââââââââââ

  const handleMoveUp = useCallback(
    (index: number) => {
      setInstalledPacks((prev) => {
        const next = [...prev];
        const tmp = next[index - 1];
        next[index - 1] = next[index];
        next[index] = tmp;
        return next;
      });
    },
    []
  );

  // âââ Reorder (move down) âââââââââââââââââââââââââââââââââââââââââââââââââ

  const handleMoveDown = useCallback(
    (index: number) => {
      setInstalledPacks((prev) => {
        const next = [...prev];
        const tmp = next[index + 1];
        next[index + 1] = next[index];
        next[index] = tmp;
        return next;
      });
    },
    []
  );

  // âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] bg-[#1a2332] border-white/10 text-white flex flex-col p-0"
      >
        <SheetHeader className="px-4 pt-4 pb-2 flex-shrink-0">
          <SheetTitle className="text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            ÐÐ°Ð±Ð¾ÑÑ ÑÐµÐ°ÐºÑÐ¸Ð¹
          </SheetTitle>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "installed" | "catalog")}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <TabsList className="mx-4 bg-white/5 border border-white/10 flex-shrink-0">
            <TabsTrigger value="installed" className="flex-1 data-[state=active]:bg-blue-600">
              Ð£ÑÑÐ°Ð½Ð¾Ð²Ð»ÐµÐ½Ð½ÑÐµ ({installedPacks.length})
            </TabsTrigger>
            <TabsTrigger value="catalog" className="flex-1 data-[state=active]:bg-blue-600">
              ÐÐ°ÑÐ°Ð»Ð¾Ð³
            </TabsTrigger>
          </TabsList>

          {/* ââ Installed tab âââââââââââââââââââââââââââââââââââââââââââââââ */}
          <TabsContent value="installed" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-full px-4 pb-4">
              {loading && installedPacks.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-white/40 text-sm">
                  ÐÐ°Ð³ÑÑÐ·ÐºÐ°...
                </div>
              ) : installedPacks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/40">
                  <Package className="w-8 h-8 opacity-30" />
                  <span className="text-sm">ÐÐµÑ ÑÑÑÐ°Ð½Ð¾Ð²Ð»ÐµÐ½Ð½ÑÑ Ð½Ð°Ð±Ð¾ÑÐ¾Ð²</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-blue-400 text-xs"
                    onClick={() => setTab("catalog")}
                  >
                    ÐÐµÑÐµÐ¹ÑÐ¸ Ð² ÐºÐ°ÑÐ°Ð»Ð¾Ð³
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {installedPacks.map((pack, idx) => (
                    <InstalledRow
                      key={pack.id}
                      pack={pack}
                      index={idx}
                      total={installedPacks.length}
                      items={itemsCache[pack.id] ?? []}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      onUninstall={handleUninstall}
                      actionLoading={actionLoading}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* ââ Catalog tab âââââââââââââââââââââââââââââââââââââââââââââââââ */}
          <TabsContent value="catalog" className="flex-1 overflow-hidden m-0 mt-2 flex flex-col">
            {/* Search */}
            <div className="px-4 pb-2 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  placeholder="ÐÐ¾Ð¸ÑÐº Ð½Ð°Ð±Ð¾ÑÐ¾Ð²..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>
            </div>

            <ScrollArea className="flex-1 px-4 pb-4">
              {loading && catalogPacks.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-white/40 text-sm">
                  ÐÐ°Ð³ÑÑÐ·ÐºÐ°...
                </div>
              ) : catalogPacks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/40">
                  <Star className="w-8 h-8 opacity-30" />
                  <span className="text-sm">
                    {search ? "ÐÐ¸ÑÐµÐ³Ð¾ Ð½Ðµ Ð½Ð°Ð¹Ð´ÐµÐ½Ð¾" : "ÐÐ°ÑÐ°Ð»Ð¾Ð³ Ð¿ÑÑÑ"}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {error && (
                    <p className="text-xs text-red-400 mb-1">{error}</p>
                  )}
                  {catalogPacks.map((pack) => (
                    <PackCard
                      key={pack.id}
                      pack={pack}
                      items={itemsCache[pack.id] ?? []}
                      onInstall={handleInstall}
                      onUninstall={handleUninstall}
                      actionLoading={actionLoading}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default ReactionPacksSheet;
