/**
 * @file src/components/stories/StoryEditorToolbar.tsx
 * @description Панель инструментов и превью редактора Story.
 * Рендерит медиа-превью, рисунки, текстовые слои, стикеры, прогресс загрузки.
 */

import { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Type,
  Pen,
  Sticker,
  Send,
  Users,
  Loader2,
} from "lucide-react";
import { StoryStickerPicker } from "@/components/feed/StoryStickerPicker";
import { StoryTextTool } from "@/components/feed/StoryTextTool";
import { StoryDrawingTool } from "@/components/feed/StoryDrawingTool";
import type { TextLayer } from "@/components/feed/storyTextModel";
import type { StickerType } from "@/components/feed/StoryStickerPicker";

// ---------------------------------------------------------------------------
// Типы
// ---------------------------------------------------------------------------

type EditorMode = "idle" | "text" | "draw" | "stickers";

interface PlacedSticker {
  id: string;
  type: StickerType;
  x: number;
  y: number;
  data: Record<string, unknown>;
}

interface StoryEditorToolbarProps {
  mediaPreview: string;
  mediaType: "image" | "video";
  caption: string;
  onCaptionChange: (val: string) => void;
  textLayers: TextLayer[];
  onAddText: (layer: TextLayer) => void;
  drawingOverlay: string | null;
  onSaveDrawing: (dataUrl: string) => void;
  placedStickers: PlacedSticker[];
  onStickerSelect: (type: StickerType) => void;
  onRemoveSticker: (id: string) => void;
  closeFriendsOnly: boolean;
  onToggleCloseFriends: () => void;
  isPublishing: boolean;
  uploadProgress: number;
  onPublish: () => void;
  onClose: () => void;
  editorMode: EditorMode;
  onEditorModeChange: (mode: EditorMode) => void;
}

// ---------------------------------------------------------------------------
// StoryEditorToolbar
// ---------------------------------------------------------------------------

export function StoryEditorToolbar({
  mediaPreview,
  mediaType,
  caption,
  onCaptionChange,
  textLayers,
  onAddText,
  drawingOverlay,
  onSaveDrawing,
  placedStickers,
  onStickerSelect,
  onRemoveSticker,
  closeFriendsOnly,
  onToggleCloseFriends,
  isPublishing,
  uploadProgress,
  onPublish,
  onClose,
  editorMode,
  onEditorModeChange,
}: StoryEditorToolbarProps) {
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Превью медиа */}
      <div className="flex-1 relative overflow-hidden">
        {mediaType === "video" ? (
          <video
            ref={videoPreviewRef}
            src={mediaPreview}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <img src={mediaPreview} alt="Превью" className="w-full h-full object-cover" />
        )}

        {/* Рисунок поверх */}
        {drawingOverlay && (
          <img
            src={drawingOverlay}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}

        {/* Текстовые слои */}
        {textLayers.map((layer) => (
          <div
            key={layer.id}
            className="absolute pointer-events-none"
            style={{
              left: `${layer.x * 100}%`,
              top: `${layer.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <p
              className={`${layer.font} ${
                layer.background ? "bg-black/60 rounded-lg px-3 py-1" : ""
              }`}
              style={{ color: layer.color, fontSize: `${layer.fontSize}px`, textAlign: layer.align }}
            >
              {layer.text}
            </p>
          </div>
        ))}

        {/* Стикеры */}
        {placedStickers.map((s) => (
          <div
            key={s.id}
            className="absolute"
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div className="relative">
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-3 py-2 text-white text-sm">
                {s.type}
              </div>
              <button
                type="button"
                onClick={() => onRemoveSticker(s.id)}
                className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                aria-label="Удалить стикер"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          </div>
        ))}

        {/* Прогресс загрузки */}
        {isPublishing && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3 z-40">
            <Loader2 className="w-10 h-10 text-white animate-spin" />
            <div className="w-48 h-1.5 bg-white/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-white text-sm">{uploadProgress}%</p>
          </div>
        )}
      </div>

      {/* Toolbar */}
      {editorMode === "idle" && (
        <div className="absolute top-4 left-0 right-0 z-30 px-4 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white hover:bg-white/10 rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Закрыть"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onEditorModeChange("text")}
              className="p-2.5 bg-black/40 backdrop-blur-sm rounded-full text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Добавить текст"
            >
              <Type className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => onEditorModeChange("draw")}
              className="p-2.5 bg-black/40 backdrop-blur-sm rounded-full text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Рисование"
            >
              <Pen className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => onEditorModeChange("stickers")}
              className="p-2.5 bg-black/40 backdrop-blur-sm rounded-full text-white min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Стикеры"
            >
              <Sticker className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Нижняя панель */}
      {editorMode === "idle" && (
        <div className="bg-black/80 backdrop-blur-sm px-4 py-3 flex flex-col gap-3 pb-safe">
          <input
            type="text"
            value={caption}
            onChange={(e) => onCaptionChange(e.target.value)}
            placeholder="Добавить подпись..."
            maxLength={200}
            className="w-full bg-white/10 text-white placeholder:text-white/40 rounded-xl px-4 py-2.5 text-sm outline-none border border-white/10 min-h-[44px]"
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onToggleCloseFriends}
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm transition-colors min-h-[44px] ${
                closeFriendsOnly ? "bg-green-500 text-white" : "bg-white/10 text-white/70"
              }`}
              aria-label={closeFriendsOnly ? "Близкие друзья" : "Все"}
            >
              <Users className="w-4 h-4" />
              {closeFriendsOnly ? "Близкие друзья" : "Все"}
            </button>

            <button
              type="button"
              onClick={onPublish}
              disabled={isPublishing}
              className="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2.5 rounded-full font-semibold text-sm min-h-[44px] disabled:opacity-50 transition-opacity"
              aria-label="Опубликовать"
            >
              <Send className="w-4 h-4" />
              Опубликовать
            </button>
          </div>
        </div>
      )}

      {/* Режим текста */}
      <AnimatePresence>
        {editorMode === "text" && (
          <StoryTextTool onAdd={onAddText} onClose={() => onEditorModeChange("idle")} />
        )}
      </AnimatePresence>

      {/* Режим рисования */}
      <AnimatePresence>
        {editorMode === "draw" && (
          <StoryDrawingTool
            width={window.innerWidth}
            height={window.innerHeight}
            onSave={onSaveDrawing}
            onClose={() => onEditorModeChange("idle")}
          />
        )}
      </AnimatePresence>

      {/* Стикеры */}
      <StoryStickerPicker
        isOpen={editorMode === "stickers"}
        onClose={() => onEditorModeChange("idle")}
        onSelect={onStickerSelect}
      />
    </motion.div>
  );
}
