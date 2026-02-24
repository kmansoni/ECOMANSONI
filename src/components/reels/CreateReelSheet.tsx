import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, Upload, X, Loader2, Music, Wand2, Users, MapPin, Eye, SlidersHorizontal, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReels } from "@/hooks/useReels";
import { toast } from "sonner";
import { SimpleMediaEditor } from "@/components/editor";
import { checkHashtagsAllowedForText } from "@/lib/hashtagModeration";

interface CreateReelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialVideoFile?: File | null;
}

export function CreateReelSheet({ open, onOpenChange, initialVideoFile }: CreateReelSheetProps) {
  const { user } = useAuth();
  const { createReel } = useReels();
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [musicTitle, setMusicTitle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [clientPublishId, setClientPublishId] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seededOnceRef = useRef(false);
  const inFlightRef = useRef(false);

  const effectiveVideoFile: File | null =
    videoFile ?? fileInputRef.current?.files?.[0] ?? null;

  const inferVideoContentType = (extOrType: string) => {
    const v = (extOrType || "").toLowerCase();
    if (v.startsWith("video/")) return v;
    const ext = v.replace(/^\./, "");
    switch (ext) {
      case "mp4":
      case "m4v":
        return "video/mp4";
      case "webm":
        return "video/webm";
      case "mov":
        return "video/quicktime";
      case "avi":
        return "video/x-msvideo";
      default:
        return "video/mp4";
    }
  };

  const selectVideoFile = (file: File) => {
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Выберите видео файл");
      return;
    }

    // Keep this aligned with the `reels-media` bucket allowed_mime_types.
    const allowedMimeTypes = new Set([
      "video/mp4",
      "video/webm",
      "video/quicktime",
      "video/x-msvideo",
    ]);
    const allowedExtensions = new Set(["mp4", "webm", "mov", "avi", "m4v"]);
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (!allowedMimeTypes.has(file.type) && !allowedExtensions.has(ext)) {
      toast.error("Неподдерживаемый формат. Используйте MP4, WebM, MOV или AVI");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Максимальный размер видео: 100MB");
      return;
    }

    const getDurationSeconds = (f: File) =>
      new Promise<number | null>((resolve) => {
        const url = URL.createObjectURL(f);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.muted = true;
        const cleanup = () => {
          URL.revokeObjectURL(url);
        };
        video.onloadedmetadata = () => {
          const d = Number(video.duration);
          cleanup();
          resolve(Number.isFinite(d) ? d : null);
        };
        video.onerror = () => {
          cleanup();
          resolve(null);
        };
        video.src = url;
      });

    void (async () => {
      const duration = await getDurationSeconds(file);
      if (duration != null && duration > 90) {
        toast.error("Выберите видео короче 90 секунд.");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
    })();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    selectVideoFile(file);
  };

  useEffect(() => {
    if (!open) {
      seededOnceRef.current = false;
      return;
    }
    if (seededOnceRef.current) return;
    if (!initialVideoFile) return;
    seededOnceRef.current = true;
    selectVideoFile(initialVideoFile);
  }, [open, initialVideoFile]);

  const handleRemoveVideo = () => {
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }
    setVideoFile(null);
    setVideoPreview(null);
    setIsEdited(false);
    setClientPublishId(null);
    if (user) {
      try {
        sessionStorage.removeItem(`reels_client_publish_id:${user.id}`);
      } catch {
        // ignore
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Handle video edit save
  const handleEditorSave = (blob: Blob) => {
    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
    }
    
    const newFile = new File([blob], videoFile?.name || "reel.mp4", { type: blob.type });
    const newPreview = URL.createObjectURL(blob);
    
    setVideoFile(newFile);
    setVideoPreview(newPreview);
    setIsEdited(true);
    setShowEditor(false);
    toast.success("Видео отредактировано");
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error("Войдите в аккаунт, чтобы опубликовать Reel");
      return;
    }

    // Ref-based guard to prevent double-tap publishes before state updates.
    if (inFlightRef.current) return;

    const fileToUpload = effectiveVideoFile;
    if (!fileToUpload) {
      toast.error("Сначала выберите видео");
      return;
    }

    // Block immediately (before any awaits) to avoid double-tap races.
    inFlightRef.current = true;
    setIsUploading(true);

    try {
      const descriptionTrimmed = description.trim();
      const hashtagVerdict = await checkHashtagsAllowedForText(descriptionTrimmed);
      if (!hashtagVerdict.ok) {
        toast.error("Некоторые хештеги недоступны", {
          description: ("blockedTags" in hashtagVerdict ? hashtagVerdict.blockedTags : []).join(", "),
        });
        return;
      }

      // Stable idempotency key for this publish intent (survives retries).
      let publishId = clientPublishId;
      if (!publishId) {
        try {
          publishId = sessionStorage.getItem(`reels_client_publish_id:${user.id}`);
        } catch {
          publishId = null;
        }
      }
      if (!publishId) {
        publishId = crypto.randomUUID();
        try {
          sessionStorage.setItem(`reels_client_publish_id:${user.id}`, publishId);
        } catch {
          // ignore
        }
      }
      setClientPublishId(publishId);

      // Upload video to storage
      const fileExt = (fileToUpload.name.split(".").pop() || "mp4").toLowerCase();
      const fileName = `${user.id}/reels/${publishId}/original.${fileExt}`;
      const contentType = inferVideoContentType(fileToUpload.type || fileExt);

      const { error: uploadError } = await supabase.storage
        .from("reels-media")
        .upload(fileName, fileToUpload, {
          cacheControl: "3600",
          contentType,
          upsert: false,
        });

      if (uploadError) {
        const msg = String((uploadError as any)?.message || "");
        const status = Number((uploadError as any)?.statusCode || (uploadError as any)?.status || 0);

        // Idempotency: treat object already existing as success for the same publish intent.
        const objectExists = status === 409 || msg.toLowerCase().includes("already exists") || msg.toLowerCase().includes("resource already exists");
        if (!objectExists) {
          // Bucket or storage not available — surface a clear error instead of a generic one.
          if (msg.toLowerCase().includes("not found")) {
            toast.error("Хранилище не настроено. Обратитесь к администратору.");
            return;
          }
          throw uploadError;
        }
      }

      // Create reel record
      const result = await createReel(
        fileName,
        undefined, // thumbnail - could generate later
        descriptionTrimmed || undefined,
        musicTitle.trim() || undefined,
        publishId
      );

      if (result.error) {
        throw new Error(result.error);
      }

      toast.success("Reel опубликован!");
      handleRemoveVideo();
      setDescription("");
      setMusicTitle("");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating reel:", error);
      toast.error("Ошибка при публикации: " + (error?.message || "Неизвестная ошибка"));
    } finally {
      setIsUploading(false);
      inFlightRef.current = false;
    }
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    if (isUploading) return;
    handleRemoveVideo();
    setDescription("");
    setMusicTitle("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] bg-background" hideCloseButton>
        <SheetHeader className="sr-only">
          <SheetTitle>Новый Reel</SheetTitle>
          <SheetDescription>
            Создание и публикация нового Reels-видео.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center justify-between px-4 h-12 border-b border-border safe-area-top">
          <Button variant="ghost" size="icon" onClick={() => handleSheetOpenChange(false)}>
            <X className="w-5 h-5" />
          </Button>
          <h1 className="font-semibold text-lg">Новый Reel</h1>
          <div className="w-10" />
        </div>

        <div className="flex flex-col gap-4 mt-4 h-[calc(100%-4rem)] overflow-y-auto">
          {/* Video Upload Area */}
          {!videoPreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-muted-foreground/30 rounded-xl cursor-pointer hover:border-primary/50 transition-colors aspect-[9/16] max-h-[50vh]"
            >
              <Video className="w-12 h-12 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Выберите видео</p>
                <p className="text-sm text-muted-foreground">
                  MP4, MOV до 100MB
                </p>
              </div>
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Загрузить
              </Button>
            </div>
          ) : (
            <div className="relative aspect-[9/16] max-h-[50vh] bg-black rounded-xl overflow-hidden">
              <video
                src={videoPreview}
                className="w-full h-full object-contain"
                controls
                autoPlay
                muted
                loop
              />
              {/* Edited badge */}
              {isEdited && (
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-primary/90 rounded-full text-[10px] text-primary-foreground font-medium">
                  Изменено ✨
                </div>
              )}
              {/* Action buttons */}
              <div className="absolute top-2 right-2 flex gap-1.5">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setShowEditor(true)}
                  className="bg-primary/90 hover:bg-primary"
                >
                  <Wand2 className="w-4 h-4 text-primary-foreground" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={handleRemoveVideo}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              placeholder="Добавьте описание к вашему Reel..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2200}
              className="resize-none"
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/2200
            </p>
          </div>

          {/* Music Title */}
          <div className="space-y-2">
            <Label htmlFor="music">Музыка (опционально)</Label>
            <div className="relative">
              <Music className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="music"
                placeholder="Название трека"
                value={musicTitle}
                onChange={(e) => setMusicTitle(e.target.value)}
                className="pl-10"
                maxLength={100}
              />
            </div>
          </div>

          {/* Publish Options */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button className="w-full flex items-center gap-4 px-4 py-4 border-b border-border">
              <Users className="w-6 h-6" />
              <span className="flex-1 text-left font-medium">Отметить людей</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button className="w-full flex items-center gap-4 px-4 py-4 border-b border-border">
              <MapPin className="w-6 h-6" />
              <span className="flex-1 text-left font-medium">Добавить место</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button className="w-full flex items-center gap-4 px-4 py-4 border-b border-border">
              <Eye className="w-6 h-6" />
              <span className="flex-1 text-left font-medium">Настройки аудитории</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button className="w-full flex items-center gap-4 px-4 py-4">
              <SlidersHorizontal className="w-6 h-6" />
              <span className="flex-1 text-left font-medium">Расширенные настройки</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!effectiveVideoFile || isUploading}
            className="w-full mt-auto"
            size="lg"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Публикация...
              </>
            ) : (
              "Поделиться"
            )}
          </Button>
        </div>
      </SheetContent>

      {/* Video Editor Modal */}
      <SimpleMediaEditor
        open={showEditor}
        onOpenChange={setShowEditor}
        mediaFile={effectiveVideoFile}
        contentType="reel"
        onSave={handleEditorSave}
        onCancel={() => setShowEditor(false)}
      />
    </Sheet>
  );
}
