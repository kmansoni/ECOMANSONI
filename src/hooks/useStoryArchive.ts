import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { logger } from "@/lib/logger";
import {
  ensureExpiredStoriesArchived,
  listArchivedStories,
  type ArchivedStoryRecord,
} from "@/lib/story-archive";

export type ArchivedStory = ArchivedStoryRecord;

export function useStoryArchive() {
  const { user } = useAuth();
  const [archivedStories, setArchivedStories] = useState<ArchivedStory[]>([]);
  const [loading, setLoading] = useState(false);

  const getArchivedStories = useCallback(async () => {
    if (!user) return [];
    setLoading(true);
    try {
      const stories = await listArchivedStories(user.id);

      setArchivedStories(stories);
      return stories;
    } catch (err) {
      logger.error("[useStoryArchive] Error fetching archived stories", { error: err });
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
          { onConflict: "user_id,story_id" }
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
    await ensureExpiredStoriesArchived(user.id);
  }, [user]);

  useEffect(() => {
    if (user) {
      void autoArchiveExpired();
      void getArchivedStories();
    }
  }, [user, autoArchiveExpired, getArchivedStories]);

  return { archivedStories, loading, getArchivedStories, archiveStory, unarchiveStory };
}
