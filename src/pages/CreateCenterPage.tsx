import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpToLine, ChevronLeft, ChevronRight, ImagePlus, Layers2, Radio, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PostEditorFlow } from "@/components/feed/PostEditorFlow";
import { StoryEditorFlow } from "@/components/feed/StoryEditorFlow";
import { CreateReelSheet } from "@/components/reels/CreateReelSheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { useCreateSessionStore } from "@/features/create/session/useCreateSessionStore";
import { validateCreateSession, type CreateValidationReason } from "@/features/create/session/validator";
import type { CreateAsset } from "@/features/create/session/types";

type CreateTab = "post" | "story" | "reels" | "live";

type RecentItem = {
  id: string;
  url: string;
  kind: "image" | "video";
  file?: File;
  source: "local" | "remote";
};

// Web fallback: device gallery access is not available in a normal browser.
// Keep these lightweight and safe; videos are intentionally omitted here.
const MOCK_RECENTS: RecentItem[] = [
  { id: "r1", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&q=80" },
  { id: "r2", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&q=80" },
  { id: "r3", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80" },
  { id: "r4", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=600&q=80" },
  { id: "r5", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=600&q=80" },
  { id: "r6", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80" },
  { id: "r7", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80" },
  { id: "r8", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=600&q=80" },
  { id: "r9", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&q=80" },
  { id: "r10", kind: "image", source: "remote", url: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&q=80" },
];

function normalizeTab(v: string | null): CreateTab {
  const t = String(v || "").toLowerCase();
  if (t === "post" || t === "story" || t === "reels" || t === "live") return t;
  return "reels";
}

const TAB_ORDER: CreateTab[] = ["post", "story", "reels", "live"];

function titleForTab(tab: CreateTab) {
  if (tab === "post") return "Новая публикация";
  if (tab === "story") return "Новая история";
  if (tab === "reels") return "Новый Reel";
  return "Прямой эфир";
}

export function CreateCenterPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = useMemo(() => normalizeTab(searchParams.get("tab")), [searchParams]);

  const { setIsCreatingContent } = useChatOpen();

  const { session, setMode, setAssets } = useCreateSessionStore({
    initialMode: initialTab,
    entry: searchParams.get("auto") === "1" ? "shortcut" : "plus",
  });
  const activeTab = session.mode;

  const setActiveTab = useCallback((tab: CreateTab) => {
    setMode(tab);
  }, [setMode]);

  const [postOpen, setPostOpen] = useState(false);
  const [storyOpen, setStoryOpen] = useState(false);
  const [reelsOpen, setReelsOpen] = useState(false);

  const [recentLocalItems, setRecentLocalItems] = useState<RecentItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<RecentItem[]>([]);
  const [postMultiSelect, setPostMultiSelect] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const focusIndexRef = useRef(0);
  const selectedItemsRef = useRef<RecentItem[]>([]);

  const POST_MULTI_MAX = 10;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlsRef = useRef<string[]>([]);

  const selectedFiles = useMemo(() => selectedItems.map((i) => i.file).filter(Boolean) as File[], [selectedItems]);
  const selectedRemoteUrls = useMemo(
    () => selectedItems.filter((i) => i.source === "remote").map((i) => i.url),
    [selectedItems],
  );
  const selectedPreviewUrls = useMemo(() => selectedItems.map((i) => i.url), [selectedItems]);

  const sessionAssets = useMemo<CreateAsset[]>(
    () =>
      selectedItems.map((item) => ({
        id: item.id,
        kind: item.kind,
        source: item.source,
        localFile: item.file,
        localUrl: item.source === "local" ? item.url : undefined,
        remoteUrl: item.source === "remote" ? item.url : undefined,
        mimeType: item.file?.type,
        status: item.source === "remote" ? "uploaded" : "local",
      })),
    [selectedItems],
  );

  useEffect(() => {
    setAssets(sessionAssets);
  }, [sessionAssets, setAssets]);

  const validation = useMemo(() => {
    return validateCreateSession({
      ...session,
      mode: activeTab,
      assets: sessionAssets,
    });
  }, [activeTab, session, sessionAssets]);

  const canProceed = validation.ok;

  const previewUrl = selectedPreviewUrls[focusIndex] ?? null;
  const previewFile = selectedItems[focusIndex]?.file ?? null;

  const inferIsVideoUrl = (url: string | null) => {
    if (!url) return false;
    const lower = String(url).toLowerCase();
    if (/(\.mp4|\.webm|\.mov|\.avi|\.m4v)(\?|#|$)/.test(lower)) return true;
    return false;
  };

  const isPreviewVideo =
    (!!previewFile && String(previewFile.type || "").startsWith("video/")) ||
    (!previewFile && inferIsVideoUrl(previewUrl));

  const previewAspectClass = activeTab === "post" ? "aspect-square" : "aspect-[9/16]";

  const validationText: Record<CreateValidationReason, string> = {
    LIVE_NOT_READY: "Прямой эфир пока в разработке",
    NO_ASSETS: "Выберите медиа",
    TOO_MANY_ASSETS: `Можно выбрать максимум ${POST_MULTI_MAX}`,
    STORY_SINGLE_ONLY: "Для истории доступен только один файл",
    REELS_VIDEO_ONLY: "Для Reels нужно выбрать видео",
    REELS_LOCAL_FILE_REQUIRED: "Для Reels выберите локальное видео из галереи",
  };

  useEffect(() => {
    focusIndexRef.current = focusIndex;
  }, [focusIndex]);

  useEffect(() => {
    selectedItemsRef.current = selectedItems;
  }, [selectedItems]);

  useEffect(() => {
    // Keep focus in bounds.
    setFocusIndex((idx) => {
      if (selectedItems.length === 0) return 0;
      return Math.min(Math.max(0, idx), selectedItems.length - 1);
    });
  }, [selectedItems.length]);

  useEffect(() => {
    // Single-select tabs should always focus the first item.
    if (activeTab !== "post") {
      setFocusIndex(0);
    }
  }, [activeTab]);

  // Hide the bottom nav while user is in the create center.
  useEffect(() => {
    setIsCreatingContent(true);
    return () => setIsCreatingContent(false);
  }, [setIsCreatingContent]);

  // Revoke object URLs on unmount.
  useEffect(() => {
    return () => {
      for (const u of objectUrlsRef.current) {
        try {
          URL.revokeObjectURL(u);
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Keep URL in sync when user swipes/taps.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", activeTab);
    // Don't keep auto-open flags after initial use.
    next.delete("auto");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Auto-open when navigated from the + menu.
  useEffect(() => {
    const auto = searchParams.get("auto") === "1";
    if (!auto) return;
    const t = normalizeTab(searchParams.get("tab"));
    setActiveTab(t);

    if (t === "post") setPostOpen(true);
    if (t === "story") setStoryOpen(true);
    if (t === "reels") setReelsOpen(true);

    const next = new URLSearchParams(searchParams);
    next.delete("auto");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptFileForTab = useCallback((tab: CreateTab, file: File): boolean => {
    const type = (file?.type || "").toLowerCase();
    const name = (file?.name || "").toLowerCase();
    const looksVideo = type.startsWith("video/") || /\.(mp4|webm|mov|avi|m4v)(\?|#|$)/.test(name);
    const looksImage = type.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)(\?|#|$)/.test(name);

    if (tab === "reels") return looksVideo;
    if (tab === "story") return looksImage || looksVideo;
    if (tab === "post") return looksImage || looksVideo;
    return false;
  }, []);

  const acceptItemForTab = useCallback(
    (tab: CreateTab, item: RecentItem): boolean => {
      if (tab === "live") return false;
      if (tab === "reels") return item.kind === "video" && !!item.file;
      if (tab === "story") return item.kind === "image" || item.kind === "video";
      return item.kind === "image" || item.kind === "video";
    },
    [],
  );

  const onPickFiles = (files: File[]) => {
    const input = Array.from(files || []).filter(Boolean);
    if (input.length === 0) return;

    const filtered = input.filter((f) => acceptFileForTab(activeTab, f));
    if (filtered.length === 0) {
      if (activeTab === "reels") toast.error("Для Reels нужно выбрать видео");
      else toast.error("Выберите фото или видео");
      return;
    }

    const now = Date.now();
    const localItems: RecentItem[] = filtered.map((f, idx) => {
      const url = URL.createObjectURL(f);
      objectUrlsRef.current.push(url);
      const kind: RecentItem["kind"] = String(f.type || "").startsWith("video/") ? "video" : "image";
      return {
        id: `local_${now}_${idx}`,
        kind,
        source: "local",
        url,
        file: f,
      };
    });

    setRecentLocalItems((prev) => {
      const next = [...localItems, ...prev];
      const trimmed = next.slice(0, 48);

      // Revoke object URLs that fell out of the recent list.
      for (const removed of next.slice(48)) {
        if (removed?.source === "local" && typeof removed.url === "string" && removed.url.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(removed.url);
          } catch {
            // ignore
          }
        }
      }

      return trimmed;
    });

    // Selection rules:
    // - post: honor multi-select; picking files selects them (up to all)
    // - story/reels: only first item
    if (activeTab === "post" && postMultiSelect) {
      setSelectedItems(localItems);
      setFocusIndex(0);
      return;
    }

    setSelectedItems(localItems.slice(0, 1));
    setFocusIndex(0);
  };

  const onPickItem = (item: RecentItem) => {
    if (!acceptItemForTab(activeTab, item)) {
      if (activeTab === "reels") toast.error("Для Reels нужно выбрать видео");
      else toast.error("Выберите подходящее медиа");
      return;
    }

    // Post: multi-select toggle.
    if (activeTab === "post" && postMultiSelect) {
      setSelectedItems((prev) => {
        const idx = prev.findIndex((p) => p.id === item.id);
        if (idx !== -1) {
          const next = [...prev];
          next.splice(idx, 1);
          return next;
        }
        if (prev.length >= POST_MULTI_MAX) {
          toast.error(`Можно выбрать максимум ${POST_MULTI_MAX}`);
          return prev;
        }
        return [...prev, item];
      });
      return;
    }

    // Story/Reels: single select.
    setSelectedItems([item]);
    setFocusIndex(0);
  };

  const removeAt = (idx: number) => {
    const prev = selectedItemsRef.current;
    if (idx < 0 || idx >= prev.length) return;
    const next = [...prev];
    next.splice(idx, 1);

    const currentFocus = focusIndexRef.current;
    let nextFocus = currentFocus;
    if (next.length === 0) nextFocus = 0;
    else if (currentFocus > idx) nextFocus = Math.max(0, currentFocus - 1);
    else if (currentFocus === idx) nextFocus = Math.min(idx, next.length - 1);
    else nextFocus = Math.min(currentFocus, next.length - 1);

    setSelectedItems(next);
    setFocusIndex(nextFocus);
  };

  const moveFocus = (dir: -1 | 1) => {
    const from = focusIndexRef.current;
    const to = from + dir;
    setSelectedItems((prev) => {
      if (prev.length < 2) return prev;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[from];
      next[from] = next[to];
      next[to] = tmp;
      return next;
    });
    setFocusIndex(to);
  };

  const makeFirst = () => {
    const from = focusIndexRef.current;
    if (from <= 0) return;
    setSelectedItems((prev) => {
      if (from <= 0 || from >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.unshift(item);
      return next;
    });
    setFocusIndex(0);
  };

  // If user switches mode, drop incompatible selection + normalize multi-select.
  useEffect(() => {
    if (activeTab !== "post") {
      setPostMultiSelect(false);
    }

    setSelectedItems((prev) => {
      const filtered = prev.filter((it) => acceptItemForTab(activeTab, it));
      if (filtered.length === 0) return [];
      if (activeTab === "post") return filtered;
      return filtered.slice(0, 1);
    });
  }, [activeTab, acceptItemForTab]);

  // Turning multi-select off should keep only the primary item (IG behavior).
  useEffect(() => {
    if (activeTab !== "post") return;
    if (postMultiSelect) return;
    setSelectedItems((prev) => (prev.length <= 1 ? prev : prev.slice(0, 1)));
  }, [activeTab, postMultiSelect]);

  const handleNext = () => {
    if (!canProceed) {
      const reason = validation.reasons[0];
      if (reason) toast.error(validationText[reason]);
      return;
    }
    if (activeTab === "post") {
      setPostOpen(true);
      return;
    }
    if (activeTab === "story") {
      setStoryOpen(true);
      return;
    }
    if (activeTab === "reels") {
      setReelsOpen(true);
      return;
    }
  };

  // Left/right swipe to switch tabs.
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeAreaRef = useRef<HTMLDivElement>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const startX = touchStartX.current;
    const startY = touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (startX == null || startY == null) return;

    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;

    // Ignore mostly-vertical gestures.
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < 60) return;

    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx === -1) return;
    const nextIdx = dx < 0 ? Math.min(TAB_ORDER.length - 1, idx + 1) : Math.max(0, idx - 1);
    const nextTab = TAB_ORDER[nextIdx];
    if (nextTab) setActiveTab(nextTab);
  };

  return (
    <div className="h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border safe-area-top">
        <div className="flex items-center h-12 px-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Закрыть"
          >
            <X className="w-6 h-6" />
          </button>
          <h1 className="font-semibold text-lg flex-1 text-center">
            {titleForTab(activeTab)}
          </h1>
          <Button
            variant="link"
            className="px-0 font-semibold"
            disabled={!canProceed}
            onClick={handleNext}
          >
            Далее
          </Button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          onPickFiles(list);
          e.currentTarget.value = "";
        }}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(normalizeTab(v))}>
        <div
          ref={swipeAreaRef}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="relative flex-1"
        >
          {/* Preview canvas */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-background" />
            {previewUrl ? (
              <>
                <div
                  className="absolute inset-0 scale-150 blur-3xl opacity-50"
                  style={{
                    backgroundImage: `url(${previewUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div className="absolute inset-0 bg-black/25" />
              </>
            ) : (
              <div className="absolute inset-0 bg-black/15" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent pointer-events-none" />
          </div>

          <div className="relative z-10 px-4 pt-4 pb-40">
            {activeTab !== "live" && (
              <div className={cn("w-full", previewAspectClass, "rounded-2xl overflow-hidden border border-border bg-card/30 backdrop-blur")}> 
                {previewUrl ? (
                  isPreviewVideo ? (
                    <video
                      src={previewUrl}
                      className="w-full h-full object-contain bg-black/40"
                      playsInline
                      muted
                      loop
                      autoPlay
                    />
                  ) : (
                    <img src={previewUrl} alt="" className="w-full h-full object-contain" />
                  )
                ) : (
                  <button
                    type="button"
                    className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="w-10 h-10" />
                    <div className="text-sm font-medium">Выберите медиа</div>
                  </button>
                )}

                {/* Quick actions for post multi-select */}
                {activeTab === "post" && postMultiSelect && selectedItems.length > 0 && (
                  <div className="absolute inset-x-0 top-2 px-2 flex items-center justify-between pointer-events-none">
                    <div className="pointer-events-auto flex items-center gap-2">
                      <button
                        type="button"
                        className={cn(
                          "w-10 h-10 rounded-full",
                          "bg-black/25 backdrop-blur border border-white/20",
                          "flex items-center justify-center",
                          focusIndex === 0 ? "opacity-40" : "hover:bg-black/30 active:bg-black/35",
                        )}
                        onClick={() => moveFocus(-1)}
                        disabled={focusIndex === 0}
                        aria-label="Сдвинуть влево"
                        title="Сдвинуть влево"
                      >
                        <ChevronLeft className="w-5 h-5 text-white" />
                      </button>
                      <button
                        type="button"
                        className={cn(
                          "w-10 h-10 rounded-full",
                          "bg-black/25 backdrop-blur border border-white/20",
                          "flex items-center justify-center",
                          focusIndex >= selectedItems.length - 1 ? "opacity-40" : "hover:bg-black/30 active:bg-black/35",
                        )}
                        onClick={() => moveFocus(1)}
                        disabled={focusIndex >= selectedItems.length - 1}
                        aria-label="Сдвинуть вправо"
                        title="Сдвинуть вправо"
                      >
                        <ChevronRight className="w-5 h-5 text-white" />
                      </button>

                      <button
                        type="button"
                        className={cn(
                          "h-10 px-3 rounded-full",
                          "bg-black/25 backdrop-blur border border-white/20",
                          "flex items-center justify-center gap-2",
                          focusIndex === 0 ? "opacity-40" : "hover:bg-black/30 active:bg-black/35",
                        )}
                        onClick={makeFirst}
                        disabled={focusIndex === 0}
                        aria-label="Сделать первым"
                        title="Сделать первым"
                      >
                        <ArrowUpToLine className="w-4 h-4 text-white" />
                        <span className="text-xs font-semibold text-white">В начало</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className={cn(
                        "pointer-events-auto w-10 h-10 rounded-full",
                        "bg-black/25 backdrop-blur border border-white/20",
                        "flex items-center justify-center hover:bg-black/30 active:bg-black/35",
                      )}
                      onClick={() => removeAt(focusIndex)}
                      aria-label="Убрать из выбора"
                      title="Убрать"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Selected strip (IG-like) */}
            {activeTab === "post" && postMultiSelect && selectedItems.length > 1 && (
              <div className="mt-3">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {selectedItems.map((it, idx) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setFocusIndex(idx)}
                      className={cn(
                        "relative w-16 h-16 rounded-xl overflow-hidden border flex-shrink-0",
                        idx === focusIndex ? "border-primary" : "border-border",
                      )}
                    >
                      {it.kind === "video" || inferIsVideoUrl(it.url) ? (
                        <video src={it.url} className="w-full h-full object-cover" playsInline muted />
                      ) : (
                        <img src={it.url} alt="" className="w-full h-full object-cover" />
                      )}
                      <div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/40 text-white text-[11px] font-bold flex items-center justify-center">
                        {idx + 1}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          removeAt(idx);
                        }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/40 text-white flex items-center justify-center"
                        aria-label="Убрать"
                        title="Убрать"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <TabsContent value="post" className="mt-0">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Выберите фото или видео.</p>
              </div>
            </TabsContent>

            <TabsContent value="story" className="mt-0">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Выберите фото или видео.</p>
              </div>
            </TabsContent>

            <TabsContent value="reels" className="mt-0">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Выберите видео.</p>
              </div>
            </TabsContent>

            <TabsContent value="live" className="mt-0">
              <div className={cn("rounded-xl border border-border p-4", "bg-card/40 backdrop-blur")}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted/60 border border-border flex items-center justify-center">
                    <Radio className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Прямой эфир</div>
                    <div className="text-sm text-muted-foreground">Пока в разработке.</div>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Picker tray */}
            {activeTab !== "live" && (
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">Недавние</div>
                  <div className="flex items-center gap-2">
                    {selectedItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedItems([])}
                        className="h-8 px-3 rounded-full text-xs font-semibold border border-border bg-card/40 hover:bg-card/60 transition-colors"
                      >
                        Сброс
                      </button>
                    )}

                    {activeTab === "post" && (
                      <button
                        type="button"
                        onClick={() => setPostMultiSelect((v) => !v)}
                        className={cn(
                          "h-8 w-8 rounded-full border flex items-center justify-center transition-colors",
                          postMultiSelect
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card/40 text-foreground",
                        )}
                        aria-label="Выбрать несколько"
                        title="Выбрать несколько"
                      >
                        <Layers2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-sm font-semibold text-primary"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Выбрать
                    </button>
                  </div>
                </div>

                {activeTab === "post" && postMultiSelect && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Выбрано: <span className="text-foreground font-semibold">{selectedItems.length}</span> / {POST_MULTI_MAX}
                  </div>
                )}

                <div className="mt-3 grid grid-cols-4 gap-[2px] overflow-hidden rounded-xl border border-border bg-card/40 backdrop-blur">
                  <button
                    type="button"
                    className="aspect-square bg-muted/40 flex flex-col items-center justify-center gap-1"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="w-6 h-6 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Галерея</span>
                  </button>

                  {[...recentLocalItems, ...MOCK_RECENTS]
                    .slice(0, 11)
                    .map((it) => {
                      const selectedIndex = selectedItems.findIndex((s) => s.id === it.id);
                      const selectedNumber = selectedIndex === -1 ? null : selectedIndex + 1;
                      return (
                    <button
                      key={it.id}
                      type="button"
                      className="aspect-square relative"
                      onClick={() => onPickItem(it)}
                    >
                      {it.kind === "video" || inferIsVideoUrl(it.url) ? (
                        <video
                          src={it.url}
                          className="w-full h-full object-cover"
                          playsInline
                          muted
                        />
                      ) : (
                        <img src={it.url} alt="" className="w-full h-full object-cover" />
                      )}
                      {selectedNumber != null && (
                        <>
                          <div className="absolute inset-0 bg-primary/20" />
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                            {selectedNumber}
                          </div>
                        </>
                      )}
                    </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Bottom mode switcher */}
          <div className="fixed left-0 right-0 bottom-0 z-30 safe-area-bottom">
            <div className="max-w-lg mx-auto w-full px-4 pb-4 pt-2">
              <TabsList className="w-full grid grid-cols-4 bg-card/60 backdrop-blur-xl border border-border">
                <TabsTrigger value="post">Публикация</TabsTrigger>
                <TabsTrigger value="story">История</TabsTrigger>
                <TabsTrigger value="reels">Видео Reels</TabsTrigger>
                <TabsTrigger value="live">Эфир</TabsTrigger>
              </TabsList>
            </div>
          </div>
        </div>
      </Tabs>

      <PostEditorFlow
        isOpen={postOpen}
        onClose={() => setPostOpen(false)}
        initialFiles={selectedFiles}
        initialUrls={selectedRemoteUrls}
        initialStep={selectedItems.length > 0 ? "editor" : "gallery"}
      />
      <StoryEditorFlow
        isOpen={storyOpen}
        onClose={() => setStoryOpen(false)}
        initialFile={selectedItems[0]?.file ?? null}
        initialUrl={!selectedItems[0]?.file ? selectedItems[0]?.url ?? null : null}
      />
      <CreateReelSheet
        open={reelsOpen}
        onOpenChange={setReelsOpen}
        initialVideoFile={selectedItems[0]?.file ?? null}
      />
    </div>
  );
}

export default CreateCenterPage;
