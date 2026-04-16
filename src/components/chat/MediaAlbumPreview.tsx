import { useState, useRef, useMemo } from "react";
import { X, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_ALBUM = 10;

interface MediaAlbumPreviewProps {
  files: File[];
  onRemove: (index: number) => void;
  onAddMore: () => void;
  onSend: (caption: string) => void;
  onCancel: () => void;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function MediaAlbumPreview({ files, onRemove, onAddMore, onSend, onCancel }: MediaAlbumPreviewProps) {
  const [caption, setCaption] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const previews = useMemo(() =>
    files.map((f) => ({
      url: URL.createObjectURL(f),
      isVideo: f.type.startsWith("video/"),
      name: f.name,
      size: formatSize(f.size),
    })),
    [files],
  );

  const handleAddMore = () => {
    if (files.length >= MAX_ALBUM) {
      toast.error(`Максимум ${MAX_ALBUM} файлов`);
      return;
    }
    onAddMore();
  };

  const handleSend = () => {
    onSend(caption.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <button
          onClick={onCancel}
          className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          aria-label="Отмена"
        >
          <X className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium">
          {files.length} {files.length === 1 ? "файл" : files.length < 5 ? "файла" : "файлов"}
        </span>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-2 max-w-lg mx-auto">
          {previews.map((p, idx) => (
            <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden bg-muted">
              {p.isVideo ? (
                <video
                  src={p.url}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
              ) : (
                <img loading="lazy" src={p.url} alt="" className="w-full h-full object-cover" />
              )}
              <button
                onClick={() => onRemove(idx)}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Удалить"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 px-1.5 py-0.5 bg-gradient-to-t from-black/50 to-transparent">
                <span className="text-[10px] text-white/80">{p.size}</span>
              </div>
            </div>
          ))}

          {files.length < MAX_ALBUM && (
            <button
              onClick={handleAddMore}
              className={cn(
                "aspect-square rounded-xl border-2 border-dashed border-muted-foreground/30",
                "flex flex-col items-center justify-center gap-1",
                "hover:border-primary/50 hover:bg-muted/50 transition-colors",
              )}
              aria-label="Добавить ещё"
            >
              <Plus className="w-6 h-6 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Ещё</span>
            </button>
          )}
        </div>
      </div>

      <div className="border-t px-4 py-3 flex items-end gap-2 safe-area-bottom">
        <textarea
          ref={textareaRef}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Добавить подпись..."
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-xl border bg-muted/50 px-3 py-2",
            "text-sm placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-1 focus:ring-primary",
            "max-h-24",
          )}
        />
        <Button
          size="icon"
          className="shrink-0 rounded-full min-h-[44px] min-w-[44px]"
          onClick={handleSend}
          aria-label="Отправить альбом"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
