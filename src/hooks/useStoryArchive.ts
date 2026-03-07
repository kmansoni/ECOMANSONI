import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface ArchivedStory {
  id: string;
  media_url: string;
  created_at: string;
  archived_at: string;
}

export function useStoryArchive() {
  const { user } = useAuth();
  const [archivedStories, setArchivedStories] = useState<ArchivedStory[]>([]);
  const [loading, setLoading] = useState(false);

  const getArchivedStories = useCallback(async () => {
    if (!user) return [];
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("stories")
        .select("id, media_url, created_at, archived_at")
        .eq("user_id", user.id)
        .eq("is_archived", true)
        .order("archived_at", { ascending: false });
      const stories = data || [];
      setArchivedStories(stories);
      return stories;
    } finally {
      setLoading(false);
    }
  }, [user]);

  const archiveStory = useCallback(
    async (storyId: string) => {
      if (!user) return;
      await (supabase as any)
        .from("stories")
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq("id", storyId)
        .eq("user_id", user.id);
      await getArchivedStories();
    },
    [user, getArchivedStories]
  );

  const unarchiveStory = useCallback(
    async (storyId: string) => {
      if (!user) return;
      await (supabase as any)
        .from("stories")
        .update({ is_archived: false, archived_at: null })
        .eq("id", storyId)
        .eq("user_id", user.id);
      await getArchivedStories();
    },
    [user, getArchivedStories]
  );

  // Auto-archive expired stories (older than 24h)
  const autoArchiveExpired = useCallback(async () => {
    if (!user) return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await (supabase as any)
      .from("stories")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .lt("created_at", cutoff);
  }, [user]);

  useEffect(() => {
    if (user) {
      void autoArchiveExpired();
      void getArchivedStories();
    }
  }, [user, autoArchiveExpired, getArchivedStories]);

  return { archivedStories, loading, getArchivedStories, archiveStory, unarchiveStory };
}
