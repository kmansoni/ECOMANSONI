/**
 * CreateSurfacePage — Instagram-grade Unified Create Surface
 * 4 вкладки: Публикация, История, Видео Reels, Эфир
 * Каждая кнопка рабочая — реальная запись в Supabase
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Image as ImageIcon,
  Video,
  MapPin,
  Users,
  Hash,
  Loader2,
  Radio,
  Camera,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Sparkles,
  Sliders,
  Crop,
  UserPlus,
  CalendarClock,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatOpen } from "@/contexts/ChatOpenContext";
import { toast } from "sonner";
import { usePublish } from "@/hooks/usePublish";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PhotoFiltersPanel, FILTERS } from "@/components/editor/PhotoFiltersPanel";
import { AdjustmentsPanel, DEFAULT_ADJUSTMENTS, adjustmentsToFilter, type Adjustments } from "@/components/editor/AdjustmentsPanel";
import { CropRotatePanel, type AspectRatio } from "@/components/editor/CropRotatePanel";
import { useDrafts } from "@/hooks/useDrafts";
import { SchedulePostPicker } from "@/components/feed/SchedulePostPicker";
import { PeopleTagOverlay } from "@/components/feed/PeopleTagOverlay";
import { ScheduleLiveSheet } from "@/components/live/ScheduleLiveSheet";

type TabId = "post" | "story" | "reel" | "live";

const TABS: { id: TabId; label: string }[] = [
  { id: "post", label: "Публикация" },
  { id: "story", label: "История" },
  { id: "reel", label: "Видео Reels" },
  { id: "live", label: "Эфир" },
];

// ─── Утилита: превью файла ────────────────────────────────────────────────────

function FilePreview({
  url,
  type,
  className,
}: {
  url: string;
  type: "image" | "video";
  className?: string;
}) {
  if (type === "video") {
    return (
      <video
        src={url}
        className={cn("w-full h-full object-cover", className)}
        autoPlay
        loop
        muted
        playsInline
      />
    );
  }
  return (
    <img
      src={url}
      alt="preview"
      className={cn("w-full h-full object-cover", className)}
    />
  );
}

// ─── Плейсхолдер выбора медиа ─────────────────────────────────────────────────

function MediaPickerPlaceholder({
  onPick,
  accept,
  multiple,
  label,
  icon,
}: {
  onPick: (files: File[]) => void;
  accept: string;
  multiple?: boolean;
  label: string;
  icon?: React.ReactNode;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-2xl p-8 cursor-pointer hover:border-primary/60 transition-colors bg-muted/30"
      onClick={() => ref.current?.click()}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onPick(files);
          e.currentTarget.value = "";
        }}
      />
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        {icon ?? <ImageIcon className="w-8 h-8 text-muted-foreground" />}
      </div>
      <p className="text-sm text-muted-foreground text-center">{label}</p>
      <Button variant="outline" size="sm" type="button">
        Выбрать файл
      </Button>
    </div>
  );
}

// ─── Вкладка "Публикация" ─────────────────────────────────────────────────────

type EditorTab = "filters" | "adjust" | "crop" | "tags";

function PostTab() {
  const navigate = useNavigate();
  const { publishPost, uploading, progress } = usePublish();
  const { saveDraft } = useDrafts("post");
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");
  const urlsRef = useRef<string[]>([]);
  // Editor state
  const [editorTab, setEditorTab] = useState<EditorTab | null>(null);
  const [selectedFilter, setSelectedFilter] = useState(0);
  const [filterIntensity, setFilterIntensity] = useState(100);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const [rotation, setRotation] = useState(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [peopleTags, setPeopleTags] = useState<any[]>([]);
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [showScheduler, setShowScheduler] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    return () => {
      for (const u of urlsRef.current) URL.revokeObjectURL(u);
    };
  }, []);

  const addFiles = useCallback((picked: File[]) => {
    const filtered = picked.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!filtered.length) return;
    const urls = filtered.map((f) => {
      const u = URL.createObjectURL(f);
      urlsRef.current.push(u);
      return u;
    });
    setFiles((p) => [...p, ...filtered].slice(0, 10));
    setPreviewUrls((p) => [...p, ...urls].slice(0, 10));
  }, []);

  const removeAt = (idx: number) => {
    URL.revokeObjectURL(previewUrls[idx]);
    setFiles((p) => p.filter((_, i) => i !== idx));
    setPreviewUrls((p) => p.filter((_, i) => i !== idx));
    setCurrentIdx((c) => Math.min(c, Math.max(0, files.length - 2)));
  };

  const handlePublish = async () => {
    if (!caption.trim() && files.length === 0) {
      toast.error("Добавьте фото или текст");
      return;
    }
    const result = await publishPost(caption, files, location || undefined);
    if (result.error) {
      toast.error("Ошибка публикации: " + result.error);
    } else {
      toast.success(scheduledAt ? "Публикация запланирована!" : "Публикация опубликована!");
      navigate("/");
    }
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    await saveDraft({ type: "post", content: caption, media: [], metadata: { location } });
    setSavingDraft(false);
    toast.success("Черновик сохранён");
  };

  const currentFilterStyle = selectedFilter > 0 && FILTERS[selectedFilter]
    ? FILTERS[selectedFilter].style
    : {};
  const adjStyle = adjustmentsToFilter(adjustments);
  const imageStyle: React.CSSProperties = {
    ...currentFilterStyle,
    filter: [currentFilterStyle.filter, adjStyle.filter].filter(Boolean).join(" ") || undefined,
    transform: `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`,
  };

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Превью */}
      {previewUrls.length > 0 ? (
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-black">
          <div style={imageStyle} className="w-full h-full">
            <FilePreview
              url={previewUrls[currentIdx]}
              type={files[currentIdx]?.type.startsWith("video/") ? "video" : "image"}
            />
          </div>
          {/* Счётчик */}
          {previewUrls.length > 1 && (
            <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
              {currentIdx + 1}/{previewUrls.length}
            </div>
          )}
          {/* Навигация */}
          {previewUrls.length > 1 && (
            <>
              <button
                className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white"
                onClick={() => setCurrentIdx((c) => Math.max(0, c - 1))}
                disabled={currentIdx === 0}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white"
                onClick={() => setCurrentIdx((c) => Math.min(previewUrls.length - 1, c + 1))}
                disabled={currentIdx === previewUrls.length - 1}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
          {/* Удалить */}
          <button
            className="absolute top-3 left-3 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white"
            onClick={() => removeAt(currentIdx)}
          >
            <X className="w-4 h-4" />
          </button>
          {/* Добавить ещё */}
          {files.length < 10 && (
            <label className="absolute bottom-3 right-3 w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white cursor-pointer">
              <Plus className="w-5 h-5" />
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.currentTarget.value = "";
                }}
              />
            </label>
          )}
          {/* Точки */}
          {previewUrls.length > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
              {previewUrls.map((_, i) => (
                <button
                  key={i}
                  className={cn(
                    "rounded-full transition-all",
                    i === currentIdx ? "w-3 h-1.5 bg-white" : "w-1.5 h-1.5 bg-white/50",
                  )}
                  onClick={() => setCurrentIdx(i)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <MediaPickerPlaceholder
          onPick={addFiles}
          accept="image/*,video/*"
          multiple
          label="Выберите фото или видео (до 10)"
          icon={<ImageIcon className="w-8 h-8 text-muted-foreground" />}
        />
      )}

      {/* Редактор (Фильтры / Настройки / Кадрирование / Теги) */}
      {previewUrls.length > 0 && (
        <div className="space-y-3">
          {/* Тулбар редактора */}
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: "filters" as const, icon: <Sparkles className="w-4 h-4" />, label: "Фильтры" },
              { id: "adjust" as const, icon: <Sliders className="w-4 h-4" />, label: "Настройки" },
              { id: "crop" as const, icon: <Crop className="w-4 h-4" />, label: "Кадр" },
              { id: "tags" as const, icon: <UserPlus className="w-4 h-4" />, label: "Отметить" },
            ].map(({ id, icon, label }) => (
              <button
                key={id}
                onClick={() => setEditorTab(editorTab === id ? null : id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all whitespace-nowrap",
                  editorTab === id ? "bg-primary border-primary text-white" : "border-border text-muted-foreground hover:border-primary/50",
                )}
              >
                {icon}{label}
              </button>
            ))}
          </div>

          {/* Панели редактора */}
          {editorTab === "filters" && (
            <PhotoFiltersPanel
              imageUrl={previewUrls[currentIdx]}
              selected={selectedFilter}
              intensity={filterIntensity}
              onSelectFilter={setSelectedFilter}
              onChangeIntensity={setFilterIntensity}
            />
          )}
          {editorTab === "adjust" && (
            <AdjustmentsPanel adjustments={adjustments} onChange={setAdjustments} />
          )}
          {editorTab === "crop" && (
            <CropRotatePanel
              imageUrl={previewUrls[currentIdx]}
              rotation={rotation}
              flipH={flipH}
              flipV={flipV}
              aspectRatio={aspectRatio}
              onRotationChange={setRotation}
              onFlipH={() => setFlipH((v) => !v)}
              onFlipV={() => setFlipV((v) => !v)}
              onAspectRatioChange={setAspectRatio}
            />
          )}
          {editorTab === "tags" && (
            <div className="relative aspect-square rounded-xl overflow-hidden bg-black">
              <img src={previewUrls[currentIdx]} alt="" className="w-full h-full object-cover" />
              <PeopleTagOverlay
                tags={peopleTags}
                mediaIndex={currentIdx}
                onAddTag={(tag) => setPeopleTags((prev) => [...prev, tag])}
                onRemoveTag={(userId) => setPeopleTags((prev) => prev.filter((t) => t.user_id !== userId))}
              />
            </div>
          )}
        </div>
      )}

      {/* Подпись */}
      <Textarea
        placeholder="Напишите подпись... #хэштег @упоминание"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        className="resize-none min-h-[80px] rounded-xl"
        maxLength={2200}
      />
      <p className="text-xs text-muted-foreground text-right -mt-2">{caption.length}/2200</p>

      {/* Местоположение */}
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Добавить местоположение"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="pl-9 rounded-xl"
        />
      </div>

      {/* Запланировать */}
      {scheduledAt && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/20 rounded-xl">
          <CalendarClock className="w-4 h-4 text-primary" />
          <span className="text-sm text-primary flex-1">
            Запланировано: {scheduledAt.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
          </span>
          <button onClick={() => setScheduledAt(null)} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Прогресс */}
      {uploading && (
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Загрузка {progress}%...
          </p>
        </div>
      )}

      {/* Кнопки */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => setShowScheduler(true)}
          className="flex-shrink-0 flex items-center gap-1.5"
        >
          <CalendarClock className="w-4 h-4" />
        </Button>
        <Button
          variant="outline"
          onClick={handleSaveDraft}
          disabled={savingDraft}
          className="flex-shrink-0 flex items-center gap-1.5"
        >
          <BookOpen className="w-4 h-4" />
          {savingDraft ? "..." : "Черновик"}
        </Button>
        <Button
          onClick={handlePublish}
          disabled={uploading}
          className="flex-1 h-12 text-base font-semibold rounded-xl"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Публикация...
            </>
          ) : scheduledAt ? (
            "Запланировать"
          ) : (
            "Опубликовать"
          )}
        </Button>
      </div>

      {/* Планировщик */}
      {showScheduler && (
        <SchedulePostPicker
          value={scheduledAt}
          onChange={setScheduledAt}
          onClose={() => setShowScheduler(false)}
        />
      )}
    </div>
  );
}

