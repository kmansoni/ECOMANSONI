import { useState, useRef } from "react";
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

interface CreateReelSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateReelSheet({ open, onOpenChange }: CreateReelSheetProps) {
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast.error("Выберите видео файл");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Максимальный размер видео: 100MB");
      return;
    }

    setVideoFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
  };

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
    if (!user || !videoFile) return;

    setIsUploading(true);

    try {
      // Upload video to storage
      const fileExt = videoFile.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("reels-media")
        .upload(fileName, videoFile, {
          cacheControl: "3600",
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
        description.trim() || undefined,
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

  const handleClose = () => {
    if (!isUploading) {
      handleRemoveVideo();
      setDescription("");
      setMusicTitle("");
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
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
            disabled={!videoFile || isUploading}
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
        mediaFile={videoFile}
        contentType="reel"
        onSave={handleEditorSave}
        onCancel={() => setShowEditor(false)}
      />
    </Sheet>
  );
}
