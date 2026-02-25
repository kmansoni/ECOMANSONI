export type CreateMode = "post" | "story" | "reels" | "live";

export type CreateEntryPoint = "plus" | "swipe" | "shortcut";

export type CreateAssetKind = "image" | "video";

export type CreateAssetSource = "local" | "remote";

export type CreateAssetStatus = "local" | "uploading" | "uploaded" | "failed";

export interface CreateAsset {
  id: string;
  kind: CreateAssetKind;
  source: CreateAssetSource;
  localFile?: File;
  localUrl?: string;
  remoteUrl?: string;
  mimeType?: string;
  status: CreateAssetStatus;
}

export interface CreateLayer {
  id: string;
  type: "text" | "sticker" | "music" | "poll" | "draw";
  payload?: unknown;
}

export interface CreateDraftState {
  isDirty: boolean;
  lastSavedAt?: number;
}

export interface CreateEditorState {
  caption?: string;
}

export interface CreateSession {
  id: string;
  entry: CreateEntryPoint;
  mode: CreateMode;
  assets: CreateAsset[];
  layers: CreateLayer[];
  editor: CreateEditorState;
  draft: CreateDraftState;
  createdAt: number;
  updatedAt: number;
}