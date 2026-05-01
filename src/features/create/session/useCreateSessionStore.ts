import { useCallback, useEffect, useState } from "react";
import type { CreateAsset, CreateEntryPoint, CreateLayer, CreateMode, CreateSession, CreateSettings } from "./types";
import { createInitialSession } from "./createSessionModel";
import { clearCreateSessionDraft, loadCreateSessionDraft, saveCreateSessionDraft } from "./draftStorage";

interface UseCreateSessionStoreOptions {
  initialMode?: CreateMode;
  entry?: CreateEntryPoint;
  restoreDraft?: boolean;
  autosave?: boolean;
}

export function useCreateSessionStore(options: UseCreateSessionStoreOptions = {}) {
  const initialMode = options.initialMode ?? "post";
  const entry = options.entry ?? "plus";
  const restoreDraft = options.restoreDraft ?? false;
  const autosave = options.autosave ?? false;

  const [session, setSession] = useState<CreateSession>(() => {
    if (restoreDraft) {
      const draft = loadCreateSessionDraft();
      if (draft) return draft;
    }
    return createInitialSession(initialMode, entry);
  });

  useEffect(() => {
    if (!autosave || !session.draft.isDirty) return;
    if (session.draft.lastSavedAt && session.draft.lastSavedAt >= session.updatedAt) return;
    if (saveCreateSessionDraft(session)) {
      setSession(prev => ({
        ...prev,
        draft: {
          ...prev.draft,
          lastSavedAt: Date.now(),
        },
      }));
    }
  }, [autosave, session]);

  const setMode = useCallback((mode: CreateMode) => {
    setSession((prev) => {
      if (prev.mode === mode) return prev;
      return {
        ...prev,
        mode,
        draft: {
          ...prev.draft,
          isDirty: true,
        },
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

  const setLayers = useCallback((layers: CreateLayer[]) => {
    setSession((prev) => ({
      ...prev,
      layers,
      draft: {
        ...prev.draft,
        isDirty: true,
      },
      updatedAt: Date.now(),
    }));
  }, []);

  const patchSettings = useCallback((patch: Partial<CreateSettings>) => {
    setSession((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch,
      },
      draft: {
        ...prev.draft,
        isDirty: true,
      },
      updatedAt: Date.now(),
    }));
  }, []);

  const markSaved = useCallback(() => {
    setSession((prev) => ({
      ...prev,
      draft: {
        ...prev.draft,
        isDirty: false,
        lastSavedAt: Date.now(),
      },
      updatedAt: Date.now(),
    }));
  }, []);

  const clearDraft = useCallback(() => {
    clearCreateSessionDraft();
    setSession((prev) => ({
      ...prev,
      draft: {
        ...prev.draft,
        isDirty: false,
        lastSavedAt: undefined,
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
    setLayers,
    patchSettings,
    markSaved,
    clearDraft,
    resetSession,
  };
}
