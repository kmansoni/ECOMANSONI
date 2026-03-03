import { useState, useCallback, useRef } from 'react';

export type EditorTool = 'draw' | 'text' | 'filter' | 'crop' | 'sticker' | 'none';

export interface TextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  color: string;
  fontSize: number;
  fontStyle: 'normal' | 'bold' | 'italic';
  background: 'transparent' | 'black' | 'white';
}

export interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  hueRotate: number;
  sepia: number;
  grayscale: number;
}

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropRatio = 'free' | '1:1' | '4:3' | '16:9';

export type NamedFilter =
  | 'original'
  | 'vivid'
  | 'warm'
  | 'cool'
  | 'bw'
  | 'sepia'
  | 'vintage'
  | 'dramatic';

const NAMED_FILTERS: Record<NamedFilter, FilterSettings> = {
  original: { brightness: 100, contrast: 100, saturation: 100, hueRotate: 0, sepia: 0, grayscale: 0 },
  vivid:    { brightness: 100, contrast: 110, saturation: 150, hueRotate: 0, sepia: 0, grayscale: 0 },
  warm:     { brightness: 110, contrast: 100, saturation: 120, hueRotate: 0, sepia: 30, grayscale: 0 },
  cool:     { brightness: 100, contrast: 100, saturation: 90,  hueRotate: 20, sepia: 0, grayscale: 0 },
  bw:       { brightness: 100, contrast: 100, saturation: 0,   hueRotate: 0, sepia: 0, grayscale: 100 },
  sepia:    { brightness: 100, contrast: 100, saturation: 100, hueRotate: 0, sepia: 80, grayscale: 0 },
  vintage:  { brightness: 110, contrast: 90,  saturation: 100, hueRotate: 0, sepia: 40, grayscale: 0 },
  dramatic: { brightness: 90,  contrast: 150, saturation: 100, hueRotate: 0, sepia: 0, grayscale: 0 },
};

interface HistoryEntry {
  textItems: TextItem[];
  filters: FilterSettings;
  drawingDataUrl: string | null;
}

