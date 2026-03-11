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
  AtSign,
  Search,
  Star,
  Tag,
  Crown,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import {
  useCollectibleUsernames,
  type CollectibleUsername,
  type UsernameCategory,
} from "@/hooks/useCollectibleUsernames";

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Category badge style mapping
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

const CATEGORY_STYLES: Record<
  UsernameCategory,
  { label: string; className: string }
> = {
  standard: {
    label: "Standard",
    className: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  },
  rare: {
    label: "Rare",
    className: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  },
  legendary: {
    label: "Legendary",
    className: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  },
  og: {
    label: "OG",
    className: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  },
};

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Category filter tabs
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

const CATEGORIES: { value: UsernameCategory | "all"; label: string }[] = [
  { value: "all", label: "ÃÃÃÂµ" },
  { value: "standard", label: "Standard" },
  { value: "rare", label: "Rare" },
  { value: "legendary", label: "Legendary" },
  { value: "og", label: "OG" },
];

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Props
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

interface CollectibleUsernamesSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Marketplace card
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

interface MarketCardProps {
  item: CollectibleUsername;
  onBuy: (id: string) => void;
  buying: boolean;
}

function MarketCard({ item, onBuy, buying }: MarketCardProps) {
  const style = CATEGORY_STYLES[item.category];
  return (
    <Card className="p-3 flex items-center gap-3 bg-white/5 border-white/10">
      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
        <AtSign className="w-5 h-5 text-white/60" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white text-sm">
            @{item.username}
          </span>
          <Badge
            variant="outline"
            className={`text-xs ${style.className}`}
          >
            {style.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-xs text-yellow-400">
          <Star className="w-3 h-3 fill-yellow-400" />
          <span>{item.price_stars.toLocaleString()} Stars</span>
        </div>
      </div>

      <Button
        size="sm"
        className="flex-shrink-0 h-8 text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-semibold"
        disabled={buying}
        onClick={() => onBuy(item.id)}
      >
        <ShoppingBag className="w-3 h-3 mr-1" />
        ÃÃÃÂ¿ÃÂ¸ÃÃ
      </Button>
    </Card>
  );
}

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// My username card
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

interface MyUsernameCardProps {
  item: CollectibleUsername;
  onActivate: (id: string) => void;
  onList: (id: string) => void;
  onDelist: (id: string) => void;
  actionLoading: boolean;
  listingId: string | null;
  listPrice: string;
  onListPriceChange: (v: string) => void;
  onConfirmList: () => void;
}

function MyUsernameCard({
  item,
  onActivate,
  onList,
  onDelist,
  actionLoading,
  listingId,
  listPrice,
  onListPriceChange,
  onConfirmList,
}: MyUsernameCardProps) {
  const style = CATEGORY_STYLES[item.category];
  const isListingThis = listingId === item.id;

  return (
    <Card className="p-3 flex flex-col gap-2 bg-white/5 border-white/10">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
          <AtSign className="w-5 h-5 text-white/60" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm">
              @{item.username}
            </span>
            <Badge variant="outline" className={`text-xs ${style.className}`}>
              {style.label}
            </Badge>
            {item.is_for_sale && (
              <Badge variant="outline" className="text-xs bg-green-500/20 text-green-300 border-green-500/30">
                <Tag className="w-2.5 h-2.5 mr-1" />
                ÃÃÂ° ÃÂ¿ÃÃÂ¾ÃÂ´ÃÂ°ÃÂ¶ÃÂµ
              </Badge>
            )}
          </div>
          {item.is_for_sale && (
            <div className="flex items-center gap-1 mt-0.5 text-xs text-yellow-400">
              <Star className="w-3 h-3 fill-yellow-400" />
              <span>{item.price_stars.toLocaleString()} Stars</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-white/20 text-white/70 hover:text-white flex-1"
          disabled={actionLoading}
          onClick={() => onActivate(item.id)}
        >
          <Crown className="w-3 h-3 mr-1 text-yellow-400" />
          ÃÃÂºÃÃÂ¸ÃÂ²ÃÂ¸ÃÃÂ¾ÃÂ²ÃÂ°ÃÃ
        </Button>

        {item.is_for_sale ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-500/30 text-red-400 hover:text-red-300 flex-1"
            disabled={actionLoading}
            onClick={() => onDelist(item.id)}
          >
            ÃÃÂ½ÃÃÃ Ã ÃÂ¿ÃÃÂ¾ÃÂ´ÃÂ°ÃÂ¶ÃÂ¸
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-yellow-500/30 text-yellow-400 hover:text-yellow-300 flex-1"
            disabled={actionLoading}
            onClick={() => onList(item.id)}
          >
            <ExternalLink className="w-3 h-3 mr-1" />
            ÃÃÃÃÃÃÂµ ÃÂ½ÃÂ° ÃÂ¿ÃÃÂ¾ÃÂ´ÃÂ°ÃÂ¶Ã
          </Button>
        )}
      </div>

      {/* Inline price input when listing */}
      {isListingThis && (
        <div className="flex gap-2 items-center pt-1 border-t border-white/10">
          <div className="relative flex-1">
            <Star className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-yellow-400" />
            <Input
              type="number"
              min={1}
              placeholder="ÃÃÂµÃÂ½ÃÂ° ÃÂ² Stars..."
              value={listPrice}
              onChange={(e) => onListPriceChange(e.target.value)}
              className="pl-7 h-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/30"
              autoFocus
            />
          </div>
          <Button
            size="sm"
            className="h-8 text-xs bg-yellow-500 hover:bg-yellow-400 text-black"
            disabled={actionLoading || !listPrice || Number(listPrice) < 1}
            onClick={onConfirmList}
          >
            ÃÃÃÃÂµÃÃÃ
          </Button>
        </div>
      )}
    </Card>
  );
}

// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢
// Main component
// Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢Ã¢

export function CollectibleUsernamesSheet({
  open,
  onOpenChange,
}: CollectibleUsernamesSheetProps) {
  const {
    loading,
    error,
    getMarketplace,
    getMyUsernames,
    purchaseUsername,
    listForSale,
    delistFromSale,
    setActiveUsername,
  } = useCollectibleUsernames();

  const [tab, setTab] = useState<"mine" | "market">("mine");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<UsernameCategory | "all">("all");
  const [marketplace, setMarketplace] = useState<CollectibleUsername[]>([]);
  const [myUsernames, setMyUsernames] = useState<CollectibleUsername[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  const [buying, setBuying] = useState(false);
  // State for inline "list for sale" inputs
  const [listingId, setListingId] = useState<string | null>(null);
  const [listPrice, setListPrice] = useState("");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const refreshMarket = useCallback(async () => {
    const data = await getMarketplace(
      categoryFilter === "all" ? undefined : categoryFilter,
      search || undefined
    );
    setMarketplace(data);
  }, [getMarketplace, categoryFilter, search]);

  const refreshMine = useCallback(async () => {
    const data = await getMyUsernames();
    setMyUsernames(data);
  }, [getMyUsernames]);

  useEffect(() => {
    if (!open) return;
    refreshMine();
    refreshMarket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-filter catalog on debounce
  useEffect(() => {
    if (!open || tab !== "market") return;
    const t = setTimeout(() => refreshMarket(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, open, tab]);

  const handleBuy = useCallback(
    async (id: string) => {
      setBuying(true);
      setStatusMsg(null);
      const result = await purchaseUsername(id);
      if (result.success) {
        setStatusMsg("ÃÃÃÂ¿ÃÂ»ÃÂµÃÂ½ÃÂ¾ ÃÃÃÂ¿ÃÂµÃÃÂ½ÃÂ¾!");
        await Promise.all([refreshMine(), refreshMarket()]);
      } else {
        setStatusMsg(result.error ?? "ÃÃÃÂ¸ÃÂ±ÃÂºÃÂ° ÃÂ¿ÃÂ¾ÃÂºÃÃÂ¿ÃÂºÃÂ¸");
      }
      setBuying(false);
    },
    [purchaseUsername, refreshMine, refreshMarket]
  );

  const handleActivate = useCallback(
    async (id: string) => {
      setActionLoading(true);
      setStatusMsg(null);
      const ok = await setActiveUsername(id);
      if (ok) setStatusMsg("Username ÃÂºÃÃÂ½ ÃÃÃÃÃÃÃÃÃÃ");
      else setStatusMsg("ÃÃÂµ ÃÃÂ´ÃÂ°ÃÂ»ÃÂ¾ÃÃ ÃÂ°ÃÂºÃÃÂ¸ÃÂ²ÃÂ¸ÃÃÂ¾ÃÂ²ÃÂ°ÃÃ");
      setActionLoading(false);
    },
    [setActiveUsername]
  );

  const handleList = useCallback((id: string) => {
    setListingId(id);
    setListPrice("");
  }, []);

  const handleConfirmList = useCallback(async () => {
    if (!listingId) return;
    setActionLoading(true);
    const ok = await listForSale(listingId, Number(listPrice));
    if (ok) {
      setListingId(null);
      setListPrice("");
      setStatusMsg("ÃÃÂ¾ÃÃÃÂ°ÃÂ²ÃÂ»ÃÂµÃÂ½ÃÂ¾ ÃÂ½ÃÂ° ÃÂ¿ÃÃÂ¾ÃÂ´ÃÂ°ÃÂ¶Ã");
      await refreshMine();
    } else {
      setStatusMsg(error ?? "ÃÃÃÂ¸ÃÂ±ÃÂºÃÂ° ÃÂ²ÃÃÃÃÂ°ÃÂ²ÃÂ»ÃÂµÃÂ½ÃÂ¸Ã");
    }
    setActionLoading(false);
  }, [listingId, listPrice, listForSale, refreshMine, error]);

  const handleDelist = useCallback(
    async (id: string) => {
      setActionLoading(true);
      const ok = await delistFromSale(id);
      if (ok) {
        setStatusMsg("ÃÃÂ½ÃÃÃÂ¾ Ã ÃÂ¿ÃÃÂ¾ÃÂ´ÃÂ°ÃÂ¶ÃÂ¸");
        await refreshMine();
      }
      setActionLoading(false);
    },
    [delistFromSale, refreshMine]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-[85vh] bg-[#1a2332] border-white/10 text-white flex flex-col p-0"
      >
        <SheetHeader className="px-4 pt-4 pb-2 flex-shrink-0">
          <SheetTitle className="text-white flex items-center gap-2">
            <AtSign className="w-5 h-5 text-yellow-400" />
            ÃÃÂ¾ÃÂ»ÃÂ»ÃÂµÃÂºÃÃÂ¸ÃÂ¾ÃÂ½ÃÂ½ÃÃÂµ ÃÃÃÂµÃÃÂ½ÃÃÂµ ÃÂ¸ÃÂ¼ÃÂµÃÂ½ÃÂ°
          </SheetTitle>
          {statusMsg && (
            <p className="text-xs text-center text-white/60 mt-1">{statusMsg}</p>
          )}
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as "mine" | "market");
            setStatusMsg(null);
          }}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <TabsList className="mx-4 bg-white/5 border border-white/10 flex-shrink-0">
            <TabsTrigger value="mine" className="flex-1 data-[state=active]:bg-yellow-600">
              ÃÃÂ¾ÃÂ¸ ({myUsernames.length})
            </TabsTrigger>
            <TabsTrigger value="market" className="flex-1 data-[state=active]:bg-yellow-600">
              ÃÃÂ°ÃÃÂºÃÂµÃÃÂ¿ÃÂ»ÃÂµÃÂ¹Ã
            </TabsTrigger>
          </TabsList>

          {/* Ã¢Ã¢ My usernames tab Ã¢Ã¢ */}
          <TabsContent value="mine" className="flex-1 overflow-hidden m-0 mt-2">
            <ScrollArea className="h-full px-4 pb-4">
              {loading && myUsernames.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-white/40 text-sm">
                  ÃÃÂ°ÃÂ³ÃÃÃÂ·ÃÂºÃÂ°...
                </div>
              ) : myUsernames.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/40">
                  <AtSign className="w-8 h-8 opacity-30" />
                  <span className="text-sm">ÃÃÂµÃ ÃÂºÃÂ¾ÃÂ»ÃÂ»ÃÂµÃÂºÃÃÂ¸ÃÂ¾ÃÂ½ÃÂ½ÃÃ ÃÃÃÂµÃÃÂ½ÃÃ ÃÂ¸ÃÂ¼ÃÃÂ½</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-yellow-400 text-xs"
                    onClick={() => setTab("market")}
                  >
                    ÃÃÂµÃÃÂµÃÂ¹ÃÃÂ¸ ÃÂ² ÃÃÂ°ÃÃÂºÃÂµÃÃÂ¿ÃÂ»ÃÂµÃÂ¹Ã
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {myUsernames.map((item) => (
                    <MyUsernameCard
                      key={item.id}
                      item={item}
                      onActivate={handleActivate}
                      onList={handleList}
                      onDelist={handleDelist}
                      actionLoading={actionLoading}
                      listingId={listingId}
                      listPrice={listPrice}
                      onListPriceChange={setListPrice}
                      onConfirmList={handleConfirmList}
                    />
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Ã¢Ã¢ Marketplace tab Ã¢Ã¢ */}
          <TabsContent value="market" className="flex-1 overflow-hidden m-0 mt-2 flex flex-col">
            {/* Filters */}
            <div className="px-4 pb-2 flex flex-col gap-2 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                  placeholder="ÃÃÂ¾ÃÂ¸ÃÃÂº @username..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>

              {/* Category pills */}
              <div className="flex gap-1 overflow-x-auto pb-1">
                {CATEGORIES.map((cat) => (
                  <Button
                    key={cat.value}
                    size="sm"
                    variant={categoryFilter === cat.value ? "default" : "ghost"}
                    className={`h-6 text-xs px-3 flex-shrink-0 ${
                      categoryFilter === cat.value
                        ? "bg-yellow-600 text-white"
                        : "text-white/50"
                    }`}
                    onClick={() => setCategoryFilter(cat.value)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </div>

            <ScrollArea className="flex-1 px-4 pb-4">
              {loading && marketplace.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-white/40 text-sm">
                  ÃÃÂ°ÃÂ³ÃÃÃÂ·ÃÂºÃÂ°...
                </div>
              ) : marketplace.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-white/40">
                  <ShoppingBag className="w-8 h-8 opacity-30" />
                  <span className="text-sm">
                    {search || categoryFilter !== "all"
                      ? "ÃÃÂ¸ÃÃÂµÃÂ³ÃÂ¾ ÃÂ½ÃÂµ ÃÂ½ÃÂ°ÃÂ¹ÃÂ´ÃÂµÃÂ½ÃÂ¾"
                      : "ÃÃÂ°ÃÃÂºÃÂµÃÃÂ¿ÃÂ»ÃÂµÃÂ¹Ã ÃÂ¿ÃÃÃ"}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {error && (
                    <p className="text-xs text-red-400 mb-1">{error}</p>
                  )}
                  {marketplace.map((item) => (
                    <MarketCard
                      key={item.id}
                      item={item}
                      onBuy={handleBuy}
                      buying={buying}
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

export default CollectibleUsernamesSheet;
