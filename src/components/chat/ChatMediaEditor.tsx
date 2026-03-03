import React, { useRef, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatMediaEditor, EditorTool } from '../../hooks/useChatMediaEditor';
import { DrawingCanvas, DrawingToolbar } from './DrawingCanvas';
import { TextOverlay } from './TextOverlay';
import { PhotoFilters } from './PhotoFilters';

export interface ChatMediaEditorProps {
  imageFile: File;
  onSend: (editedBlob: Blob, caption: string) => void;
  onCancel: () => void;
}

const TOOLS: { id: EditorTool; icon: string; label: string }[] = [
  { id: 'draw',   icon: '✏️', label: 'Рисовать' },
  { id: 'text',   icon: '🔤', label: 'Текст' },
  { id: 'filter', icon: '🎨', label: 'Фильтры' },
  { id: 'sticker',icon: '😀', label: 'Стикеры' },
];

const STICKERS = ['😀','😂','❤️','👍','🔥','✨','🎉','💯','😎','🥺','😭','🤩','💪','🙏','👀'];

export function ChatMediaEditor({ imageFile, onSend, onCancel }: ChatMediaEditorProps) {
  const [imageUrl, setImageUrl] = useState<string>('');
  const [caption, setCaption] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isEraser, setIsEraser] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1080, height: 1920 });

  const imageRef = useRef<HTMLImageElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const editor = useChatMediaEditor();

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.onload = () => setCanvasSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = imageUrl;
  }, [imageUrl]);

  const activeTool = editor.tool;

  const toggleTool = useCallback((t: EditorTool) => {
    editor.setTool(activeTool === t ? 'none' : t);
  }, [editor, activeTool]);

  const handleSend = useCallback(async () => {
    if (!imageRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imageRef.current.naturalWidth;
      canvas.height = imageRef.current.naturalHeight;
      const blob = await editor.exportImage(imageRef.current, canvas, null);
      onSend(blob, caption);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  }, [editor, caption, onSend, isExporting]);

  const addSticker = useCallback((emoji: string) => {
    const containerRect = imageContainerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    editor.addText({
      text: emoji,
      x: containerRect.width / 2,
      y: containerRect.height / 2,
      color: '#FFFFFF',
      fontSize: 48,
      fontStyle: 'normal',
      background: 'transparent',
    });
    editor.setTool('none' as EditorTool);
  }, [editor]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pb-2 bg-gradient-to-b from-black/60 to-transparent absolute top-0 left-0 right-0 z-10">
        <button
          onClick={onCancel}
          className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white text-xl"
        >
          ✕
        </button>

        <div className="flex items-center gap-3">
          <button
            disabled={!editor.canUndo}
            onClick={editor.undo}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-opacity ${
              editor.canUndo ? 'text-white bg-white/20' : 'text-white/30'
            }`}
          >
            ↩️
          </button>
          <button
            disabled={!editor.canRedo}
            onClick={editor.redo}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-opacity ${
              editor.canRedo ? 'text-white bg-white/20' : 'text-white/30'
            }`}
          >
            ↪️
          </button>
        </div>
      </div>

      {/* Фото + слои */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <div
          ref={imageContainerRef}
          className="relative max-w-full max-h-full"
          style={{ touchAction: activeTool === 'draw' ? 'none' : 'auto' }}
        >
          {imageUrl && (
            <img
              ref={imageRef}
              src={imageUrl}
              alt="edit"
              className="max-w-full max-h-[calc(100vh-220px)] object-contain block"
              style={{ filter: editor.getFilterStyle(), userSelect: 'none', pointerEvents: 'none' }}
              draggable={false}
            />
          )}

          {/* Canvas рисования */}
          {imageRef.current && (
            <DrawingCanvas
              width={canvasSize.width}
              height={canvasSize.height}
              brushColor={editor.brushColor}
              brushSize={editor.brushSize}
              isActive={activeTool === 'draw'}
              onDrawingChange={editor.saveDrawing}
              existingDataUrl={editor.drawingDataUrl}
              selectedColor={editor.brushColor}
              selectedSize={editor.brushSize}
              onColorChange={editor.setBrushColor}
              onSizeChange={editor.setBrushSize}
              isEraser={isEraser}
            />
          )}

          {/* Текстовые оверлеи */}
          {imageRef.current && (
            <TextOverlay
              textItems={editor.textItems}
              isActive={activeTool === 'text'}
              containerWidth={imageRef.current.clientWidth}
              containerHeight={imageRef.current.clientHeight}
              onAddText={editor.addText}
              onUpdateText={editor.updateText}
              onRemoveText={editor.removeText}
            />
          )}
        </div>
      </div>

      {/* Нижняя панель */}
      <div className="flex flex-col bg-gradient-to-t from-black/80 to-transparent pb-safe">
        {/* Инструменты для активного режима */}
        <AnimatePresence mode="wait">
          {activeTool === 'draw' && (
            <motion.div
              key="draw-tools"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="px-2"
            >
              <DrawingToolbar
                selectedColor={editor.brushColor}
                selectedSize={editor.brushSize}
                isEraser={isEraser}
                onColorChange={editor.setBrushColor}
                onSizeChange={editor.setBrushSize}
                onEraserToggle={() => setIsEraser(p => !p)}
              />
            </motion.div>
          )}

          {activeTool === 'filter' && (
            <motion.div
              key="filter-tools"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              {imageUrl && (
                <PhotoFilters
                  imageUrl={imageUrl}
                  activeFilter={editor.activeFilter}
                  onFilterSelect={editor.setFilter}
                />
              )}
            </motion.div>
          )}

          {activeTool === 'sticker' && (
            <motion.div
              key="sticker-tools"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="px-4 py-2"
            >
              <div className="flex flex-wrap gap-2 justify-center">
                {STICKERS.map(s => (
                  <button
                    key={s}
                    onClick={() => addSticker(s)}
                    className="text-3xl p-1 hover:scale-125 transition-transform active:scale-110"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Панель инструментов */}
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex gap-2">
            {TOOLS.map(t => (
              <button
                key={t.id}
                onClick={() => toggleTool(t.id)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
                  activeTool === t.id
                    ? 'bg-white/20 scale-105'
                    : 'bg-transparent hover:bg-white/10'
                }`}
              >
                <span className="text-xl">{t.icon}</span>
                <span className="text-white/70 text-[10px]">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Кнопка отправить */}
          <button
            onClick={handleSend}
            disabled={isExporting}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-5 py-3 rounded-2xl font-semibold text-sm shadow-lg transition-all disabled:opacity-50"
          >
            {isExporting ? (
              <span className="animate-spin">⏳</span>
            ) : (
              <>
                <span>Отправить</span>
                <span>➤</span>
              </>
            )}
          </button>
        </div>

        {/* Подпись */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4 py-2">
            <input
              type="text"
              placeholder="Добавить подпись..."
              value={caption}
              onChange={e => setCaption(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder-white/40 outline-none text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatMediaEditor;
