import { Image, Upload, Video, CheckSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryMediaKind, GalleryPermissionState } from "./galleryTypes";

interface GalleryEntryButtonProps {
  thumbnailUrl?: string | null;
  mediaKind?: GalleryMediaKind | null;
  permission: GalleryPermissionState;
  disabled?: boolean;
  multiSelect?: boolean;
  selectedCount?: number;
  onClick: () => void;
}

export function GalleryEntryButton({ 
  thumbnailUrl, 
  mediaKind, 
  permission, 
  disabled, 
  multiSelect = false,
  selectedCount = 0,
  onClick 
}: GalleryEntryButtonProps) {
  const hasThumbnail = Boolean(thumbnailUrl);
  const isVideo = mediaKind === "video";
  const permissionLabel = permission === "denied"
    ? "Доступ к галерее запрещен"
    : permission === "limited"
      ? "Доступ к галерее ограничен"
      : permission === "unavailable"
        ? "Галерея недоступна"
        : multiSelect ? "Галерея (множественный выбор)" : "Галерея";

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-12 h-12 rounded-xl border-2 border-white/40 bg-white/10 backdrop-blur-sm flex items-center justify-center overflow-hidden transition-transform active:scale-95",
        disabled && "opacity-40 cursor-not-allowed",
        multiSelect && "ring-2 ring-primary"
      )}
      aria-label={permissionLabel}
      title={permissionLabel}
      disabled={disabled}
    >
      {hasThumbnail ? (
        <img src={thumbnailUrl ?? undefined} alt="Последнее выбранное медиа" className="h-full w-full object-cover" />
      ) : isVideo ? (
        <Video className="w-5 h-5 text-white" />
      ) : (
        <Upload className="w-5 h-5 text-white" />
      )}

      {multiSelect && (
        <div className="absolute top-0 left-0 w-full h-full bg-primary/20 flex items-center justify-center">
          <CheckSquare className="w-5 h-5 text-primary" />
        </div>
      )}

      {selectedCount > 0 && multiSelect && (
        <div className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
          {selectedCount}
        </div>
      )}

      {hasThumbnail && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" aria-hidden="true" />
      )}

      <div className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-tl-lg bg-black/70 text-white">
        {isVideo ? <Video className="h-3 w-3" /> : <Image className="h-3 w-3" />}
      </div>

      {permission === "limited" && (
        <span className="absolute left-1 top-1 h-2 w-2 rounded-full bg-amber-300" aria-label="Ограниченный доступ" />
      )}
      {permission === "denied" && (
        <span className="absolute left-1 top-1 h-2 w-2 rounded-full bg-red-400" aria-label="Доступ запрещен" />
      )}
      {permission === "unavailable" && (
        <span className="absolute left-1 top-1 h-2 w-2 rounded-full bg-zinc-300" aria-label="Галерея недоступна" />
      )}
    </button>
  );
}
