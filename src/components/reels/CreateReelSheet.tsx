import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Video, Upload, X, Loader2, Music, Wand2 } from "lucide-react";
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
  const [showEditor, setShowEditor] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seededOnceRef = useRef(false);

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
    const fileToUpload = effectiveVideoFile;
    if (!fileToUpload) {
      toast.error("Сначала выберите видео");
      return;
    }

    const descriptionTrimmed = description.trim();
    const hashtagVerdict = await checkHashtagsAllowedForText(descriptionTrimmed);
    if (!hashtagVerdict.ok) {
      toast.error("Некоторые хештеги недоступны", {
        description: hashtagVerdict.blockedTags.join(", "),
      });
      return;
    }

    setIsUploading(true);

    try {
      // Upload video to storage
      const fileExt = (fileToUpload.name.split(".").pop() || "mp4").toLowerCase();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const contentType = inferVideoContentType(fileToUpload.type || fileExt);

      const { error: uploadError } = await supabase.storage
        .from("reels-media")
        .upload(fileName, fileToUpload, {
          cacheControl: "3600",
          contentType,
          upsert: false,
        });

      if (uploadError) {
        // If bucket doesn't exist, create it first
        if (uploadError.message.includes("not found")) {
          toast.error("Хранилище не настроено. Обратитесь к администратору.");
          return;
        }
        throw uploadError;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("reels-media")
        .getPublicUrl(fileName);

      // Create reel record
      const result = await createReel(
        urlData.publicUrl,
        undefined, // thumbnail - could generate later
        descriptionTrimmed || undefined,
        musicTitle.trim() || undefined
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
      toast.error("Ошибка при публикации: " + error.message);
    } finally {
      setIsUploading(false);
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
      <SheetContent side="bottom" className="h-[90vh] bg-background">
        <SheetHeader>
          <SheetTitle>Новый Reel</SheetTitle>
        </SheetHeader>

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
              "Опубликовать"
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
