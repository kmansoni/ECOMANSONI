import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isGuestMode } from '@/lib/demo/demoMode';
import { getDemoBotsUsersWithStories, isDemoId } from '@/lib/demo/demoBots';

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
  display_name: string | null;
  avatar_url: string | null;
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
      const { data: storiesData, error: storiesError } = await (supabase
        .from('stories' as any)
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }) as any);

      if (storiesError) throw storiesError;

      const stories = (storiesData || []) as StoryRow[];

      if (stories.length === 0) {
        // Return only own user placeholder if no stories
        if (user) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('user_id, display_name, avatar_url, verified')
            .eq('user_id', user.id)
            .single();

          setUsersWithStories([{
            user_id: user.id,
            display_name: profileData?.display_name || 'Вы',
            avatar_url: profileData?.avatar_url,
            verified: profileData?.verified || false,
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

      // Fetch profiles for authors
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, verified')
        .in('user_id', authorIds);

      if (profilesError) throw profilesError;

      const profiles = (profilesData || []) as ProfileRow[];
      const profilesMap = new Map(profiles.map(p => [p.user_id, p]));

      // Check which stories the current user has viewed
      let viewedStoryIds = new Set<string>();
      if (user) {
        const { data: viewsData } = await (supabase
          .from('story_views' as any)
          .select('story_id')
          .eq('viewer_id', user.id)
          .in('story_id', stories.map(s => s.id)) as any);

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
        
        users.push({
          user_id: user.id,
          display_name: profile?.display_name || 'Вы',
          avatar_url: profile?.avatar_url,
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
        const hasUnviewedStories = userStories.some(s => !viewedStoryIds.has(s.id));

        users.push({
          user_id: authorId,
          display_name: profile?.display_name || 'Пользователь',
          avatar_url: profile?.avatar_url,
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
      console.error('Error fetching stories:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stories');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStories();
  }, [fetchStories]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('stories-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stories' },
        () => {
          fetchStories();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStories]);

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
      await (supabase
        .from('story_views' as any)
        .upsert({
          story_id: storyId,
          viewer_id: user.id
        }, { onConflict: 'story_id,viewer_id' }) as any);
    } catch (err) {
      console.error('Error marking story as viewed:', err);
    }
  }, [user]);

  const uploadStory = useCallback(async (file: File, caption?: string) => {
    if (!user) return { error: 'Must be logged in', story: null };

    try {
      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('stories-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('stories-media')
        .getPublicUrl(fileName);

      // Create story record
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      
      const { data: story, error: storyError } = await (supabase
        .from('stories' as any)
        .insert({
          author_id: user.id,
          media_url: publicUrl,
          media_type: mediaType,
          caption: caption || null
        })
        .select()
        .single() as any);

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
