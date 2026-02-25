import { useCallback, useState } from "react";
import type { CreateAsset, CreateEntryPoint, CreateMode, CreateSession } from "./types";

interface UseCreateSessionStoreOptions {
  initialMode?: CreateMode;
  entry?: CreateEntryPoint;
}

const createSessionId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `create_${Date.now()}`;
};

const createInitialSession = (mode: CreateMode, entry: CreateEntryPoint): CreateSession => {
  const now = Date.now();
  return {
    id: createSessionId(),
    entry,
    mode,
    assets: [],
    layers: [],
    editor: {},
    draft: { isDirty: false },
    createdAt: now,
    updatedAt: now,
  };
};

export function useCreateSessionStore(options: UseCreateSessionStoreOptions = {}) {
  const initialMode = options.initialMode ?? "post";
  const entry = options.entry ?? "plus";

  const [session, setSession] = useState<CreateSession>(() => createInitialSession(initialMode, entry));

  const setMode = useCallback((mode: CreateMode) => {
    setSession((prev) => {
      if (prev.mode === mode) return prev;
      return {
        ...prev,
        mode,
        updatedAt: Date.now(),
      };
    });
  }, []);

  const setAssets = useCallback((assets: CreateAsset[]) => {
    setSession((prev) => ({
      ...prev,
      assets,
      draft: {
        ...prev.draft,
        isDirty: true,
      },
      updatedAt: Date.now(),
    }));
  }, []);

  const resetSession = useCallback((mode: CreateMode = initialMode, nextEntry: CreateEntryPoint = entry) => {
    setSession(createInitialSession(mode, nextEntry));
  }, [entry, initialMode]);

  return {
    session,
    setMode,
    setAssets,
    resetSession,
  };
}