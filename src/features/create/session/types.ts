export type CreateMode = "post" | "story" | "text_story" | "reels" | "boomerang" | "collage" | "live";

export type CreateEntryPoint = "plus" | "swipe" | "shortcut" | "deep_link" | "share_sheet";

export type CreateAssetKind = "image" | "video" | "audio";

export type CreateAssetSource = "camera" | "gallery" | "generated" | "remote";

export type CreateAssetStatus = "local" | "processing" | "uploading" | "uploaded" | "failed";

export type CreateGalleryPermissionState = "unknown" | "granted" | "limited" | "denied" | "unavailable";

export type CreateAssetCompatibility = "ok" | "warning" | "blocked";

export type CreateRecordingState = "idle" | "starting" | "recording" | "locked" | "stopping" | "processing";

export interface CreateAsset {
  id: string;
  kind: CreateAssetKind;
  source: CreateAssetSource;
  localFile?: File;
  localUrl?: string;
  remoteUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  codec?: string;
  compatibility?: CreateAssetCompatibility;
  compatibilityReason?: string;
  status: CreateAssetStatus;
}

export type CreateLayerType = "text" | "sticker" | "music" | "poll" | "draw" | "media";

export interface CreateTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CreateLayer {
  id: string;
  type: CreateLayerType;
  payload?: unknown;
  transform?: CreateTransform;
}

export interface CreateDraftState {
  isDirty: boolean;
  lastSavedAt?: number;
}

export interface CreateEditorState {
  caption?: string;
}

export interface CreateCameraSettings {
  facingMode: "user" | "environment";
  zoom: number;
  flash: "off" | "on";
  timerSec: 0 | 3 | 10;
  maxDurationSec: 15 | 30 | 60 | 90;
  recordingState: CreateRecordingState;
  recordingElapsedMs: number;
}

export interface CreateGalleryState {
  permission: CreateGalleryPermissionState;
  lastThumbnailUrl?: string;
  multiSelect: boolean;
}

export interface CreateTextStoryState {
  text: string;
  backgroundId: string;
  fontId: string;
  align: "left" | "center" | "right";
  color: string;
}

export interface CreateCollageFrame {
  id: string;
  assetId?: string;
  transform: CreateTransform;
}

export interface CreateCollageState {
  layoutId: string;
  frames: CreateCollageFrame[];
}

export interface CreateEffectState {
  activeEffectId: string | null;
  recentEffectIds: string[];
}

export interface CreateSettings {
  camera: CreateCameraSettings;
  gallery: CreateGalleryState;
  textStory: CreateTextStoryState;
  collage: CreateCollageState;
  effects: CreateEffectState;
}

export interface CreateSession {
  id: string;
  entry: CreateEntryPoint;
  mode: CreateMode;
  assets: CreateAsset[];
  layers: CreateLayer[];
  editor: CreateEditorState;
  settings: CreateSettings;
  draft: CreateDraftState;
  createdAt: number;
  updatedAt: number;
}
