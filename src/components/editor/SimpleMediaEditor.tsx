import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { 
  X, Check, RotateCw, FlipHorizontal, FlipVertical,
  Sun, Contrast, Droplets, Sparkles, Crop,
  Type, Sticker, Palette, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/hooks/useMediaEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface SimpleMediaEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaFile: File | null;
  contentType: ContentType;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

// Aspect ratio presets
const ASPECT_RATIOS: Record<ContentType, number> = {
  post: 1,        // 1:1
  story: 9 / 16,  // 9:16
  reel: 9 / 16,   // 9:16
};

// Filter presets
const FILTERS = [
  { id: "none", name: "Оригинал", filter: "" },
  { id: "warm", name: "Тёплый", filter: "sepia(0.2) saturate(1.2)" },
  { id: "cool", name: "Холодный", filter: "hue-rotate(180deg) saturate(0.8)" },
  { id: "vintage", name: "Ретро", filter: "sepia(0.4) contrast(1.1)" },
  { id: "bw", name: "Ч/Б", filter: "grayscale(1)" },
  { id: "vibrant", name: "Яркий", filter: "saturate(1.5) contrast(1.1)" },
  { id: "fade", name: "Выгоревший", filter: "contrast(0.9) brightness(1.1) saturate(0.8)" },
  { id: "drama", name: "Драма", filter: "contrast(1.3) saturate(0.9)" },
];

export function SimpleMediaEditor({
  open,
  onOpenChange,
  mediaFile,
  contentType,
  onSave,
  onCancel,
}: SimpleMediaEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activeTab, setActiveTab] = useState("adjust");
  
  // Adjustments
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("none");

  // Preview URL
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const isVideo = mediaFile?.type.startsWith("video/") ?? false;

  // Load media
  useEffect(() => {
    if (!open || !mediaFile) return;

    // Reset state when opening with new file
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setSelectedFilter("none");
    setIsLoading(true);

    if (isVideo) {
      // For video, just show preview - advanced editing needs SDK
      const url = URL.createObjectURL(mediaFile);
      setPreviewUrl(url);
      setIsLoading(false);
      return () => URL.revokeObjectURL(url);
    }

    // Load image
    const img = new Image();
    img.crossOrigin = "anonymous"; // Allow cross-origin images
    const url = URL.createObjectURL(mediaFile);
    
    img.onload = () => {
      imageRef.current = img;
      setPreviewUrl(url);
      setIsLoading(false);
    };
    
    img.onerror = (e) => {
      console.error("Error loading image:", e);
      setIsLoading(false);
    };
    
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, mediaFile, isVideo]);

  // Render canvas with adjustments
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Calculate dimensions based on aspect ratio
    const aspectRatio = ASPECT_RATIOS[contentType];
    const containerWidth = Math.min(window.innerWidth - 32, 400);
    const containerHeight = containerWidth / aspectRatio;

    canvas.width = containerWidth * 2; // 2x for retina
    canvas.height = containerHeight * 2;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply transforms
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

    // Apply filters
    const filter = FILTERS.find(f => f.id === selectedFilter);
    let filterString = filter?.filter || "";
    filterString += ` brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.filter = filterString.trim();

    // Draw image (cover mode)
    const imgAspect = img.width / img.height;
    const canvasAspect = canvas.width / canvas.height;
    
    let drawWidth: number;
    let drawHeight: number;
    
    if (imgAspect > canvasAspect) {
      drawHeight = canvas.height;
      drawWidth = drawHeight * imgAspect;
    } else {
      drawWidth = canvas.width;
      drawHeight = drawWidth / imgAspect;
    }

    ctx.drawImage(
      img,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    );

    ctx.restore();
  }, [brightness, contrast, saturation, rotation, flipX, flipY, selectedFilter, contentType]);

  // Re-render when adjustments change or image loads
  useEffect(() => {
    if (!isVideo && imageRef.current && !isLoading) {
      // Use requestAnimationFrame to ensure canvas is in DOM
      requestAnimationFrame(() => {
        renderCanvas();
      });
    }
  }, [renderCanvas, isVideo, isLoading]);

  // Reset adjustments
  const handleReset = () => {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setSelectedFilter("none");
  };

  // Export
  const handleExport = async () => {
    if (isVideo && mediaFile) {
      // For video, just pass through the original file
      onSave(mediaFile);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsExporting(true);

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to export"));
          },
          "image/jpeg",
          0.92
        );
      });

      onSave(blob);
    } catch (error) {
      console.error("Export error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      onOpenChange(true);
      return;
    }

    handleReset();
    onCancel();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent 
        className={cn(
          "max-w-full h-[100dvh] p-0 gap-0 bg-background border-0 rounded-none",
          "sm:max-w-lg sm:h-auto sm:max-h-[90vh] sm:rounded-lg sm:border"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <Button variant="ghost" size="icon" onClick={() => handleDialogOpenChange(false)}>
            <X className="w-5 h-5" />
          </Button>
          
          <div className="flex flex-col items-center">
            <DialogTitle className="font-semibold">Редактор</DialogTitle>
            <DialogDescription className="sr-only">
              Инструменты редактирования медиа для публикации.
            </DialogDescription>
          </div>
          
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleExport}
            disabled={isLoading || isExporting}
          >
            {isExporting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-5 h-5 text-primary" />
            )}
          </Button>
        </div>

        {/* Preview */}
        <div className="flex-1 flex items-center justify-center p-4 bg-muted/30 overflow-hidden">
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Загрузка...</span>
            </div>
          ) : isVideo ? (
            <video 
              src={previewUrl || undefined}
              controls
              className="max-w-full max-h-[40vh] rounded-lg"
            />
          ) : (
            <canvas
              ref={canvasRef}
              className="rounded-lg shadow-lg"
            />
          )}
        </div>

        {/* Tools */}
        {!isVideo && (
          <div className="border-t border-border bg-card">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-12 px-2">
                <TabsTrigger value="adjust" className="gap-2 data-[state=active]:bg-muted">
                  <Sun className="w-4 h-4" />
                  Настройки
                </TabsTrigger>
                <TabsTrigger value="filters" className="gap-2 data-[state=active]:bg-muted">
                  <Palette className="w-4 h-4" />
                  Фильтры
                </TabsTrigger>
                <TabsTrigger value="transform" className="gap-2 data-[state=active]:bg-muted">
                  <Crop className="w-4 h-4" />
                  Трансформ
                </TabsTrigger>
              </TabsList>

              <TabsContent value="adjust" className="p-4 space-y-4 m-0">
                {/* Brightness */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Sun className="w-4 h-4" />
                      Яркость
                    </div>
                    <span className="text-sm text-muted-foreground">{brightness}%</span>
                  </div>
                  <Slider
                    value={[brightness]}
                    onValueChange={([v]) => setBrightness(v)}
                    min={50}
                    max={150}
                    step={1}
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Contrast className="w-4 h-4" />
                      Контраст
                    </div>
                    <span className="text-sm text-muted-foreground">{contrast}%</span>
                  </div>
                  <Slider
                    value={[contrast]}
                    onValueChange={([v]) => setContrast(v)}
                    min={50}
                    max={150}
                    step={1}
                  />
                </div>

                {/* Saturation */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <Droplets className="w-4 h-4" />
                      Насыщенность
                    </div>
                    <span className="text-sm text-muted-foreground">{saturation}%</span>
                  </div>
                  <Slider
                    value={[saturation]}
                    onValueChange={([v]) => setSaturation(v)}
                    min={0}
                    max={200}
                    step={1}
                  />
                </div>
              </TabsContent>

              <TabsContent value="filters" className="p-4 m-0">
                <div className="grid grid-cols-4 gap-2">
                  {FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      onClick={() => setSelectedFilter(filter.id)}
                      className={cn(
                        "aspect-square rounded-lg border-2 p-1 transition-all",
                        selectedFilter === filter.id
                          ? "border-primary"
                          : "border-transparent hover:border-muted-foreground/30"
                      )}
                    >
                      <div 
                        className="w-full h-full rounded bg-muted flex items-center justify-center"
                        style={{ filter: filter.filter || undefined }}
                      >
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1 block">
                        {filter.name}
                      </span>
                    </button>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="transform" className="p-4 m-0">
                <div className="flex items-center justify-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    className="h-12 w-12"
                  >
                    <RotateCw className="w-5 h-5" />
                  </Button>
                  <Button
                    variant={flipX ? "default" : "outline"}
                    size="icon"
                    onClick={() => setFlipX(!flipX)}
                    className="h-12 w-12"
                  >
                    <FlipHorizontal className="w-5 h-5" />
                  </Button>
                  <Button
                    variant={flipY ? "default" : "outline"}
                    size="icon"
                    onClick={() => setFlipY(!flipY)}
                    className="h-12 w-12"
                  >
                    <FlipVertical className="w-5 h-5" />
                  </Button>
                </div>

                <div className="text-center mt-4">
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    Сбросить всё
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border safe-area-bottom">
          <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleExport} disabled={isLoading || isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Экспорт...
              </>
            ) : (
              "Применить"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
