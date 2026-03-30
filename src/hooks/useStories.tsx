import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { uploadMedia } from '@/lib/mediaUpload';
import { isGuestMode } from '@/lib/demo/demoMode';
import { getDemoBotsUsersWithStories, isDemoId } from '@/lib/demo/demoBots';
import { fetchUserBriefMap, resolveUserBrief } from '@/lib/users/userBriefs';
import { showErrorToast, handleApiError, errors } from '@/lib/errors';
import { logger } from '@/lib/logger';

export interface Story {
  id: string;
  author_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
}

export interface UserWithStories {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  stories: Story[];
  hasNew: boolean;
  isOwn: boolean;
}

interface StoryRow {
  id: string;
  author_id: string;
  media_url: string;
  media_type: string;
  caption: string | null;
  created_at: string;
  expires_at: string;
}

interface StoryViewRow {
  story_id: string;
  viewer_id: string;
}

interface ProfileRow {
  user_id: string;
  verified: boolean | null;
}

export function useStories() {
  const { user } = useAuth();
  const [usersWithStories, setUsersWithStories] = useState<UserWithStories[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch active stories (not expired)
      const { data: storiesData, error: storiesError } = await supabase
        .from('stories')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (storiesError) throw storiesError;

      const stories = (storiesData || []) as StoryRow[];

      if (stories.length === 0) {
        // Return only own user placeholder if no stories
        if (user) {
          const briefMap = await fetchUserBriefMap([user.id], supabase as any);
          const ownBrief = resolveUserBrief(user.id, briefMap);
          const { data: profileData } = await supabase
            .from('profiles')
            .select('user_id, verified')
            .eq('user_id', user.id)
            .limit(1);

          const ownProfile = Array.isArray(profileData) ? profileData[0] : null;

          setUsersWithStories([{
            user_id: user.id,
            display_name: ownBrief?.display_name || 'Вы',
            avatar_url: ownBrief?.avatar_url ?? null,
            verified: ownProfile?.verified || false,
            stories: [],
            hasNew: false,
            isOwn: true
          }]);
        } else {
          setUsersWithStories([]);
        }
        return;
      }

      // Get unique author IDs
      const authorIds = [...new Set(stories.map(s => s.author_id))];
      const briefMap = await fetchUserBriefMap(authorIds, supabase as any);

      // Fetch profile verification flags for authors
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, verified')
        .in('user_id', authorIds);

      if (profilesError) throw profilesError;

      const profiles = (profilesData || []) as ProfileRow[];
      const profilesMap = new Map(profiles.map(p => [p.user_id, p]));

      // Check which stories the current user has viewed
      let viewedStoryIds = new Set<string>();
      if (user) {
        const { data: viewsData } = await supabase
          .from('story_views')
          .select('story_id')
          .eq('viewer_id', user.id)
          .in('story_id', stories.map(s => s.id));

        if (viewsData) {
          viewedStoryIds = new Set((viewsData as StoryViewRow[]).map(v => v.story_id));
        }
      }

      // Group stories by author
      const storiesByAuthor = new Map<string, Story[]>();
      stories.forEach(story => {
        const existing = storiesByAuthor.get(story.author_id) || [];
        existing.push(story);
        storiesByAuthor.set(story.author_id, existing);
      });

      // Build users with stories array
      const users: UserWithStories[] = [];

      // Add current user first (own stories or placeholder)
      if (user) {
        const ownStories = storiesByAuthor.get(user.id) || [];
        const profile = profilesMap.get(user.id);
        const brief = resolveUserBrief(user.id, briefMap);
        
        users.push({
          user_id: user.id,
          display_name: brief?.display_name || 'Вы',
          avatar_url: brief?.avatar_url ?? null,
          verified: profile?.verified || false,
          stories: ownStories,
          hasNew: false, // Own stories don't show as "new"
          isOwn: true
        });

        // Remove own user from the map to avoid duplication
        storiesByAuthor.delete(user.id);
      }

      // Add other users with stories
      storiesByAuthor.forEach((userStories, authorId) => {
        const profile = profilesMap.get(authorId);
        const brief = resolveUserBrief(authorId, briefMap);
        const hasUnviewedStories = userStories.some(s => !viewedStoryIds.has(s.id));

        users.push({
          user_id: authorId,
          display_name: brief?.display_name || authorId.slice(0, 8),
          avatar_url: brief?.avatar_url ?? null,
          verified: profile?.verified || false,
          stories: userStories,
          hasNew: hasUnviewedStories,
          isOwn: false
        });
      });

      // Sort: users with new stories first (except own)
      users.sort((a, b) => {
        if (a.isOwn) return -1;
        if (b.isOwn) return 1;
        if (a.hasNew && !b.hasNew) return -1;
        if (!a.hasNew && b.hasNew) return 1;
        return 0;
      });

      // Guest-mode demo bots (no DB writes/reads)
      if (isGuestMode()) {
        const demoUsers = getDemoBotsUsersWithStories() as any as UserWithStories[];
        // Keep own user first; demo users after.
        const withoutDemo = users.filter((u) => !u.user_id.startsWith('demo_'));
        setUsersWithStories([...withoutDemo, ...demoUsers]);
        return;
      }

      setUsersWithStories(users);
    } catch (err) {
      const appError = handleApiError(err);
      logger.error('[useStories] Error fetching stories', { error: appError });
      setError(appError.message);
      showErrorToast(err, 'Не удалось загрузить истории');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  // Subscribe to realtime updates — ИСПРАВЛЕНИЕ дефекта #5:
  // fetchStories в deps вызывало пересоздание канала при каждом ре-рендере.
  // Решение: стабилизировать ссылку через useRef — канал создаётся один раз.
  const fetchStoriesRef = useRef(fetchStories);
  useEffect(() => { fetchStoriesRef.current = fetchStories; }, [fetchStories]);

  useEffect(() => {
    const channel = supabase
      .channel('stories-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories' },
        () => {
          fetchStoriesRef.current(); // всегда актуальная ссылка
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // пустой deps — канал создаётся один раз за жизнь хука

  const markAsViewed = useCallback(async (storyId: string) => {
    if (!user) return;

    // Demo story: mark locally only
    if (isDemoId(storyId)) {
      setUsersWithStories((prev) =>
        prev.map((u) => {
          if (!u.stories?.some((s) => s.id === storyId)) return u;
          return { ...u, hasNew: false };
        }),
      );
      return;
    }

    try {
      await supabase
        .from('story_views')
        .upsert({
          story_id: storyId,
          viewer_id: user.id
        }, { onConflict: 'story_id,viewer_id' });
    } catch (err) {
      logger.error('[useStories] Error marking story as viewed', { error: err });
    }
  }, [user]);

  const uploadStory = useCallback(async (file: File, caption?: string) => {
    if (!user) return { error: 'Must be logged in', story: null };

    try {
      // Upload to media server
      const uploadResult = await uploadMedia(file, { bucket: 'stories-media' });
      const publicUrl = uploadResult.url;

      // Create story record
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .insert({
          author_id: user.id,
          media_url: publicUrl,
          media_type: mediaType,
          caption: caption || null
        })
        .select()
        .single();

      if (storyError) throw storyError;

      await fetchStories();
      return { error: null, story };
    } catch (err) {
      return { 
        error: err instanceof Error ? err.message : 'Failed to upload story', 
        story: null 
      };
    }
  }, [user, fetchStories]);

  return { usersWithStories, loading, error, refetch: fetchStories, markAsViewed, uploadStory };
}
