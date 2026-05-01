import { useCreateSessionStore } from "./session/useCreateSessionStore";
import { useCameraDeviceStore } from "./session/cameraDeviceStore";
import { BoomerangComposer } from "./camera/BoomerangComposer";
import { CollageGridEditor } from "./editor/CollageGridEditor";
import { EffectCarousel } from "./editor/EffectCarousel";
import { ReelsTimeline } from "./editor/ReelsTimeline";
import { EffectRegistryContext } from "./effects/effectRegistry";
import { DraftRestoreDialog } from "./session/DraftRestoreDialog";
import { MultiGalleryPicker } from "./gallery/MultiGalleryPicker";

// Re-export для удобного импорта
export {
  useCreateSessionStore,
  useCameraDeviceStore,
  BoomerangComposer,
  CollageGridEditor,
  EffectCarousel,
  ReelsTimeline,
  EffectRegistryContext,
  DraftRestoreDialog,
  MultiGalleryPicker,
};

// Хук для проверки черновика
export function useDraftRestore() {
  const { session } = useCreateSessionStore({
    initialMode: "post",
    restoreDraft: true,
  });

  return {
    hasDraft: session.draft.isDirty && session.updatedAt > session.createdAt,
    draftTimestamp: session.updatedAt,
  };
}

// Хук для камеры с fallback
export function useCameraWithFallback() {
  const { devices, selectedDeviceId, setSelectedDeviceId, permission } = useCameraDeviceStore();
  
  const getCameraConstraints = () => {
    if (!selectedDeviceId && devices.length === 0) return { video: true };
    
    const selected = devices.find(d => d.deviceId === selectedDeviceId);
    if (selected) {
      return { video: { deviceId: { exact: selected.deviceId } } };
    }
    
    return { video: { facingMode: "environment" } };
  };

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    permission,
    constraints: getCameraConstraints(),
    hasMultipleCameras: devices.length > 1,
  };
}