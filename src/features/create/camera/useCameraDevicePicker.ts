import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";

export type CameraDevice = {
  deviceId: string;
  label: string;
  kind: "videoinput";
};

export type CameraPermissionState = "prompt" | "granted" | "denied" | "unavailable";

export interface UseCameraDevicePickerReturn {
  devices: CameraDevice[];
  selectedDeviceId: string | null;
  permission: CameraPermissionState;
  error: string | null;
  selectDevice: (deviceId: string | null) => void;
  refreshDevices: () => Promise<void>;
  hasMultipleCameras: boolean;
}

export function useCameraDevicePicker(): UseCameraDevicePickerReturn {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState>("prompt");
  const [error, setError] = useState<string | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      setError(null);
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      
      setPermission("granted");
      
      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = mediaDevices
        .filter((d): d is MediaDeviceInfo & { deviceId: string; label: string } => 
          d.kind === "videoinput" && typeof d.deviceId === "string"
        )
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
          kind: "videoinput" as const,
        }));
      
      setDevices(videoDevices);
      
      if (videoDevices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(videoDevices[0].deviceId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("[camera-device-picker] Failed to get devices", { error: message });
      
      if (message.includes("Permission denied") || message.includes("NotAllowedError")) {
        setPermission("denied");
      } else if (message.includes("not supported") || message.includes("NotFoundError")) {
        setPermission("unavailable");
      }
      
      setError(message);
      setDevices([]);
    }
  }, [selectedDeviceId]);

  const selectDevice = useCallback((deviceId: string | null) => {
    if (!deviceId && devices.length === 0) {
      setSelectedDeviceId(null);
      return;
    }
    
    const deviceExists = devices.some((d) => d.deviceId === deviceId);
    if (deviceId && deviceExists) {
      setSelectedDeviceId(deviceId);
    } else if (devices.length > 0) {
      setSelectedDeviceId(devices[0].deviceId);
    }
  }, [devices]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  return {
    devices,
    selectedDeviceId,
    permission,
    error,
    selectDevice,
    refreshDevices,
    hasMultipleCameras: devices.length > 1,
  };
}