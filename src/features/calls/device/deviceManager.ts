/**
 * Device Manager — handles local media device enumeration and selection.
 *
 * Responsible for:
 * - Enumerating cameras, microphones, speakers
 * - Selecting specific devices
 * - Managing device change events
 * - Handling permissions
 */

import { logger } from "@/lib/logger";

export type DeviceKind = "camera" | "microphone" | "speaker";

export interface MediaDevice {
  deviceId: string;
  kind: DeviceKind;
  label: string;
  groupId: string;
}

/**
 * Get all available media devices.
 */
export async function getMediaDevices(): Promise<MediaDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput" || d.kind === "audioinput" || d.kind === "audiooutput")
    .map((d) => ({
      deviceId: d.deviceId,
      kind: d.kind === "videoinput" ? "camera" : d.kind === "audioinput" ? "microphone" : "speaker",
      label: d.label || `${d.kind} (${d.deviceId.slice(0, 8)})`,
      groupId: d.groupId,
    }));
}

/**
 * Get default device ID for a given kind.
 */
export async function getDefaultDeviceId(kind: DeviceKind): Promise<string | null> {
  const devices = await getMediaDevices();
  const defaultDevice = devices.find((d) => d.kind === kind);
  return defaultDevice?.deviceId ?? null;
}

/**
 * Request media permissions and return whether granted.
 */
export async function requestMediaPermission(kind: "audio" | "video"): Promise<boolean> {
  try {
    const constraints: MediaStreamConstraints =
      kind === "audio"
        ? { audio: true, video: false }
        : { audio: false, video: true };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError") return false;
      if (error.name === "NotFoundError") return false;
    }
    logger.warn("[DeviceManager] Permission request failed", { error });
    return false;
  }
}

/**
 * Check if camera is available.
 */
export async function hasCamera(): Promise<boolean> {
  const devices = await getMediaDevices();
  return devices.some((d) => d.kind === "camera");
}

/**
 * Check if microphone is available.
 */
export async function hasMicrophone(): Promise<boolean> {
  const devices = await getMediaDevices();
  return devices.some((d) => d.kind === "microphone");
}

/**
 * Subscribe to device changes.
 */
export function onDeviceChange(callback: () => void): () => void {
  if (!navigator.mediaDevices?.addEventListener) {
    return () => {};
  }

  const handler = () => callback();
  navigator.mediaDevices.addEventListener("devicechange", handler);
  return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
}