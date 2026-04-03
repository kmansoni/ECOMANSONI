/**
 * @file src/components/stories/StoryCreator.tsx
 * @description Полноэкранный редактор создания Story.
 * Камера/галерея → превью → текст/рисование/стикеры → публикация.
 * Рендер редактора делегирован в StoryEditorToolbar (<400 строк).
 */

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { X, Camera, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/mediaUpload";
import { useAuth } from "@/hooks/useAuth";
import { logger } from "@/lib/logger";
import { StoryEditorToolbar } from "./StoryEditorToolbar";
import type { StickerType } from "@/components/feed/StoryStickerPicker";
import type { TextLayer } from "@/components/feed/storyTextModel";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

interface StoryCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onPublished?: () => void;
}

type EditorMode = "idle" | "text" | "draw" | "stickers";

interface PlacedSticker {
  id: string;
  type: StickerType;
  x: number;
  y: number;
  data: Record<string, unknown>;
}

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic";
const ACCEPTED_VIDEO_TYPES = "video/mp4,video/quicktime,video/webm";

// ---------------------------------------------------------------------------
// StoryCreator
// ---------------------------------------------------------------------------

export function StoryCreator({ isOpen, onClose, onPublished }: StoryCreatorProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [caption, setCaption] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("idle");
  const [textLayers, setTextLayers] = useState<TextLayer[]>([]);
  const [drawingOverlay, setDrawingOverlay] = useState<string | null>(null);
  const [placedStickers, setPlacedStickers] = useState<PlacedSticker[]>([]);
  const [closeFriendsOnly, setCloseFriendsOnly] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // -- Выбор медиа --

  const setMediaFromFile = useCallback((file: File) => {
    const isVideo = file.type.startsWith("video/");
    setMediaType(isVideo ? "video" : "image");
    setMediaFile(file);
    setMediaPreview(URL.createObjectURL(file));
    setTextLayers([]);
    setDrawingOverlay(null);
    setPlacedStickers([]);
    setCaption("");
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > MAX_FILE_SIZE) {
        toast.error("Файл слишком большой. Максимум 100 МБ");
        return;
      }
      setMediaFromFile(file);
    },
    [setMediaFromFile],
  );

  const openGallery = useCallback(() => fileInputRef.current?.click(), []);

  const handleCameraCapture = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.setAttribute("capture", "environment");
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) setMediaFromFile(file);
    };
    input.click();
  }, [setMediaFromFile]);

  // -- Редактирование --

  const handleAddText = useCallback((layer: TextLayer) => {
    setTextLayers((prev) => [...prev, layer]);
    setEditorMode("idle");
  }, []);

  const handleSaveDrawing = useCallback((dataUrl: string) => {
    setDrawingOverlay(dataUrl);
    setEditorMode("idle");
  }, []);

  const handleStickerSelect = useCallback((type: StickerType) => {
    setPlacedStickers((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type, x: 0.5, y: 0.5, data: { type } },
    ]);
    setEditorMode("idle");
  }, []);

  const removeSticker = useCallback((id: string) => {
    setPlacedStickers((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // -- Публикация --

  const handlePublish = useCallback(async () => {
    if (!user || !mediaFile) return;
    setIsPublishing(true);
    setUploadProgress(0);

    try {
      const result = await uploadMedia(mediaFile, {
        bucket: "stories-media",
        onProgress: setUploadProgress,
      });

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { data: story, error } = await (supabase as any)
        .from("stories")
        .insert({
          author_id: user.id,
          media_url: result.url,
          media_type: mediaType,
          caption: caption.trim() || null,
          expires_at: expiresAt,
        })
        .select("id")
        .single();

      if (error) {
        logger.error("[StoryCreator] Ошибка создания story", { error });
        toast.error("Не удалось опубликовать историю");
        return;
      }

      if (placedStickers.length > 0 && story) {
        const rows = placedStickers.map((s, i) => ({
          story_id: story.id, type: s.type,
          position_x: s.x, position_y: s.y,
          rotation: 0, scale: 1, data: s.data, z_index: i,
        }));
        const { error: stErr } = await (supabase as any).from("story_stickers").insert(rows);
        if (stErr) logger.error("[StoryCreator] Ошибка стикеров", { error: stErr });
      }

      toast.success("История опубликована");
      handleClose();
      onPublished?.();
    } catch (err) {
      logger.error("[StoryCreator] Ошибка публикации", { error: err });
      toast.error("Не удалось опубликовать историю");
    } finally {
      setIsPublishing(false);
      setUploadProgress(0);
    }
  }, [user, mediaFile, mediaType, caption, placedStickers, onPublished]);

  // -- Закрытие --

  const handleClose = useCallback(() => {
    setMediaFile(null);
    setMediaPreview(null);
    setEditorMode("idle");
    setTextLayers([]);
    setDrawingOverlay(null);
    setPlacedStickers([]);
    setCaption("");
    setCloseFriendsOnly(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  // -- Экран выбора медиа --

  if (!mediaFile || !mediaPreview) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={`${ACCEPTED_IMAGE_TYPES},${ACCEPTED_VIDEO_TYPES}`}
          className="hidden"
          onChange={handleFileSelect}
        />
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center z-10"
          aria-label="Закрыть"
        >
          <X className="w-6 h-6" />
        </button>
        <h2 className="text-white text-xl font-semibold mb-8">Новая история</h2>
        <div className="flex gap-8">
          <button type="button" onClick={handleCameraCapture} className="flex flex-col items-center gap-3 min-h-[44px]" aria-label="Камера">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Camera className="w-8 h-8 text-white" />
            </div>
            <span className="text-white text-sm">Камера</span>
          </button>
          <button type="button" onClick={openGallery} className="flex flex-col items-center gap-3 min-h-[44px]" aria-label="Галерея">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-white" />
            </div>
            <span className="text-white text-sm">Галерея</span>
          </button>
        </div>
      </motion.div>
    );
  }

  // -- Экран редактора --

  return (
    <StoryEditorToolbar
      mediaPreview={mediaPreview}
      mediaType={mediaType}
      caption={caption}
      onCaptionChange={setCaption}
      textLayers={textLayers}
      onAddText={handleAddText}
      drawingOverlay={drawingOverlay}
      onSaveDrawing={handleSaveDrawing}
      placedStickers={placedStickers}
      onStickerSelect={handleStickerSelect}
      onRemoveSticker={removeSticker}
      closeFriendsOnly={closeFriendsOnly}
      onToggleCloseFriends={() => setCloseFriendsOnly((v) => !v)}
      isPublishing={isPublishing}
      uploadProgress={uploadProgress}
      onPublish={handlePublish}
      onClose={handleClose}
      editorMode={editorMode}
      onEditorModeChange={setEditorMode}
    />
  );
}
