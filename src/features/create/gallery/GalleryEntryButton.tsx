import { Image, Upload, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GalleryMediaKind, GalleryPermissionState } from "./galleryTypes";

interface GalleryEntryButtonProps {
  thumbnailUrl?: string | null;
  mediaKind?: GalleryMediaKind | null;
  permission: GalleryPermissionState;
  disabled?: boolean;
  onClick: () => void;
}

export function GalleryEntryButton({ thumbnailUrl, mediaKind, permission, disabled, onClick }: GalleryEntryButtonProps) {
  const hasThumbnail = Boolean(thumbnailUrl);
  const isVideo = mediaKind === "video";
  const permissionLabel = permission === "denied"
    ? "Доступ к галерее запрещен"
    : permission === "limited"
      ? "Доступ к галерее ограничен"
      : permission === "unavailable"
        ? "Галерея недоступна"
        : "Галерея";

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-12 h-12 rounded-xl border-2 border-white/40 bg-white/10 backdrop-blur-sm flex items-center justify-center overflow-hidden transition-transform active:scale-95",
        disabled && "opacity-40 cursor-not-allowed",
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
