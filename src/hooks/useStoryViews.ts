import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface StoryViewer {
  viewer_id: string;
  viewed_at: string;
  display_name?: string;
  avatar_url?: string;
}

export function useStoryViews(storyId?: string, authorId?: string) {
  const { user } = useAuth();
  const [views, setViews] = useState(0);
  const [viewers, setViewers] = useState<StoryViewer[]>([]);
  const [loading, setLoading] = useState(false);

  const isAuthor = !!(user && authorId && user.id === authorId);

  const recordView = useCallback(async (sid: string) => {
    if (!user || !sid) return;
    try {
      await supabase
        .from("story_views")
        .upsert({ story_id: sid, viewer_id: user.id }, { onConflict: "story_id,viewer_id" });
    } catch {
      // ignore — table may not exist yet in dev
    }
  }, [user]);

  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;

    const fetchViews = async () => {
      setLoading(true);
      try {
        const { count } = await supabase
          .from("story_views")
          .select("*", { count: "exact", head: true })
          .eq("story_id", storyId);
        if (!cancelled) setViews(count ?? 0);

        if (isAuthor) {
          const { data } = await supabase
            .from("story_views")
            .select("viewer_id, viewed_at")
            .eq("story_id", storyId)
            .order("viewed_at", { ascending: false })
            .limit(100);

          if (!cancelled && data) {
            const viewerIds = data.map((v) => v.viewer_id);
            if (viewerIds.length > 0) {
              const { data: profiles } = await supabase
                .from("profiles")
                .select("user_id, display_name, avatar_url")
                .in("user_id", viewerIds);
              const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
              const enriched: StoryViewer[] = data.map((v) => ({
                viewer_id: v.viewer_id,
                viewed_at: v.viewed_at ?? new Date().toISOString(),
                display_name: profileMap.get(v.viewer_id)?.display_name ?? "Пользователь",
                avatar_url: profileMap.get(v.viewer_id)?.avatar_url ?? null,
              }));
              setViewers(enriched);
            }
          }
        }
      } catch {
        // table may not exist yet in dev
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchViews();
    return () => { cancelled = true; };
  }, [storyId, isAuthor]);

  return { views, viewers, loading, recordView, isAuthor };
}
