import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  archiveStickerPack,
  bulkRestoreStickerPacks,
  getOrCreateUserEmojiPreferences,
  getOrCreateUserQuickReaction,
  installStickerPack,
  listArchivedStickerPacks,
  listEmojiSets,
  listQuickReactionCatalog,
  listStickerPacks,
  listMyStickerLibrary,
  setUserQuickReaction,
  updateUserEmojiPreferences,
  type EmojiSet,
  type StickerPack,
  type UserEmojiPreferences,
} from "@/lib/stickers-reactions";

type Props = {
  userId: string | null;
  isDark: boolean;
};

type InnerScreen = "main" | "archive" | "quick";

function cardClass(isDark: boolean): string {
  return cn("backdrop-blur-xl rounded-2xl border overflow-hidden", isDark ? "settings-dark-card" : "bg-card/80 border-white/20");
}

export function StickersAndReactionsCenter({ userId, isDark }: Props) {
  const [screen, setScreen] = useState<InnerScreen>("main");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [catalog, setCatalog] = useState<StickerPack[]>([]);
  const [myPacks, setMyPacks] = useState<StickerPack[]>([]);
  const [archivedPacks, setArchivedPacks] = useState<StickerPack[]>([]);
  const [emojiSets, setEmojiSets] = useState<EmojiSet[]>([]);
  const [emojiPrefs, setEmojiPrefs] = useState<UserEmojiPreferences | null>(null);
  const [quickReaction, setQuickReaction] = useState("❤️");
  const [quickCatalog, setQuickCatalog] = useState<string[]>([]);

  const filteredQuickReactions = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return quickCatalog;
    return quickCatalog.filter((item) => item.toLowerCase().includes(search));
  }, [quickCatalog, query]);

  const refreshAll = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [packs, mine, archived, sets, prefs, quick, quickSet] = await Promise.all([
        listStickerPacks(),
        listMyStickerLibrary(userId),
        listArchivedStickerPacks(userId),
        listEmojiSets(),
        getOrCreateUserEmojiPreferences(userId),
        getOrCreateUserQuickReaction(userId),
        listQuickReactionCatalog(),
      ]);
      setCatalog(packs);
      setMyPacks(mine);
      setArchivedPacks(archived);
      setEmojiSets(sets);
      setEmojiPrefs(prefs);
      setQuickReaction(quick.emoji);
      setQuickCatalog(quickSet);
    } catch (error) {
      toast({
        title: "Stickers and Emoji",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const install = async (packId: string) => {
    if (!userId) return;
    try {
      await installStickerPack(userId, packId);
      await refreshAll();
    } catch (error) {
      toast({ title: "Install pack", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const archive = async (packId: string) => {
    if (!userId) return;
    try {
      await archiveStickerPack(userId, packId);
      await refreshAll();
    } catch (error) {
      toast({ title: "Archive pack", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const restoreAll = async () => {
    if (!userId || !archivedPacks.length) return;
    try {
      await bulkRestoreStickerPacks(userId, archivedPacks.map((pack) => pack.id));
      await refreshAll();
    } catch (error) {
      toast({ title: "Restore archive", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const updatePrefs = async (
    patch: Partial<Omit<UserEmojiPreferences, "user_id" | "updated_at" | "created_at">>,
  ) => {
    if (!userId || !emojiPrefs) return;
    try {
      const next = await updateUserEmojiPreferences(userId, patch);
      setEmojiPrefs(next);
    } catch (error) {
      toast({ title: "Emoji preferences", description: error instanceof Error ? error.message : String(error) });
    }
  };

  const updateQuickReaction = async (emoji: string) => {
    if (!userId) return;
    try {
      const next = await setUserQuickReaction(userId, emoji);
      setQuickReaction(next.emoji);
    } catch (error) {
      toast({ title: "Quick reaction", description: error instanceof Error ? error.message : String(error) });
    }
  };

  if (!userId) {
    return <div className={cn("px-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Sign in required.</div>;
  }

  if (loading || !emojiPrefs) {
    return <div className={cn("px-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Loading...</div>;
  }

  if (screen === "archive") {
    return (
      <div className="px-4 pb-8 grid gap-3">
        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={() => setScreen("main")}>Back</Button>
          <Button variant="outline" onClick={() => void restoreAll()} disabled={!archivedPacks.length}>
            Restore all
          </Button>
        </div>

        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <p className="font-semibold">Archived sticker packs</p>
            <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>{archivedPacks.length} pack(s)</p>
          </div>
          <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
            {archivedPacks.map((pack, idx) => (
              <div
                key={pack.id}
                className={cn("px-5 py-4 flex items-center justify-between gap-3", idx < archivedPacks.length - 1 && (isDark ? "border-b border-white/10" : "border-b border-white/20"))}
              >
                <div>
                  <p className="font-medium">{pack.title}</p>
                  <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{pack.item_count} stickers</p>
                </div>
                <Button onClick={() => void install(pack.id)}>Add</Button>
              </div>
            ))}
            {archivedPacks.length === 0 ? (
              <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Archive is empty.</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "quick") {
    return (
      <div className="px-4 pb-8 grid gap-3">
        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={() => setScreen("main")}>Back</Button>
          <div className="text-2xl leading-none">{quickReaction}</div>
        </div>

        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <p className="font-semibold">Double tap preview</p>
            <div className={cn("mt-3 rounded-2xl px-4 py-3 text-sm", isDark ? "bg-white/10 text-white" : "bg-black/10 text-black")}>
              Tap message twice to send: <span className="font-semibold">{quickReaction}</span>
            </div>
          </div>
        </div>

        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reaction"
            />
            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1">
              {filteredQuickReactions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void updateQuickReaction(emoji)}
                  className={cn(
                    "w-11 h-11 shrink-0 rounded-full text-2xl border",
                    quickReaction === emoji
                      ? "border-blue-400 bg-blue-500/20"
                      : isDark
                        ? "border-white/10 bg-white/5"
                        : "border-white/20 bg-black/5",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pb-8 grid gap-3">
      <div className={cardClass(isDark)}>
        <button type="button" onClick={() => setScreen("archive")} className={cn("w-full px-5 py-4 flex items-center justify-between text-left", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div>
            <p className="font-medium">Sticker archive</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{archivedPacks.length} archived</p>
          </div>
          <span className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Open</span>
        </button>
        <button type="button" onClick={() => setScreen("quick")} className={cn("w-full px-5 py-4 flex items-center justify-between text-left", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div>
            <p className="font-medium">Quick reaction</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Double tap shortcut</p>
          </div>
          <span className="text-xl leading-none">{quickReaction}</span>
        </button>
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Emoji suggestions</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>All / frequent / never</p>
          </div>
          <div className="flex items-center gap-2">
            {(["all", "frequent", "never"] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={emojiPrefs.emoji_suggestions_mode === mode ? "default" : "secondary"}
                onClick={() => void updatePrefs({ emoji_suggestions_mode: mode })}
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className={cn("px-5 py-4 flex items-center justify-between gap-3", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div>
            <p className="font-medium">Large emoji</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Mode: {emojiPrefs.large_emoji_mode}</p>
          </div>
          <div className="flex items-center gap-2">
            {(["one", "up_to_three", "off"] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={emojiPrefs.large_emoji_mode === mode ? "default" : "secondary"}
                onClick={() => void updatePrefs({ large_emoji_mode: mode })}
              >
                {mode === "up_to_three" ? "1-3" : mode}
              </Button>
            ))}
          </div>
        </div>
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Recents first</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Show recent sets at top</p>
          </div>
          <Switch checked={emojiPrefs.recents_first} onCheckedChange={(val) => void updatePrefs({ recents_first: val })} />
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold">My sticker packs</p>
        </div>
        <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
          {myPacks.map((pack, idx) => (
            <div
              key={pack.id}
              className={cn("px-5 py-4 flex items-center justify-between gap-3", idx < myPacks.length - 1 && (isDark ? "border-b border-white/10" : "border-b border-white/20"))}
            >
              <div>
                <p className="font-medium">{pack.title}</p>
                <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{pack.item_count} stickers</p>
              </div>
              <Button variant="outline" onClick={() => void archive(pack.id)}>Archive</Button>
            </div>
          ))}
          {myPacks.length === 0 ? (
            <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>No installed packs.</p>
          ) : null}
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold">Popular stickers</p>
        </div>
        <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
          {catalog.map((pack, idx) => (
            <div
              key={pack.id}
              className={cn("px-5 py-4 flex items-center justify-between gap-3", idx < catalog.length - 1 && (isDark ? "border-b border-white/10" : "border-b border-white/20"))}
            >
              <div>
                <p className="font-medium">{pack.title}</p>
                <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>
                  {pack.item_count} stickers {pack.is_premium ? "Premium" : ""}
                </p>
              </div>
              <Button onClick={() => void install(pack.id)}>Add</Button>
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold">Emoji sets</p>
          <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>{emojiSets.length} available</p>
        </div>
      </div>
    </div>
  );
}
