import { supabase } from "@/integrations/supabase/client";

export interface ArchivedStoryRecord {
  story_id: string;
  archived_at: string;
  media_url: string | null;
  media_type: "image" | "video";
  created_at: string;
  expires_at: string;
}

interface ArchivedStoryRow {
  story_id: string;
  archived_at: string;
}

interface StoryRow {
  id: string;
  media_url: string;
  media_type: "image" | "video";
  created_at: string;
  expires_at: string;
}

export async function ensureExpiredStoriesArchived(userId: string): Promise<void> {
  const { data: expiredStories, error: expiredStoriesError } = await supabase
    .from("stories")
    .select("id, expires_at")
    .eq("author_id", userId)
    .lte("expires_at", new Date().toISOString());

  if (expiredStoriesError) throw expiredStoriesError;
  if (!expiredStories?.length) return;

  const rows = expiredStories.map((story) => ({
    story_id: story.id,
    user_id: userId,
    archived_at: story.expires_at,
  }));

  const { error: archiveError } = await supabase
    .from("archived_stories")
    .upsert(rows, { onConflict: "user_id,story_id" });

  if (archiveError) throw archiveError;
}

export async function listArchivedStories(userId: string): Promise<ArchivedStoryRecord[]> {
  await ensureExpiredStoriesArchived(userId);

  const { data: archivedRows, error: archivedError } = await supabase
    .from("archived_stories")
    .select("story_id, archived_at")
    .eq("user_id", userId)
    .order("archived_at", { ascending: false });

  if (archivedError) throw archivedError;

  const refs = (archivedRows ?? []) as ArchivedStoryRow[];
  const storyIds = [...new Set(refs.map((row) => row.story_id).filter(Boolean))];
  if (!storyIds.length) return [];

  const { data: stories, error: storiesError } = await supabase
    .from("stories")
    .select("id, media_url, media_type, created_at, expires_at")
    .in("id", storyIds)
    .limit(storyIds.length);

  if (storiesError) throw storiesError;

  const storiesById = new Map(
    ((stories ?? []) as StoryRow[]).map((story) => [story.id, story]),
  );

  return refs.flatMap((row) => {
    const story = storiesById.get(row.story_id);
    if (!story) return [];

    return [{
      story_id: row.story_id,
      archived_at: row.archived_at,
      media_url: story.media_url ?? null,
      media_type: story.media_type,
      created_at: story.created_at,
      expires_at: story.expires_at,
    }];
  });
}