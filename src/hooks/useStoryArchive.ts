import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ArchivedStory {
  story_id: string;
  archived_at: string;
  media_url: string;
  created_at: string;
}

export function useStoryArchive() {
  const { user } = useAuth();
  const [archivedStories, setArchivedStories] = useState<ArchivedStory[]>([]);
  const [loading, setLoading] = useState(false);

  const getArchivedStories = useCallback(async () => {
    if (!user) return [];
    setLoading(true);
    try {
      // archived_stories is the join table; join with stories to get media_url/created_at
      const { data, error } = await supabase
        .from("archived_stories")
        .select("story_id, archived_at, stories!inner(media_url, created_at)")
        .eq("user_id", user.id)
        .order("archived_at", { ascending: false });

      if (error) throw error;

      const stories: ArchivedStory[] = (data ?? []).map((row) => {
        const story = (row as unknown as { stories: { media_url: string; created_at: string } }).stories;
        return {
          story_id: row.story_id,
          archived_at: row.archived_at,
          media_url: story.media_url,
          created_at: story.created_at,
        };
      });

      setArchivedStories(stories);
      return stories;
    } catch (err) {
      console.error("Error fetching archived stories:", err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [user]);

  const archiveStory = useCallback(
    async (storyId: string) => {
      if (!user) return;
      await supabase
        .from("archived_stories")
        .upsert(
          { story_id: storyId, user_id: user.id, archived_at: new Date().toISOString() },
          { onConflict: "story_id,user_id" }
        );
      await getArchivedStories();
    },
    [user, getArchivedStories]
  );

  const unarchiveStory = useCallback(
    async (storyId: string) => {
      if (!user) return;
      await supabase
        .from("archived_stories")
        .delete()
        .eq("story_id", storyId)
        .eq("user_id", user.id);
      await getArchivedStories();
    },
    [user, getArchivedStories]
  );

  // Auto-archive expired stories (older than 24h) by inserting into archived_stories
  const autoArchiveExpired = useCallback(async () => {
    if (!user) return;
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Find expired stories that haven't been archived yet
    const { data: expiredStories } = await supabase
      .from("stories")
      .select("id")
      .eq("author_id", user.id)
      .lt("expires_at", cutoff);

    if (!expiredStories || expiredStories.length === 0) return;

    const rows = expiredStories.map((s) => ({
      story_id: s.id,
      user_id: user.id,
      archived_at: new Date().toISOString(),
    }));

    await supabase
      .from("archived_stories")
      .upsert(rows, { onConflict: "story_id,user_id" });
  }, [user]);

  useEffect(() => {
    if (user) {
      void autoArchiveExpired();
      void getArchivedStories();
    }
  }, [user, autoArchiveExpired, getArchivedStories]);

  return { archivedStories, loading, getArchivedStories, archiveStory, unarchiveStory };
}
