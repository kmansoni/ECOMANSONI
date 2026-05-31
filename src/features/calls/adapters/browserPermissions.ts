/**
 * Browser Permissions Adapter — implements CallPermissionsPort.
 *
 * Handles:
 * - Media permission requests
 * - Device enumeration
 * - Permission state checks
 */

import { logger } from "@/lib/logger";
import type { CallPermissionsPort } from "../runtime/ports";

export class BrowserPermissionsAdapter implements CallPermissionsPort {
  async requestMediaPermissions(kind: "audio" | "video"): Promise<boolean> {
    try {
      const constraints: MediaStreamConstraints =
        kind === "audio" ? { audio: true } : { video: true };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError") {
          logger.info("[Permissions] Access denied", { kind });
          return false;
        }
        if (error.name === "NotFoundError") {
          logger.info("[Permissions] Device not found", { kind });
          return false;
        }
      }
      logger.warn("[Permissions] Request failed", { kind, error });
      return false;
    }
  }

  async hasMediaPermissions(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async enumerateDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    return navigator.mediaDevices.enumerateDevices();
  }

  selectDevice(kind: "camera" | "microphone", deviceId: string): void {
    // Device selection is handled via constraints when acquiring stream
    logger.debug("[Permissions] Device selected", { kind, deviceId });
  }
}

// Singleton for app-wide use
export const browserPermissions = new BrowserPermissionsAdapter();