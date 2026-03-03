/**
 * useDrafts — работа с черновиками контента
 * Автосохранение каждые 30 секунд
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";

const db = supabase as any;

export interface Draft {
  id: string;
  type: "post" | "reel" | "story";
  content: string;
  media: any[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export function useDrafts(type?: Draft["type"]) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(false);

  const getDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      let q = db.from("content_drafts").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
      if (type) q = q.eq("type", type);
      const { data } = await q;
      setDrafts((data || []) as Draft[]);
    } finally {
      setLoading(false);
    }
  }, [type]);

  const saveDraft = useCallback(async (draft: Omit<Draft, "id" | "created_at" | "updated_at">) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await db.from("content_drafts").insert({
      user_id: user.id,
      type: draft.type,
      content: draft.content,
      media: draft.media,
      metadata: draft.metadata,
    }).select().single();
    if (!error && data) {
      setDrafts((prev) => [data as Draft, ...prev]);
      return data as Draft;
    }
    return null;
  }, []);

  const updateDraft = useCallback(async (id: string, updates: Partial<Pick<Draft, "content" | "media" | "metadata">>) => {
    const { data, error } = await db.from("content_drafts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (!error && data) {
      setDrafts((prev) => prev.map((d) => d.id === id ? data as Draft : d));
    }
  }, []);

  const deleteDraft = useCallback(async (id: string) => {
    await db.from("content_drafts").delete().eq("id", id);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const getDraftById = useCallback(async (id: string): Promise<Draft | null> => {
    const { data } = await db.from("content_drafts").select("*").eq("id", id).single();
    return data as Draft | null;
  }, []);

  useEffect(() => { void getDrafts(); }, [getDrafts]);

  return { drafts, loading, getDrafts, saveDraft, updateDraft, deleteDraft, getDraftById };
}

/**
 * useAutosaveDraft — автосохранение каждые 30 секунд
 */
export function useAutosaveDraft(
  draftId: string | null,
  data: { type: Draft["type"]; content: string; media: any[]; metadata: Record<string, any> },
  enabled = true,
) {
  const { saveDraft, updateDraft } = useDrafts();
  const draftIdRef = useRef<string | null>(draftId);

  useEffect(() => { draftIdRef.current = draftId; }, [draftId]);

  const save = useCallback(async () => {
    if (!enabled) return null;
    if (draftIdRef.current) {
      await updateDraft(draftIdRef.current, { content: data.content, media: data.media, metadata: data.metadata });
      return draftIdRef.current;
    } else {
      const d = await saveDraft(data);
      if (d) draftIdRef.current = d.id;
      return d?.id ?? null;
    }
  }, [enabled, data, saveDraft, updateDraft]);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => { void save(); }, 30_000);
    return () => clearInterval(interval);
  }, [enabled, save]);

  return { save };
}
