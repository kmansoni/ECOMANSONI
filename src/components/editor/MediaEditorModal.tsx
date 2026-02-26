import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, X, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/hooks/useMediaEditor";

// Lazy load the SDK
let CreativeEditorSDK: any = null;

const CESDK_VERSION = "1.67.0";

interface MediaEditorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaFile: File | null;
  contentType: ContentType;
  aspectRatio?: number;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

// Aspect ratio presets
const ASPECT_RATIOS: Record<ContentType, { width: number; height: number; label: string }> = {
  post: { width: 1, height: 1, label: "1:1" },
  story: { width: 9, height: 16, label: "9:16" },
  reel: { width: 9, height: 16, label: "9:16" },
};

export function MediaEditorModal({
  open,
  onOpenChange,
  mediaFile,
  contentType,
  aspectRatio,
  onSave,
  onCancel,
}: MediaEditorModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorInstanceRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const isVideo = mediaFile?.type.startsWith("video/") ?? false;
  const preset = ASPECT_RATIOS[contentType];

  // Cleanup editor instance
  const cleanupEditor = useCallback(() => {
    if (editorInstanceRef.current) {
      try {
        editorInstanceRef.current.dispose();
      } catch (e) {
        console.warn("Error disposing editor:", e);
      }
      editorInstanceRef.current = null;
    }
  }, []);

  // Initialize CreativeEditor SDK
  useEffect(() => {
    if (!open || !mediaFile) return;

    let isMounted = true;
    let mediaUrl: string | null = null;

    const initEditor = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Ensure container is mounted and has size (Dialog portals can mount async)
        const container = containerRef.current;
        if (!container) {
          console.warn("[CESDK] containerRef is null (mount timing)");
          return;
        }

        const license = import.meta.env.VITE_IMGLY_LICENSE_KEY || "";
        console.log("[CESDK] init", {
          hasLicense: Boolean(license),
          contentType,
          isVideo,
          containerRect: container.getBoundingClientRect(),
        });

        // CE.SDK requires a non-zero sized container to render reliably
        const rect = container.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) {
          console.warn("[CESDK] container has zero size, retrying next frame", rect);
          await new Promise<void>((r) => requestAnimationFrame(() => r()));
        }

        // Dynamically import SDK
        if (!CreativeEditorSDK) {
          const module = await import("@cesdk/cesdk-js");
          CreativeEditorSDK = module.default;
        }

        if (!isMounted || !containerRef.current) return;

        // Create object URL for the media file
        mediaUrl = URL.createObjectURL(mediaFile);

        // Initialize the editor
        const config = {
          // License key - use environment variable or empty for trial
          license,
          
          // Locale
          locale: "ru",
          
          // Base URL for assets must match installed SDK version
          baseURL: `https://cdn.img.ly/packages/imgly/cesdk-js/${CESDK_VERSION}/assets`,
          
          // Theme
          theme: "dark",
          
          // UI configuration
          ui: {
            elements: {
              view: "default",
              panels: {
                inspector: {
                  show: true,
                },
                settings: {
                  show: true,
                },
              },
              dock: {
                iconSize: "large",
                hideLabels: false,
              },
              navigation: {
                show: true,
                action: {
                  export: true,
                },
              },
            },
          },
          
          // Callbacks
          callbacks: {
            onExport: async (blobs: Blob[]) => {
              if (blobs.length > 0 && isMounted) {
                onSave(blobs[0]);
              }
            },
            onUpload: "local",
          },
        };

        const editor = await CreativeEditorSDK.create(containerRef.current, config);
        
        if (!isMounted) {
          editor.dispose();
          URL.revokeObjectURL(mediaUrl);
          return;
        }

        editorInstanceRef.current = editor;

        // Register built-in + demo assets. Without this the UI can look empty.
        try {
          await editor.addDefaultAssetSources();
          await editor.addDemoAssetSources({ sceneMode: isVideo ? "Video" : "Design" });
        } catch (e) {
          console.warn("[CESDK] add asset sources failed", e);
        }

        // Load the appropriate scene based on media type
        const engine = editor.engine;
        
        if (isVideo) {
          // For video, use video scene
          await editor.createVideoScene();
        } else {
          // For images, create a design scene
          await editor.createDesignScene();
        }

        // Set the page/scene dimensions based on content type
        const scene = engine.scene.get();
        if (scene) {
          const pages = engine.scene.getPages();
          if (pages.length > 0) {
            const page = pages[0];
            
            // Set aspect ratio
            const targetWidth = 1080;
            const targetHeight = Math.round(targetWidth * (preset.height / preset.width));
            
            engine.block.setWidth(page, targetWidth);
            engine.block.setHeight(page, targetHeight);
          }
        }

        // Add the user's media as a fill
        const pages = engine.scene.getPages();
        if (pages.length > 0) {
          const page = pages[0];
          
          if (isVideo) {
            // Add video block
            const videoBlock = engine.block.create("//ly.img.ubq/video");
            engine.block.setString(videoBlock, "fill/video/fileURI", mediaUrl);
            engine.block.appendChild(page, videoBlock);
            
            // Fit to page
            const pageWidth = engine.block.getWidth(page);
            const pageHeight = engine.block.getHeight(page);
            engine.block.setWidth(videoBlock, pageWidth);
            engine.block.setHeight(videoBlock, pageHeight);
            engine.block.setPositionX(videoBlock, 0);
            engine.block.setPositionY(videoBlock, 0);
          } else {
            // Add image block
            const imageBlock = engine.block.create("//ly.img.ubq/image");
            engine.block.setString(imageBlock, "fill/image/imageFileURI", mediaUrl);
            engine.block.appendChild(page, imageBlock);
            
            // Fit to page
            const pageWidth = engine.block.getWidth(page);
            const pageHeight = engine.block.getHeight(page);
            engine.block.setWidth(imageBlock, pageWidth);
            engine.block.setHeight(imageBlock, pageHeight);
            engine.block.setPositionX(imageBlock, 0);
            engine.block.setPositionY(imageBlock, 0);
          }
        }

        setIsLoading(false);
      } catch (err: any) {
        console.error("Error initializing CreativeEditor:", err);
        if (isMounted) {
          setError(
            err?.message ||
              "Не удалось загрузить редактор (проверьте license/baseURL и CSS импорты)"
          );
          setIsLoading(false);
        }
      }
    };

    initEditor();

    return () => {
      isMounted = false;
      cleanupEditor();
      if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    };
  }, [open, mediaFile, contentType, isVideo, preset, onSave, cleanupEditor]);

  // Handle export
  const handleExport = async () => {
    if (!editorInstanceRef.current) return;

    setIsExporting(true);

    try {
      const engine = editorInstanceRef.current.engine;
      const pages = engine.scene.getPages();
      
      if (pages.length === 0) {
        throw new Error("No pages to export");
      }

      const page = pages[0];
      
      if (isVideo) {
        // Export video
        const mimeType = "video/mp4";
        const blob = await engine.block.export(page, mimeType);
        onSave(blob);
      } else {
        // Export image
        const mimeType = "image/jpeg";
        const options = {
          jpegQuality: 0.92,
        };
        const blob = await engine.block.export(page, mimeType, options);
        onSave(blob);
      }
    } catch (err: any) {
      console.error("Export error:", err);
      setError("Ошибка экспорта: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle close
  const handleClose = () => {
    cleanupEditor();
    onCancel();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent 
        className={cn(
          "max-w-full h-[100dvh] p-0 gap-0 bg-background border-0 rounded-none",
          "sm:max-w-[95vw] sm:h-[90vh] sm:rounded-lg sm:border"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="shrink-0"
          >
            <X className="w-5 h-5" />
          </Button>
          
          <span className="font-semibold text-foreground">
            {contentType === "post" && "Редактор публикации"}
            {contentType === "story" && "Редактор истории"}
            {contentType === "reel" && "Редактор Reel"}
          </span>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExport}
            disabled={isLoading || isExporting || !!error}
            className="shrink-0"
          >
            {isExporting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Check className="w-5 h-5 text-primary" />
            )}
          </Button>
        </div>

        {/* Editor Container */}
        <div className="flex-1 relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10">
              <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">Загрузка редактора...</p>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10 p-6">
              <div className="text-center max-w-md">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="font-semibold text-lg mb-2">Ошибка загрузки</h3>
                <p className="text-muted-foreground mb-4">{error}</p>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={handleClose}>
                    Отмена
                  </Button>
                  <Button onClick={() => window.location.reload()}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Перезагрузить
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className={cn(
              "w-full h-full",
              // Important: allow CE.SDK to own pointer/touch gestures inside the editor
              "touch-none"
            )}
            style={{
              // Keep it mounted even during loading so create() has a real DOM node
              opacity: isLoading || error ? 0 : 1,
              pointerEvents: isLoading || error ? "none" : "auto",
              minHeight: "400px",
            }}
          />
        </div>

        {/* Footer with action buttons */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-card safe-area-bottom">
          <Button variant="outline" onClick={handleClose}>
            Отмена
          </Button>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Формат: {preset.label}</span>
          </div>
          
          <Button 
            onClick={handleExport}
            disabled={isLoading || isExporting || !!error}
          >
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
