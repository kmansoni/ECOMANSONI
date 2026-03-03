import React, { useState, useRef, useCallback } from 'react';
import { TextItem } from '../../hooks/useChatMediaEditor';

interface TextOverlayProps {
  textItems: TextItem[];
  isActive: boolean;
  containerWidth: number;
  containerHeight: number;
  onAddText: (item: Omit<TextItem, 'id'>) => void;
  onUpdateText: (id: string, updates: Partial<TextItem>) => void;
  onRemoveText: (id: string) => void;
}

const TEXT_COLORS = ['#FFFFFF', '#000000', '#FF3B30', '#007AFF', '#FFD60A', '#34C759'];
const TEXT_BACKGROUNDS: TextItem['background'][] = ['transparent', 'black', 'white'];
const FONT_STYLES: TextItem['fontStyle'][] = ['normal', 'bold', 'italic'];
const FONT_SIZES = [16, 20, 28, 36, 48];

interface TextEditorState {
  id: string | null; // null = новый
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  fontStyle: TextItem['fontStyle'];
  background: TextItem['background'];
}

export const TextOverlay: React.FC<TextOverlayProps> = ({
  textItems,
  isActive,
  containerWidth,
  containerHeight,
  onAddText,
  onUpdateText,
  onRemoveText,
}) => {
  const [editing, setEditing] = useState<TextEditorState | null>(null);
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!isActive || dragging) return;
    const rect = containerRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setEditing({
      id: null,
      x,
      y,
      text: '',
      color: '#FFFFFF',
      fontSize: 28,
      fontStyle: 'bold',
      background: 'transparent',
    });
  }, [isActive, dragging]);

  const handleTextClick = useCallback((e: React.MouseEvent, item: TextItem) => {
    if (!isActive) return;
    e.stopPropagation();
    setEditing({
      id: item.id,
      x: item.x,
      y: item.y,
      text: item.text,
      color: item.color,
      fontSize: item.fontSize,
      fontStyle: item.fontStyle,
      background: item.background,
    });
  }, [isActive]);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    if (editing.text.trim()) {
      if (editing.id) {
        onUpdateText(editing.id, {
          text: editing.text,
          color: editing.color,
          fontSize: editing.fontSize,
          fontStyle: editing.fontStyle,
          background: editing.background,
        });
      } else {
        onAddText({
          x: editing.x,
          y: editing.y,
          text: editing.text,
          color: editing.color,
          fontSize: editing.fontSize,
          fontStyle: editing.fontStyle,
          background: editing.background,
        });
      }
    } else if (editing.id) {
      onRemoveText(editing.id);
    }
    setEditing(null);
  }, [editing, onAddText, onUpdateText, onRemoveText]);

  const startDrag = useCallback((e: React.MouseEvent | React.TouchEvent, id: string, origX: number, origY: number) => {
    if (!isActive) return;
    e.stopPropagation();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragging({ id, startX: clientX, startY: clientY, origX, origY });
  }, [isActive]);

  const onDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!dragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const dx = clientX - dragging.startX;
    const dy = clientY - dragging.startY;
    onUpdateText(dragging.id, {
      x: Math.max(0, Math.min(containerWidth, dragging.origX + dx)),
      y: Math.max(0, Math.min(containerHeight, dragging.origY + dy)),
    });
  }, [dragging, onUpdateText, containerWidth, containerHeight]);

  const stopDrag = useCallback(() => setDragging(null), []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ cursor: isActive ? 'text' : 'default' }}
      onClick={handleContainerClick}
      onMouseMove={onDragMove}
      onMouseUp={stopDrag}
      onTouchMove={onDragMove}
      onTouchEnd={stopDrag}
    >
      {/* Рендер текстовых элементов */}
      {textItems.map(item => (
        <div
          key={item.id}
          className="absolute select-none cursor-move"
          style={{
            left: item.x,
            top: item.y,
            transform: 'translate(-50%, -50%)',
            color: item.color,
            fontSize: item.fontSize,
            fontWeight: item.fontStyle === 'bold' ? 'bold' : 'normal',
            fontStyle: item.fontStyle === 'italic' ? 'italic' : 'normal',
            background: item.background === 'black'
              ? 'rgba(0,0,0,0.7)'
              : item.background === 'white'
              ? 'rgba(255,255,255,0.8)'
              : 'transparent',
            padding: item.background !== 'transparent' ? '2px 6px' : undefined,
            borderRadius: item.background !== 'transparent' ? 4 : undefined,
            whiteSpace: 'nowrap',
            textShadow: item.background === 'transparent' ? '0 1px 3px rgba(0,0,0,0.8)' : undefined,
          }}
          onClick={(e) => handleTextClick(e, item)}
          onMouseDown={(e) => startDrag(e, item.id, item.x, item.y)}
          onTouchStart={(e) => startDrag(e, item.id, item.x, item.y)}
        >
          {item.text}
        </div>
      ))}

      {/* Диалог редактирования текста */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50"
          onClick={e => e.stopPropagation()}
        >
          <div className="w-full max-w-sm bg-zinc-900 rounded-2xl p-4 mx-4 shadow-2xl">
            <textarea
              autoFocus
              className="w-full bg-transparent text-white text-xl outline-none resize-none text-center min-h-[60px]"
              placeholder="Введите текст..."
              value={editing.text}
              onChange={e => setEditing(prev => prev ? { ...prev, text: e.target.value } : null)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); } }}
              style={{
                color: editing.color,
                fontWeight: editing.fontStyle === 'bold' ? 'bold' : 'normal',
                fontStyle: editing.fontStyle === 'italic' ? 'italic' : 'normal',
                fontSize: editing.fontSize,
                background: editing.background === 'black'
                  ? 'rgba(0,0,0,0.7)'
                  : editing.background === 'white'
                  ? 'rgba(255,255,255,0.8)'
                  : 'transparent',
              }}
            />

            {/* Цвет текста */}
            <div className="flex justify-center gap-2 mt-3">
              {TEXT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setEditing(prev => prev ? { ...prev, color: c } : null)}
                  className="w-7 h-7 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c,
                    borderColor: editing.color === c ? '#007AFF' : 'transparent',
                    transform: editing.color === c ? 'scale(1.25)' : 'scale(1)',
                  }}
                />
              ))}
            </div>

            {/* Размер шрифта */}
            <div className="flex justify-center gap-2 mt-3">
              {FONT_SIZES.map(s => (
                <button
                  key={s}
                  onClick={() => setEditing(prev => prev ? { ...prev, fontSize: s } : null)}
                  className={`px-2 py-1 rounded text-white text-xs transition-colors ${
                    editing.fontSize === s ? 'bg-blue-600' : 'bg-white/10'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Стиль и фон */}
            <div className="flex justify-between mt-3 gap-2">
              <div className="flex gap-1">
                {FONT_STYLES.map(style => (
                  <button
                    key={style}
                    onClick={() => setEditing(prev => prev ? { ...prev, fontStyle: style } : null)}
                    className={`px-3 py-1 rounded text-white text-sm transition-colors ${
                      editing.fontStyle === style ? 'bg-blue-600' : 'bg-white/10'
                    }`}
                    style={{
                      fontWeight: style === 'bold' ? 'bold' : 'normal',
                      fontStyle: style === 'italic' ? 'italic' : 'normal',
                    }}
                  >
                    A
                  </button>
                ))}
              </div>
              <div className="flex gap-1">
                {TEXT_BACKGROUNDS.map(bg => (
                  <button
                    key={bg}
                    onClick={() => setEditing(prev => prev ? { ...prev, background: bg } : null)}
                    className={`px-2 py-1 rounded text-xs border transition-colors ${
                      editing.background === bg ? 'border-blue-500' : 'border-white/20'
                    }`}
                    style={{
                      background: bg === 'black' ? '#000' : bg === 'white' ? '#fff' : 'transparent',
                      color: bg === 'white' ? '#000' : '#fff',
                    }}
                  >
                    {bg === 'transparent' ? '∅' : bg === 'black' ? '■' : '□'}
                  </button>
                ))}
              </div>
            </div>

            {/* Кнопки */}
            <div className="flex gap-2 mt-4">
              {editing.id && (
                <button
                  onClick={() => { onRemoveText(editing.id!); setEditing(null); }}
                  className="flex-1 py-2 rounded-xl bg-red-600/20 text-red-400 text-sm"
                >
                  Удалить
                </button>
              )}
              <button
                onClick={commitEdit}
                className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextOverlay;
