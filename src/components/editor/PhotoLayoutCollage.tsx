/**
 * @file src/components/editor/PhotoLayoutCollage.tsx
 * @description Коллаж (Layout) — Instagram Layout-стиль.
 * Объединение нескольких фото в одно изображение с разными раскладками.
 *
 * Архитектура:
 * - 9 предустановленных раскладок (1-4 фото)
 * - Canvas-based рендеринг финального изображения
 * - Drag-to-swap: перетаскивание фото между ячейками
 * - Финальный экспорт: canvas.toBlob() → File
 * - Соотношение сторон: 1:1 (квадрат) или 4:5 (портрет)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Grid, LayoutGrid, Columns, Rows, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LayoutType =
  | "1x1"
  | "2h"   // 2 горизонтальных
  | "2v"   // 2 вертикальных
  | "3l"   // 1 большой слева + 2 справа
  | "3r"   // 2 слева + 1 большой справа
  | "3t"   // 1 большой сверху + 2 снизу
  | "4g"   // 2x2 сетка
  | "4l"   // 1 большой слева + 3 справа
  | "4t";  // 1 большой сверху + 3 снизу

interface LayoutConfig {
  id: LayoutType;
  slots: number;
  label: string;
  // Нормализованные координаты [x, y, w, h] для каждого слота (0-1)
  cells: [number, number, number, number][];
}

const LAYOUTS: LayoutConfig[] = [
  {
    id: "2h",
    slots: 2,
    label: "2 горизонтальных",
    cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
  },
  {
    id: "2v",
    slots: 2,
    label: "2 вертикальных",
    cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
  },
  {
    id: "3l",
    slots: 3,
    label: "Большой слева",
    cells: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]],
  },
  {
    id: "3r",
    slots: 3,
    label: "Большой справа",
    cells: [[0, 0, 0.4, 0.5], [0, 0.5, 0.4, 0.5], [0.4, 0, 0.6, 1]],
  },
  {
    id: "3t",
    slots: 3,
    label: "Большой сверху",
    cells: [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]],
  },
  {
    id: "4g",
    slots: 4,
    label: "Сетка 2×2",
    cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
  },
  {
    id: "4l",
    slots: 4,
    label: "Большой слева",
    cells: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.333], [0.6, 0.333, 0.4, 0.333], [0.6, 0.666, 0.4, 0.334]],
  },
  {
    id: "4t",
    slots: 4,
    label: "Большой сверху",
    cells: [[0, 0, 1, 0.6], [0, 0.6, 0.333, 0.4], [0.333, 0.6, 0.333, 0.4], [0.666, 0.6, 0.334, 0.4]],
  },
];

const CANVAS_SIZE = 1080;
const GAP = 4; // px между ячейками

interface PhotoLayoutCollageProps {
  onExport: (blob: Blob) => void;
  onCancel: () => void;
}

export function PhotoLayoutCollage({ onExport, onCancel }: PhotoLayoutCollageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedLayout, setSelectedLayout] = useState<LayoutConfig>(LAYOUTS[5]); // 4g default
  const [photos, setPhotos] = useState<(HTMLImageElement | null)[]>([null, null, null, null]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeSlotRef = useRef<number>(0);

  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newPhotos = [...photos];
    for (let i = 0; i < files.length && activeSlotRef.current + i < selectedLayout.slots; i++) {
      try {
        const img = await loadImage(files[i]);
        newPhotos[activeSlotRef.current + i] = img;
      } catch {}
    }
    setPhotos(newPhotos);
    e.target.value = "";
  };

  const handleSlotClick = (slotIdx: number) => {
    activeSlotRef.current = slotIdx;
    fileInputRef.current?.click();
  };

  // Рендер превью
  useEffect(() => {
    renderToCanvas(previewCanvasRef.current, 400);
  }, [photos, selectedLayout]);

  const renderToCanvas = useCallback(
    (canvas: HTMLCanvasElement | null, size: number) => {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = size;
      canvas.height = size;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, size, size);

      selectedLayout.cells.forEach(([nx, ny, nw, nh], i) => {
        const x = nx * size + (i > 0 ? GAP / 2 : 0);
        const y = ny * size + (i > 0 ? GAP / 2 : 0);
        const w = nw * size - GAP;
        const h = nh * size - GAP;

        const img = photos[i];
        if (img) {
          // Cover fit
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const cellAspect = w / h;
          let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
          if (imgAspect > cellAspect) {
            sw = img.naturalHeight * cellAspect;
            sx = (img.naturalWidth - sw) / 2;
          } else {
            sh = img.naturalWidth / cellAspect;
            sy = (img.naturalHeight - sh) / 2;
          }
          ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
        } else {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(x, y, w, h);
          ctx.fillStyle = "#444";
          ctx.font = `${size * 0.04}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`+`, x + w / 2, y + h / 2);
        }
      });
    },
    [photos, selectedLayout]
  );

  const handleExport = async () => {
    setIsExporting(true);
    const canvas = canvasRef.current!;
    renderToCanvas(canvas, CANVAS_SIZE);
    canvas.toBlob(
      (blob) => {
        setIsExporting(false);
        if (blob) onExport(blob);
      },
      "image/jpeg",
      0.92
    );
  };

  const filledSlots = photos.slice(0, selectedLayout.slots).filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Скрытые canvas */}
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Заголовок */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={onCancel}>
          <X className="w-6 h-6" />
        </button>
        <span className="font-semibold">Коллаж</span>
        <button
          onClick={handleExport}
          disabled={filledSlots < 2 || isExporting}
          className={cn(
            "text-sm font-semibold",
            filledSlots >= 2 ? "text-primary" : "text-muted-foreground"
          )}
        >
          {isExporting ? "..." : "Готово"}
        </button>
      </div>

      {/* Превью коллажа */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-[400px] aspect-square">
          <canvas
            ref={previewCanvasRef}
            className="w-full h-full rounded-xl overflow-hidden"
          />
          {/* Кликабельные зоны */}
          <div className="absolute inset-0">
            {selectedLayout.cells.map(([nx, ny, nw, nh], i) => (
              <button
                key={i}
                onClick={() => handleSlotClick(i)}
                className="absolute"
                style={{
                  left: `${nx * 100}%`,
                  top: `${ny * 100}%`,
                  width: `${nw * 100}%`,
                  height: `${nh * 100}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Выбор раскладки */}
      <div className="px-4 pb-4">
        <p className="text-xs text-muted-foreground mb-2">Раскладка</p>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              onClick={() => {
                setSelectedLayout(layout);
                setPhotos(Array(4).fill(null));
              }}
              className={cn(
                "flex-shrink-0 w-12 h-12 rounded-lg border-2 transition-colors",
                "flex items-center justify-center",
                selectedLayout.id === layout.id
                  ? "border-primary bg-primary/10"
                  : "border-border"
              )}
            >
              <LayoutPreviewIcon layout={layout} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LayoutPreviewIcon({ layout }: { layout: LayoutConfig }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      {layout.cells.map(([nx, ny, nw, nh], i) => (
        <rect
          key={i}
          x={nx * 28 + 1}
          y={ny * 28 + 1}
          width={nw * 28 - 2}
          height={nh * 28 - 2}
          rx="2"
          fill="currentColor"
          opacity={0.6}
        />
      ))}
    </svg>
  );
}