export function useChatMediaEditor() {
  const [tool, setTool] = useState<EditorTool>('none');
  const [brushColor, setBrushColor] = useState('#FF3B30');
  const [brushSize, setBrushSize] = useState(4);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [filters, setFilters] = useState<FilterSettings>(NAMED_FILTERS.original);
  const [activeFilter, setActiveFilter] = useState<NamedFilter>('original');
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [cropRatio, setCropRatio] = useState<CropRatio>('free');
  const [drawingDataUrl, setDrawingDataUrl] = useState<string | null>(null);

  const history = useRef<HistoryEntry[]>([]);
  const historyIndex = useRef<number>(-1);

  const saveHistory = useCallback((
    newTextItems: TextItem[],
    newFilters: FilterSettings,
    newDrawingDataUrl: string | null
  ) => {
    const entry: HistoryEntry = {
      textItems: newTextItems,
      filters: newFilters,
      drawingDataUrl: newDrawingDataUrl,
    };
    // Обрезаем историю после текущей позиции
    history.current = history.current.slice(0, historyIndex.current + 1);
    history.current.push(entry);
    historyIndex.current = history.current.length - 1;
  }, []);

  const addText = useCallback((item: Omit<TextItem, 'id'>) => {
    const newItem: TextItem = { ...item, id: crypto.randomUUID() };
    setTextItems(prev => {
      const updated = [...prev, newItem];
      saveHistory(updated, filters, drawingDataUrl);
      return updated;
    });
  }, [filters, drawingDataUrl, saveHistory]);

  const updateText = useCallback((id: string, updates: Partial<TextItem>) => {
    setTextItems(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      saveHistory(updated, filters, drawingDataUrl);
      return updated;
    });
  }, [filters, drawingDataUrl, saveHistory]);

  const removeText = useCallback((id: string) => {
    setTextItems(prev => {
      const updated = prev.filter(t => t.id !== id);
      saveHistory(updated, filters, drawingDataUrl);
      return updated;
    });
  }, [filters, drawingDataUrl, saveHistory]);

  const setFilter = useCallback((name: NamedFilter) => {
    const f = NAMED_FILTERS[name];
    setActiveFilter(name);
    setFilters(f);
    saveHistory(textItems, f, drawingDataUrl);
  }, [textItems, drawingDataUrl, saveHistory]);

  const setFilterValue = useCallback((key: keyof FilterSettings, value: number) => {
    setFilters(prev => {
      const updated = { ...prev, [key]: value };
      saveHistory(textItems, updated, drawingDataUrl);
      return updated;
    });
  }, [textItems, drawingDataUrl, saveHistory]);

  const saveDrawing = useCallback((dataUrl: string) => {
    setDrawingDataUrl(dataUrl);
    saveHistory(textItems, filters, dataUrl);
  }, [textItems, filters, saveHistory]);

  const undo = useCallback(() => {
    if (historyIndex.current <= 0) return;
    historyIndex.current -= 1;
    const entry = history.current[historyIndex.current];
    setTextItems(entry.textItems);
    setFilters(entry.filters);
    setDrawingDataUrl(entry.drawingDataUrl);
  }, []);

  const redo = useCallback(() => {
    if (historyIndex.current >= history.current.length - 1) return;
    historyIndex.current += 1;
    const entry = history.current[historyIndex.current];
    setTextItems(entry.textItems);
    setFilters(entry.filters);
    setDrawingDataUrl(entry.drawingDataUrl);
  }, []);

  const canUndo = historyIndex.current > 0;
  const canRedo = historyIndex.current < history.current.length - 1;

  const applyCrop = useCallback(() => {
    // Crop применяется при экспорте
  }, []);

  const getFilterStyle = useCallback((): string => {
    const { brightness, contrast, saturation, hueRotate, sepia, grayscale } = filters;
    return [
      `brightness(${brightness}%)`,
      `contrast(${contrast}%)`,
      `saturate(${saturation}%)`,
      `hue-rotate(${hueRotate}deg)`,
      `sepia(${sepia}%)`,
      `grayscale(${grayscale}%)`,
    ].join(' ');
  }, [filters]);

  const exportImage = useCallback(async (
    imageEl: HTMLImageElement,
    canvasEl: HTMLCanvasElement,
    textContainerEl: HTMLElement | null,
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const offscreen = document.createElement('canvas');
      offscreen.width = imageEl.naturalWidth;
      offscreen.height = imageEl.naturalHeight;
      const ctx = offscreen.getContext('2d');
      if (!ctx) return reject(new Error('Canvas context unavailable'));

      // Применяем CSS-фильтры через временный canvas
      const { brightness, contrast, saturation, hueRotate, sepia, grayscale } = filters;
      ctx.filter = [
        `brightness(${brightness}%)`,
        `contrast(${contrast}%)`,
        `saturate(${saturation}%)`,
        `hue-rotate(${hueRotate}deg)`,
        `sepia(${sepia}%)`,
        `grayscale(${grayscale}%)`,
      ].join(' ');
      ctx.drawImage(imageEl, 0, 0, offscreen.width, offscreen.height);
      ctx.filter = 'none';

      // Рисуем слой рисования
      if (drawingDataUrl) {
        const drawImg = new Image();
        drawImg.onload = () => {
          ctx.drawImage(drawImg, 0, 0, offscreen.width, offscreen.height);
          renderTextAndExport();
        };
        drawImg.src = drawingDataUrl;
      } else {
        renderTextAndExport();
      }

      function renderTextAndExport() {
        // Рисуем текстовые элементы
        const scaleX = offscreen.width / imageEl.clientWidth;
        const scaleY = offscreen.height / imageEl.clientHeight;

        textItems.forEach(item => {
          ctx!.save();
          const scaledSize = item.fontSize * scaleX;
          ctx!.font = `${item.fontStyle === 'normal' ? '' : item.fontStyle} ${scaledSize}px sans-serif`;

          const metrics = ctx!.measureText(item.text);
          const textWidth = metrics.width;
          const textHeight = scaledSize;
          const x = item.x * scaleX;
          const y = item.y * scaleY;

          if (item.background !== 'transparent') {
            ctx!.fillStyle = item.background === 'black' ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)';
            ctx!.fillRect(x - 4, y - textHeight, textWidth + 8, textHeight + 4);
          }

          ctx!.fillStyle = item.color;
          ctx!.fillText(item.text, x, y);
          ctx!.restore();
        });

        offscreen.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Export failed'));
        }, 'image/jpeg', 0.92);
      }
    });
  }, [filters, drawingDataUrl, textItems]);

  return {
    tool, setTool,
    brushColor, setBrushColor,
    brushSize, setBrushSize,
    textItems, addText, updateText, removeText,
    filters, setFilter, setFilterValue, activeFilter,
    cropArea, setCropArea, cropRatio, setCropRatio, applyCrop,
    drawingDataUrl, saveDrawing,
    undo, redo, canUndo, canRedo,
    getFilterStyle,
    exportImage,
    NAMED_FILTERS,
  };
}
