import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CameraDeviceState {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  permission: "prompt" | "granted" | "denied" | "unavailable";
  lastError: string | null;
  setDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedDeviceId: (deviceId: string | null) => void;
  setPermission: (permission: CameraDeviceState["permission"]) => void;
  setLastError: (error: string | null) => void;
}

export const useCameraDeviceStore = create<CameraDeviceState>()(
  persist(
    (set) => ({
      devices: [],
      selectedDeviceId: null,
      permission: "prompt",
      lastError: null,
      setDevices: (devices) => set({ devices }),
      setSelectedDeviceId: (selectedDeviceId) => set({ selectedDeviceId }),
      setPermission: (permission) => set({ permission }),
      setLastError: (lastError) => set({ lastError }),
    }),
    {
      name: "camera-device-store",
      partialize: (state) => ({
        selectedDeviceId: state.selectedDeviceId,
      }),
    }
  )
);

interface CreateStudioUIState {
  activeTab: "stories" | "reels" | "post";
  showCamera: boolean;
  showGallery: boolean;
  showEditor: boolean;
  setActiveTab: (tab: CreateStudioUIState["activeTab"]) => void;
  setShowCamera: (show: boolean) => void;
  setShowGallery: (show: boolean) => void;
  setShowEditor: (show: boolean) => void;
}

export const useCreateStudioUIStore = create<CreateStudioUIState>((set) => ({
  activeTab: "stories",
  showCamera: false,
  showGallery: false,
  showEditor: false,
  setActiveTab: (activeTab) => set({ activeTab }),
  setShowCamera: (showCamera) => set({ showCamera }),
  setShowGallery: (showGallery) => set({ showGallery }),
  setShowEditor: (showEditor) => set({ showEditor }),
}));