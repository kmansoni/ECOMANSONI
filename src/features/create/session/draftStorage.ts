import type { CreateAsset, CreateSession } from "./types";
import { logger } from "@/lib/logger";

const DRAFT_STORAGE_KEY = "mansoni:create:active-draft:v1";

type SerializableCreateAsset = Omit<CreateAsset, "localFile" | "localUrl">;

type SerializableCreateSession = Omit<CreateSession, "assets"> & {
  assets: SerializableCreateAsset[];
};

const toSerializableAsset = (asset: CreateAsset): SerializableCreateAsset | null => {
  if (asset.localFile || asset.localUrl) {
    return null;
  }

  const { localFile: _localFile, localUrl: _localUrl, ...serializable } = asset;
  return serializable;
};

export function serializeCreateSessionDraft(session: CreateSession): SerializableCreateSession {
  return {
    ...session,
    assets: session.assets
      .map(toSerializableAsset)
      .filter((asset): asset is SerializableCreateAsset => asset !== null),
  };
}

export function saveCreateSessionDraft(session: CreateSession): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(serializeCreateSessionDraft(session)));
    return true;
  } catch (error) {
    logger.warn("[create:draft] Не удалось сохранить черновик", { error });
    return false;
  }
}

export function loadCreateSessionDraft(): CreateSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CreateSession;
  } catch (error) {
    logger.warn("[create:draft] Не удалось прочитать черновик", { error });
    return null;
  }
}

export function clearCreateSessionDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (error) {
    logger.warn("[create:draft] Не удалось очистить черновик", { error });
  }
}
