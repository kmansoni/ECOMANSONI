import { useState, useCallback, useEffect } from "react";

const DRAFT_KEY_PREFIX = "chat_draft_v1:";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface ChatDraft {
  text: string;
  savedAt: number; // Date.now()
}

export interface UseChatDraftsReturn {
  getDraft: (conversationId: string) => string | null;
  saveDraft: (conversationId: string, text: string) => void;
  clearDraft: (conversationId: string) => void;
  getAllDrafts: () => Map<string, ChatDraft>;
  hasDraft: (conversationId: string) => boolean;
}

function buildKey(conversationId: string): string {
  return `${DRAFT_KEY_PREFIX}${conversationId}`;
}

function readDraftFromStorage(conversationId: string): ChatDraft | null {
  try {
    const raw = localStorage.getItem(buildKey(conversationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ChatDraft;
    if (!parsed || typeof parsed.text !== "string" || typeof parsed.savedAt !== "number") return null;
    // TTL check
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(buildKey(conversationId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function loadAllDraftsFromStorage(): Map<string, ChatDraft> {
  const result = new Map<string, ChatDraft>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DRAFT_KEY_PREFIX)) continue;
      const conversationId = key.slice(DRAFT_KEY_PREFIX.length);
      const draft = readDraftFromStorage(conversationId);
      if (draft && draft.text) {
        result.set(conversationId, draft);
      }
    }
  } catch {
    // localStorage may be unavailable in some environments
  }
  return result;
}

export function useChatDrafts(): UseChatDraftsReturn {
  const [draftsMap, setDraftsMap] = useState<Map<string, ChatDraft>>(() => loadAllDraftsFromStorage());

  // Sync once on mount to pick up any drafts persisted in previous sessions
  useEffect(() => {
    setDraftsMap(loadAllDraftsFromStorage());
  }, []);

  const getDraft = useCallback((conversationId: string): string | null => {
    const draft = readDraftFromStorage(conversationId);
    return draft?.text ?? null;
  }, []);

  const saveDraft = useCallback((conversationId: string, text: string): void => {
    if (!text.trim()) {
      // Empty text → remove draft
      try {
        localStorage.removeItem(buildKey(conversationId));
      } catch { /* noop */ }
      setDraftsMap((prev) => {
        const next = new Map(prev);
        next.delete(conversationId);
        return next;
      });
      return;
    }

    const draft: ChatDraft = { text, savedAt: Date.now() };
    try {
      localStorage.setItem(buildKey(conversationId), JSON.stringify(draft));
    } catch { /* Storage full or unavailable */ }

    setDraftsMap((prev) => {
      const next = new Map(prev);
      next.set(conversationId, draft);
      return next;
    });
  }, []);

  const clearDraft = useCallback((conversationId: string): void => {
    try {
      localStorage.removeItem(buildKey(conversationId));
    } catch { /* noop */ }
    setDraftsMap((prev) => {
      const next = new Map(prev);
      next.delete(conversationId);
      return next;
    });
  }, []);

  const getAllDrafts = useCallback((): Map<string, ChatDraft> => {
    return loadAllDraftsFromStorage();
  }, []);

  const hasDraft = useCallback((conversationId: string): boolean => {
    const draft = draftsMap.get(conversationId);
    if (!draft) return false;
    // Fast TTL check using in-memory map
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) return false;
    return draft.text.length > 0;
  }, [draftsMap]);

  return { getDraft, saveDraft, clearDraft, getAllDrafts, hasDraft };
}