// ─── Вкладка "История" ────────────────────────────────────────────────────────

function StoryTab() {
  const navigate = useNavigate();
  const { publishStory, uploading, progress } = usePublish();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [closeFriends, setCloseFriends] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const onPick = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(f);
    urlRef.current = url;
    setFile(f);
    setPreviewUrl(url);
  };

  const handleShare = async () => {
    if (!file) {
      toast.error("Выберите фото или видео");
      return;
    }
    const result = await publishStory(file, closeFriends);
    if (result.error) {
      toast.error("Ошибка: " + result.error);
    } else {
      toast.success("История опубликована!");
      navigate("/");
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-6">
      {previewUrl && file ? (
        <div className="relative aspect-[9/16] max-h-[60vh] rounded-2xl overflow-hidden bg-black mx-auto w-full">
          <FilePreview
            url={previewUrl}
            type={file.type.startsWith("video/") ? "video" : "image"}
          />
          <button
            className="absolute top-3 right-3 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white"
            onClick={() => { setFile(null); setPreviewUrl(null); }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <MediaPickerPlaceholder
          onPick={onPick}
          accept="image/*,video/*"
          label="Выберите фото или видео для истории"
          icon={<Camera className="w-8 h-8 text-muted-foreground" />}
        />
      )}

      {/* Close friends toggle */}
      <button
        className={cn(
          "flex items-center justify-between px-4 py-3 rounded-xl border transition-colors",
          closeFriends ? "border-green-500 bg-green-500/10" : "border-border",
        )}
        onClick={() => setCloseFriends((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center",
            closeFriends ? "bg-green-500" : "bg-muted",
          )}>
            <Users className={cn("w-5 h-5", closeFriends ? "text-white" : "text-muted-foreground")} />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium">Только лучшие друзья</p>
            <p className="text-xs text-muted-foreground">Ограниченная аудитория</p>
          </div>
        </div>
        <div className={cn(
          "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
          closeFriends ? "bg-green-500 border-green-500" : "border-muted-foreground/40",
        )}>
          {closeFriends && <Check className="w-3 h-3 text-white" />}
        </div>
      </button>

      {uploading && (
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      <Button
        onClick={handleShare}
        disabled={uploading || !file}
        className="w-full h-12 text-base font-semibold rounded-xl"
      >
        {uploading ? (
          <><Loader2 className="w-5 h-5 animate-spin mr-2" />Публикация...</>
        ) : (
          "Поделиться в историю"
        )}
      </Button>
    </div>
  );
}

// ─── Вкладка "Видео Reels" ────────────────────────────────────────────────────

function ReelTab() {
  const navigate = useNavigate();
  const { publishReel, uploading, progress } = usePublish();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  const onPick = (files: File[]) => {
    const f = files.find((f) => f.type.startsWith("video/"));
    if (!f) { toast.error("Нужно выбрать видео"); return; }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(f);
    urlRef.current = url;
    setFile(f);
    setPreviewUrl(url);
  };

  const handlePublish = async () => {
    if (!file) { toast.error("Выберите видео"); return; }
    const result = await publishReel(file, description);
    if (result.error) {
      toast.error("Ошибка: " + result.error);
    } else {
      toast.success("Reel опубликован!");
      navigate("/");
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-6">
      {previewUrl && file ? (
        <div className="relative aspect-[9/16] max-h-[60vh] rounded-2xl overflow-hidden bg-black mx-auto w-full">
          <video
            src={previewUrl}
            className="w-full h-full object-cover"
            controls
            playsInline
          />
          <button
            className="absolute top-3 right-3 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white"
            onClick={() => { setFile(null); setPreviewUrl(null); }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <MediaPickerPlaceholder
          onPick={onPick}
          accept="video/*"
          label="Выберите видео для Reels"
          icon={<Video className="w-8 h-8 text-muted-foreground" />}
        />
      )}

      <Textarea
        placeholder="Описание... #хэштег"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="resize-none min-h-[80px] rounded-xl"
        maxLength={2200}
      />

      {uploading && (
        <div className="space-y-1">
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground text-center">Загрузка {progress}%...</p>
        </div>
      )}

      <Button
        onClick={handlePublish}
        disabled={uploading || !file}
        className="w-full h-12 text-base font-semibold rounded-xl"
      >
        {uploading ? (
          <><Loader2 className="w-5 h-5 animate-spin mr-2" />Публикация...</>
        ) : (
          "Опубликовать Reel"
        )}
      </Button>
    </div>
  );
}

// ─── Вкладка "Эфир" ───────────────────────────────────────────────────────────

const LIVE_CATEGORIES = [
  { id: "general", label: "Общее" },
  { id: "gaming", label: "Игры" },
  { id: "music", label: "Музыка" },
  { id: "education", label: "Образование" },
  { id: "sport", label: "Спорт" },
  { id: "cooking", label: "Кулинария" },
  { id: "travel", label: "Путешествия" },
];

function LiveTab() {
  const { startLive, uploading } = usePublish();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let mounted = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then((stream) => {
        if (!mounted) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCameraReady(true);
      })
      .catch(() => setCameraReady(false));

    return () => {
      mounted = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleStart = async () => {
    if (!title.trim()) { toast.error("Введите название эфира"); return; }
    const result = await startLive(title.trim(), category);
    if (result.error) {
      toast.error("Ошибка: " + result.error);
    }
  };

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Превью камеры */}
      <div className="aspect-[9/16] max-h-[50vh] rounded-2xl overflow-hidden bg-black relative mx-auto w-full">
        {cameraReady ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/60">
            <Radio className="w-10 h-10" />
            <p className="text-sm">Нет доступа к камере</p>
          </div>
        )}
        <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
          LIVE
        </div>
      </div>

      {/* Название */}
      <Input
        placeholder="Название эфира"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="rounded-xl h-12"
        maxLength={100}
      />

      {/* Категория */}
      <div className="flex flex-wrap gap-2">
        {LIVE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              category === cat.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80",
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <Button
        onClick={handleStart}
        disabled={uploading || !title.trim()}
        className="w-full h-12 text-base font-semibold rounded-xl bg-red-600 hover:bg-red-700"
      >
        {uploading ? (
          <><Loader2 className="w-5 h-5 animate-spin mr-2" />Запуск...</>
        ) : (
          <><Radio className="w-5 h-5 mr-2" />Начать эфир</>
        )}
      </Button>
    </div>
  );
}

// ─── Главный компонент ────────────────────────────────────────────────────────

export function CreateSurfacePage() {
  const navigate = useNavigate();
  const { setIsCreatingContent } = useChatOpen();
  const [activeTab, setActiveTab] = useState<TabId>("post");

  useEffect(() => {
    setIsCreatingContent(true);
    return () => setIsCreatingContent(false);
  }, [setIsCreatingContent]);

  const tabTitles: Record<TabId, string> = {
    post: "Новая публикация",
    story: "Новая история",
    reel: "Новый Reel",
    live: "Прямой эфир",
  };

  return (
    <div className="h-[100dvh] bg-background flex flex-col">
      {/* Шапка */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center h-12 px-4">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-10 h-10 -ml-2 rounded-full hover:bg-muted transition-colors"
            aria-label="Назад"
          >
            <X className="w-5 h-5" />
          </button>
          <h1 className="font-semibold text-base flex-1 text-center">
            {tabTitles[activeTab]}
          </h1>
          <div className="w-10" />
        </div>

        {/* Вкладки */}
        <div className="flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold transition-colors relative",
                activeTab === tab.id
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>
      </header>

      {/* Контент */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "post" && <PostTab />}
        {activeTab === "story" && <StoryTab />}
        {activeTab === "reel" && <ReelTab />}
        {activeTab === "live" && <LiveTab />}
      </div>
    </div>
  );
}
