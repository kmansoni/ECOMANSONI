/**
 * @file src/components/feed/MediaDragReorder.tsx
 * @description Drag-to-reorder медиа в карусели поста — Instagram стиль.
 *
 * Архитектура:
 * - Pointer Events API для drag (touch + mouse)
 * - Визуальная обратная связь: поднятый элемент (scale + shadow)
 * - Swap при пересечении центра соседнего элемента
 * - Haptic feedback при swap
 * - Анимация через CSS transitions (не framer-motion для производительности)
 * - Максимум 10 медиафайлов (Instagram limit)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { GripVertical, X, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Haptics } from "@/lib/haptics";

export interface MediaItem {
  id: string;
  url: string;
  type: "image" | "video";
  thumbnailUrl?: string;
}

interface MediaDragReorderProps {
  items: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  onRemove: (id: string) => void;
  maxItems?: number;
}

export function MediaDragReorder({
  items,
  onChange,
  onRemove,
  maxItems = 10,
}: MediaDragReorderProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const handlePointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.preventDefault();
    const el = itemRefs.current.get(id);
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;

    // Задержка перед началом drag (чтобы отличить от tap)
    const timer = setTimeout(() => {
      isDragging.current = true;
      setDraggingId(id);
      Haptics.tap();
    }, 200);

    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener("pointerup", cleanup);
    };
    el.addEventListener("pointerup", cleanup, { once: true });
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent, id: string) => {
    if (!isDragging.current || draggingId !== id) return;

    // Находим элемент под курсором
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const relX = e.clientX - containerRect.left;
    const relY = e.clientY - containerRect.top;

    // Определяем над каким элементом находимся
    let overItemId: string | null = null;
    itemRefs.current.forEach((el, itemId) => {
      if (itemId === id) return;
      const rect = el.getBoundingClientRect();
      const elRelX = rect.left - containerRect.left;
      const elRelY = rect.top - containerRect.top;
      if (
        relX >= elRelX && relX <= elRelX + rect.width &&
        relY >= elRelY && relY <= elRelY + rect.height
      ) {
        overItemId = itemId;
      }
    });

    if (overItemId !== dragOverId) {
      setDragOverId(overItemId);
    }
  }, [draggingId, dragOverId]);

  const handlePointerUp = useCallback((e: React.PointerEvent, id: string) => {
    if (!isDragging.current) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }

    if (dragOverId && dragOverId !== id) {
      // Swap элементов
      const newItems = [...items];
      const fromIdx = newItems.findIndex((item) => item.id === id);
      const toIdx = newItems.findIndex((item) => item.id === dragOverId);
      if (fromIdx !== -1 && toIdx !== -1) {
        [newItems[fromIdx], newItems[toIdx]] = [newItems[toIdx], newItems[fromIdx]];
        onChange(newItems);
        Haptics.select();
      }
    }

    setDraggingId(null);
    setDragOverId(null);
    isDragging.current = false;
  }, [items, dragOverId, onChange]);

  return (
    <div
      ref={containerRef}
      className="flex flex-wrap gap-2 p-2"
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) itemRefs.current.set(item.id, el);
            else itemRefs.current.delete(item.id);
          }}
          onPointerDown={(e) => handlePointerDown(e, item.id)}
          onPointerMove={(e) => handlePointerMove(e, item.id)}
          onPointerUp={(e) => handlePointerUp(e, item.id)}
          className={cn(
            "relative w-24 h-24 rounded-xl overflow-hidden cursor-grab active:cursor-grabbing",
            "transition-all duration-200 select-none",
            draggingId === item.id && "scale-110 shadow-2xl z-10 opacity-90",
            dragOverId === item.id && "ring-2 ring-primary scale-105"
          )}
          style={{ touchAction: "none" }}
        >
          {/* Медиа */}
          {item.type === "image" ? (
            <img
              src={item.thumbnailUrl ?? item.url}
              alt=""
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-black relative">
              {item.thumbnailUrl && (
                <img src={item.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <Play className="w-6 h-6 text-white fill-white" />
              </div>
            </div>
          )}

          {/* Порядковый номер */}
          <div className="absolute top-1 left-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">{index + 1}</span>
          </div>

          {/* Кнопка удаления */}
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemove(item.id)}
            className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
          >
            <X className="w-3 h-3 text-white" />
          </button>

          {/* Drag handle */}
          <div className="absolute bottom-1 right-1 bg-black/40 rounded p-0.5">
            <GripVertical className="w-3 h-3 text-white" />
          </div>
        </div>
      ))}

      {/* Счётчик */}
      {items.length > 0 && (
        <div className="w-full flex justify-end">
          <span className="text-xs text-muted-foreground">
            {items.length}/{maxItems}
          </span>
        </div>
      )}
    </div>
  );
}
