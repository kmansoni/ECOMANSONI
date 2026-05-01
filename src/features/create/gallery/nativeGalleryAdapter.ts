import { logger } from "@/lib/logger";
import type { GalleryPermissionState } from "./galleryTypes";

export type NativeGalleryPickResult = {
  file?: File;
  previewUrl?: string;
  permission: GalleryPermissionState;
};

type CapacitorPhotoPermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied" | "limited";

function mapNativePhotoPermission(state: CapacitorPhotoPermissionState | undefined): GalleryPermissionState {
  if (state === "granted") return "granted";
  if (state === "limited") return "limited";
  if (state === "denied") return "denied";
  return "unknown";
}

export async function isNativeGalleryAvailable(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch (error) {
    logger.warn("[create:gallery] Capacitor недоступен", { error });
    return false;
  }
}

export async function pickNativeGalleryMedia(): Promise<NativeGalleryPickResult | null> {
  const { Camera } = await import("@capacitor/camera");

  const permissionResult = await Camera.requestPermissions({ permissions: ["photos"] });
  const permission = mapNativePhotoPermission(permissionResult.photos as CapacitorPhotoPermissionState | undefined);
  if (permission === "denied") {
    return { permission };
  }

  const result = await Camera.pickImages({
    quality: 95,
    limit: 1,
  });

  const photo = result.photos[0];
  const sourceUrl = photo?.webPath;
  if (!sourceUrl) return { permission };

  const response = await fetch(sourceUrl);
  const blob = await response.blob();
  const extension = photo.format || blob.type.split("/")[1] || "jpg";
  const file = new File([blob], `gallery-${Date.now()}.${extension}`, {
    type: blob.type || `image/${extension}`,
  });

  return {
    file,
    previewUrl: URL.createObjectURL(blob),
    permission,
  };
}
