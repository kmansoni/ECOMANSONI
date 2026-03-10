import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

const LEGACY_DRAFT_KEY_PREFIX = "chat_draft_v1:";
const DRAFT_KEY_PREFIX = "chat_draft_v2:";
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

function buildLegacyKey(conversationId: string): string {
  return `${LEGACY_DRAFT_KEY_PREFIX}${conversationId}`;
}

function buildKey(userId: string | null | undefined, conversationId: string): string {
  if (!userId) return buildLegacyKey(conversationId);
  return `${DRAFT_KEY_PREFIX}${userId}:${conversationId}`;
}

function parseDraft(raw: string | null): ChatDraft | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as ChatDraft;
  if (!parsed || typeof parsed.text !== "string" || typeof parsed.savedAt !== "number") return null;
  return parsed;
}

function readDraftFromStorage(userId: string | null | undefined, conversationId: string): ChatDraft | null {
  try {
    const scopedKey = buildKey(userId, conversationId);
    const scopedRaw = localStorage.getItem(scopedKey);
    const parsedScoped = parseDraft(scopedRaw);
    const parsed = parsedScoped ?? parseDraft(localStorage.getItem(buildLegacyKey(conversationId)));
    if (!parsed) return null;

    // One-time migration from legacy key into user-scoped namespace.
    if (userId && !parsedScoped) {
      localStorage.setItem(scopedKey, JSON.stringify(parsed));
      localStorage.removeItem(buildLegacyKey(conversationId));
    }

    // TTL check
    if (Date.now() - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(scopedKey);
      localStorage.removeItem(buildLegacyKey(conversationId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function loadAllDraftsFromStorage(userId: string | null | undefined): Map<string, ChatDraft> {
  const result = new Map<string, ChatDraft>();
  try {
    const scopedPrefix = userId ? `${DRAFT_KEY_PREFIX}${userId}:` : LEGACY_DRAFT_KEY_PREFIX;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(scopedPrefix)) continue;
      const conversationId = key.slice(scopedPrefix.length);
      const draft = readDraftFromStorage(userId, conversationId);
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
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [draftsMap, setDraftsMap] = useState<Map<string, ChatDraft>>(() => loadAllDraftsFromStorage(userId));

  // Sync once on mount to pick up any drafts persisted in previous sessions
  useEffect(() => {
    setDraftsMap(loadAllDraftsFromStorage(userId));
  }, [userId]);

  const getDraft = useCallback((conversationId: string): string | null => {
    const draft = readDraftFromStorage(userId, conversationId);
    return draft?.text ?? null;
  }, [userId]);

  const saveDraft = useCallback((conversationId: string, text: string): void => {
    const scopedKey = buildKey(userId, conversationId);
    const legacyKey = buildLegacyKey(conversationId);

    if (!text.trim()) {
      // Empty text → remove draft
      try {
        localStorage.removeItem(scopedKey);
        localStorage.removeItem(legacyKey);
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
      localStorage.setItem(scopedKey, JSON.stringify(draft));
      if (userId) {
        localStorage.removeItem(legacyKey);
      }
    } catch { /* Storage full or unavailable */ }

    setDraftsMap((prev) => {
      const next = new Map(prev);
      next.set(conversationId, draft);
      return next;
    });
  }, [userId]);

  const clearDraft = useCallback((conversationId: string): void => {
    try {
      localStorage.removeItem(buildKey(userId, conversationId));
      localStorage.removeItem(buildLegacyKey(conversationId));
    } catch { /* noop */ }
    setDraftsMap((prev) => {
      const next = new Map(prev);
      next.delete(conversationId);
      return next;
    });
  }, [userId]);

  const getAllDrafts = useCallback((): Map<string, ChatDraft> => {
    return loadAllDraftsFromStorage(userId);
  }, [userId]);

  const hasDraft = useCallback((conversationId: string): boolean => {
    const draft = draftsMap.get(conversationId);
    if (!draft) return false;
    // Fast TTL check using in-memory map
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) return false;
    return draft.text.length > 0;
  }, [draftsMap]);

  return { getDraft, saveDraft, clearDraft, getAllDrafts, hasDraft };
}
