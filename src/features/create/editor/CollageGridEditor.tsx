import { useState, useRef, useCallback, useEffect } from "react";

export type LayoutType = "1x1" | "2h" | "2v" | "3l" | "3r" | "3t" | "4g" | "4l" | "4t";

interface LayoutConfig {
  id: LayoutType;
  slots: number;
  label: string;
  cells: [number, number, number, number][];
}

const LAYOUTS: LayoutConfig[] = [
  { id: "2h", slots: 2, label: "2 horizontal", cells: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]] },
  { id: "2v", slots: 2, label: "2 vertical", cells: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] },
  { id: "3l", slots: 3, label: "Left large", cells: [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]] },
  { id: "3r", slots: 3, label: "Right large", cells: [[0, 0, 0.4, 0.5], [0, 0.5, 0.4, 0.5], [0.4, 0, 0.6, 1]] },
  { id: "3t", slots: 3, label: "Top large", cells: [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]] },
  { id: "4g", slots: 4, label: "2x2 grid", cells: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]] },
];

const CANVAS_SIZE = 1080;

interface CollageGridEditorProps {
  onExport: (blob: Blob) => void;
  onCancel: () => void;
}

interface FrameData {
  id: string;
  imageUrl: string;
  transform: { x: number; y: number; scale: number; rotation: number };
}

export function CollageGridEditor({ onExport, onCancel }: CollageGridEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedLayout, setSelectedLayout] = useState<LayoutConfig>(LAYOUTS[0]);
  const [frames, setFrames] = useState<FrameData[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (files.length === 0 || activeSlot === null) return;

    try {
      const img = await loadImage(files[0]);
      const newFrame: FrameData = {
        id: `frame-${activeSlot}`,
        imageUrl: img.src,
        transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      };
      
      setFrames(prev => {
        const next = [...prev];
        next[activeSlot] = newFrame;
        return next;
      });
    } catch {
      // Skip unreadable image
    }
    
    e.target.value = "";
  };

  const updateFrameTransform = useCallback((slotId: number, transform: FrameData["transform"]) => {
    setFrames(prev => {
      const next = [...prev];
      if (next[slotId]) {
        next[slotId] = { ...next[slotId], transform };
      }
      return next;
    });
  }, []);

  const renderToCanvas = useCallback((canvas: HTMLCanvasElement | null, size: number) => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);

    selectedLayout.cells.forEach(([nx, ny, nw, nh], i) => {
      const x = nx * size;
      const y = ny * size;
      const w = nw * size;
      const h = nh * size;

      const frame = frames[i];
      if (frame) {
        const img = new Image();
        img.src = frame.imageUrl;
        const { scale, rotation } = frame.transform;
        
        ctx.save();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(scale, scale);
        
        if (img.complete) {
          const imgAspect = img.naturalWidth / img.naturalHeight;
          const cellAspect = w / h;
          let drawW = w;
          let drawH = h;
          
          if (imgAspect > cellAspect) {
            drawH = w / imgAspect;
          } else {
            drawW = h * imgAspect;
          }
          
          ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
        }
        ctx.restore();
      } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#444";
        ctx.font = `${size * 0.04}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("+", x + w / 2, y + h / 2);
      }
    });
  }, [frames, selectedLayout]);

  useEffect(() => {
    renderToCanvas(canvasRef.current, 400);
  }, [renderToCanvas, frames, selectedLayout]);

  const handleExport = async () => {
    setIsExporting(true);
    const canvas = canvasRef.current!;
    renderToCanvas(canvas, CANVAS_SIZE);
    
    canvas.toBlob((blob) => {
      setIsExporting(false);
      if (blob) onExport(blob);
    }, "image/jpeg", 0.92);
  };

  const filledSlots = frames.filter(Boolean).length;

  return (
    <div className="flex flex-col h-full bg-background">
      <canvas ref={canvasRef} className="hidden" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button onClick={onCancel}>✕</button>
        <span className="font-semibold">Collage</span>
        <button onClick={handleExport} disabled={filledSlots < 2 || isExporting} className="text-sm font-semibold text-primary">
          {isExporting ? "..." : "Done"}
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-[400px] aspect-square bg-muted rounded-lg overflow-hidden">
          {selectedLayout.cells.map(([nx, ny, nw, nh], i) => (
            <button
              key={i}
              onClick={() => {
                setActiveSlot(i);
                fileInputRef.current?.click();
              }}
              className="absolute border-2 border-dashed border-transparent hover:border-primary transition-colors"
              style={{
                left: `${nx * 100}%`,
                top: `${ny * 100}%`,
                width: `${nw * 100}%`,
                height: `${nh * 100}%`,
              }}
            >
              {frames[i] && (
                <img
                  src={frames[i].imageUrl}
                  alt={`Frame ${i}`}
                  className="w-full h-full object-cover"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4">
        <p className="text-xs text-muted-foreground mb-2">Layout</p>
        <div className="flex gap-2 overflow-x-auto">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              onClick={() => {
                setSelectedLayout(layout);
                setFrames([]);
              }}
              className={`flex-shrink-0 px-3 py-1 text-xs rounded ${
                selectedLayout.id === layout.id ? "bg-primary text-primary-foreground" : "bg-muted"
              }`}
            >
              {layout.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}