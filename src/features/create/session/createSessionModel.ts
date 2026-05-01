import type { CreateEntryPoint, CreateMode, CreateSession, CreateSettings } from "./types";

export const createSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `create_${Date.now()}`;
};

export const createDefaultSettings = (): CreateSettings => ({
  camera: {
    facingMode: "environment",
    zoom: 1,
    flash: "off",
    timerSec: 0,
    maxDurationSec: 60,
    recordingState: "idle",
    recordingElapsedMs: 0,
  },
  gallery: {
    permission: "unknown",
    multiSelect: false,
  },
  textStory: {
    text: "",
    backgroundId: "gradient-aurora",
    fontId: "classic",
    align: "center",
    color: "#ffffff",
  },
  collage: {
    layoutId: "grid-2",
    frames: [],
  },
  effects: {
    activeEffectId: null,
    recentEffectIds: [],
  },
});

export const createInitialSession = (mode: CreateMode, entry: CreateEntryPoint): CreateSession => {
  const now = Date.now();
  return {
    id: createSessionId(),
    entry,
    mode,
    assets: [],
    layers: [],
    editor: {},
    settings: createDefaultSettings(),
    draft: { isDirty: false },
    createdAt: now,
    updatedAt: now,
  };
};
