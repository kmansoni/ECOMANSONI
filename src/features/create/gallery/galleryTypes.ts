export type GalleryPermissionState = "unknown" | "granted" | "limited" | "denied" | "unavailable";

export type GalleryMediaKind = "image" | "video" | "mixed";

export type GalleryPickerMode = "single" | "multi";

export type GalleryPickerPlatform = "web-file-api" | "capacitor-camera";

export interface GalleryPickerStatus {
  permission: GalleryPermissionState;
  platform: GalleryPickerPlatform;
  lastThumbnailUrl?: string | null;
  lastMediaKind?: GalleryMediaKind | null;
}
