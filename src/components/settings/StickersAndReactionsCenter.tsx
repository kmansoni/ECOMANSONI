import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn, getErrorMessage } from "@/lib/utils";
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
        title: "Стикеры и эмодзи",
        description: getErrorMessage(error),
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
      toast({ title: "Установка набора", description: getErrorMessage(error) });
    }
  };

  const archive = async (packId: string) => {
    if (!userId) return;
    try {
      await archiveStickerPack(userId, packId);
      await refreshAll();
    } catch (error) {
      toast({ title: "Архивирование набора", description: getErrorMessage(error) });
    }
  };

  const restoreAll = async () => {
    if (!userId || !archivedPacks.length) return;
    try {
      await bulkRestoreStickerPacks(userId, archivedPacks.map((pack) => pack.id));
      await refreshAll();
    } catch (error) {
      toast({ title: "Восстановление архива", description: getErrorMessage(error) });
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
      toast({ title: "Настройки эмодзи", description: getErrorMessage(error) });
    }
  };

  const updateQuickReaction = async (emoji: string) => {
    if (!userId) return;
    try {
      const next = await setUserQuickReaction(userId, emoji);
      setQuickReaction(next.emoji);
    } catch (error) {
      toast({ title: "Быстрая реакция", description: getErrorMessage(error) });
    }
  };

  if (!userId) {
    return <div className={cn("px-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Необходимо войти в аккаунт.</div>;
  }

  if (loading || !emojiPrefs) {
    return <div className={cn("px-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Загрузка…</div>;
  }

  if (screen === "archive") {
    return (
      <div className="px-4 pb-8 grid gap-3">
        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={() => setScreen("main")}>Назад</Button>
          <Button variant="outline" onClick={() => void restoreAll()} disabled={!archivedPacks.length}>
            Восстановить все
          </Button>
        </div>

        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <p className="font-semibold">Архивированные наборы стикеров</p>
            <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>{archivedPacks.length} набор(ов)</p>
          </div>
          <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
            {archivedPacks.map((pack, idx) => (
              <div
                key={pack.id}
                className={cn("px-5 py-4 flex items-center justify-between gap-3", idx < archivedPacks.length - 1 && (isDark ? "border-b border-white/10" : "border-b border-white/20"))}
              >
                <div>
                  <p className="font-medium">{pack.title}</p>
                  <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{pack.item_count} стикеров</p>
                </div>
                <Button onClick={() => void install(pack.id)}>Добавить</Button>
              </div>
            ))}
            {archivedPacks.length === 0 ? (
              <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Архив пуст.</p>
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
          <Button variant="secondary" onClick={() => setScreen("main")}>Назад</Button>
          <div className="text-2xl leading-none">{quickReaction}</div>
        </div>

        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <p className="font-semibold">Предпросмотр двойного нажатия</p>
            <div className={cn("mt-3 rounded-2xl px-4 py-3 text-sm", isDark ? "bg-white/10 text-white" : "bg-black/10 text-black")}>
              Дважды нажмите на сообщение, чтобы отправить: <span className="font-semibold">{quickReaction}</span>
            </div>
          </div>
        </div>

        <div className={cardClass(isDark)}>
          <div className="px-5 py-4">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск реакции"
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
            <p className="font-medium">Архив стикеров</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{archivedPacks.length} в архиве</p>
          </div>
          <span className={cn("text-sm", isDark ? "text-white/60" : "text-white/70")}>Открыть</span>
        </button>
        <button type="button" onClick={() => setScreen("quick")} className={cn("w-full px-5 py-4 flex items-center justify-between text-left", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div>
            <p className="font-medium">Быстрая реакция</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Двойное нажатие</p>
          </div>
          <span className="text-xl leading-none">{quickReaction}</span>
        </button>
        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">Подсказки эмодзи</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Все / частые / никогда</p>
          </div>
          <div className="flex items-center gap-2">
            {(["all", "frequent", "never"] as const).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={emojiPrefs.emoji_suggestions_mode === mode ? "default" : "secondary"}
                onClick={() => void updatePrefs({ emoji_suggestions_mode: mode })}
              >
                {mode === "all" ? "Все" : mode === "frequent" ? "Частые" : "Никогда"}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className={cn("px-5 py-4 flex items-center justify-between gap-3", isDark ? "border-b border-white/10" : "border-b border-white/20")}>
          <div>
            <p className="font-medium">Крупные эмодзи</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Режим: {emojiPrefs.large_emoji_mode === "one" ? "Одно" : emojiPrefs.large_emoji_mode === "up_to_three" ? "До трёх" : "Выкл"}</p>
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
            <p className="font-medium">Недавние первыми</p>
            <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>Показывать недавние наборы вверху</p>
          </div>
          <Switch checked={emojiPrefs.recents_first} onCheckedChange={(val) => void updatePrefs({ recents_first: val })} />
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold">Мои наборы стикеров</p>
        </div>
        <div className={cn("border-t", isDark ? "border-white/10" : "border-white/20")}>
          {myPacks.map((pack, idx) => (
            <div
              key={pack.id}
              className={cn("px-5 py-4 flex items-center justify-between gap-3", idx < myPacks.length - 1 && (isDark ? "border-b border-white/10" : "border-b border-white/20"))}
            >
              <div>
                <p className="font-medium">{pack.title}</p>
                <p className={cn("text-xs mt-1", isDark ? "text-white/60" : "text-white/70")}>{pack.item_count} стикеров</p>
              </div>
              <Button variant="outline" onClick={() => void archive(pack.id)}>В архив</Button>
            </div>
          ))}
          {myPacks.length === 0 ? (
            <p className={cn("px-5 py-4 text-sm", isDark ? "text-white/60" : "text-white/70")}>Нет установленных наборов.</p>
          ) : null}
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold">Популярные стикеры</p>
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
                  {pack.item_count} стикеров {pack.is_premium ? "Премиум" : ""}
                </p>
              </div>
              <Button onClick={() => void install(pack.id)}>Добавить</Button>
            </div>
          ))}
        </div>
      </div>

      <div className={cardClass(isDark)}>
        <div className="px-5 py-4">
          <p className="font-semibold">Наборы эмодзи</p>
          <p className={cn("text-sm mt-1", isDark ? "text-white/60" : "text-white/70")}>{emojiSets.length} доступно</p>
        </div>
      </div>
    </div>
  );
}
