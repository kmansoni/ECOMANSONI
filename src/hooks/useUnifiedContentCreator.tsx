import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ContentType } from './useMediaEditor';
import { uploadMedia } from '@/lib/mediaUpload';

function safeRandomUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through.
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Unified Content Creator Hook
 * Handles creation for Stories, Posts, Reels, and Lives
 * Provides consistent API across all content types
 */

export interface UnifiedContent {
  id: string;
  content_type: ContentType;
  author_id: string;
  title?: string;
  caption?: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  thumbnail_url?: string;
  category?: string; // For Lives
  created_at: string;
}

export interface ContentCreationOptions {
  contentType: ContentType;
  caption?: string;
  title?: string; // For Lives
  category?: string; // For Lives: 'music', 'gaming', 'chat', 'performance', 'other'
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  thumbnailUrl?: string; // For Lives
  isPublished?: boolean; // For Posts
  isFollowersOnly?: boolean; // For Lives
}

interface UseUnifiedContentCreatorReturn {
  isLoading: boolean;
  error: string | null;
  activeContentType: ContentType;
  setActiveContentType: (type: ContentType) => void;

  // Generic methods
  createContent: (options: ContentCreationOptions) => Promise<UnifiedContent | null>;

  // Type-specific upload handlers
  uploadStoryMedia: (file: File, caption?: string) => Promise<UnifiedContent | null>;
  uploadPostMedia: (file: File, caption?: string, scheduledAt?: string | null, opts?: { hideLikes?: boolean; commentsDisabled?: boolean }) => Promise<UnifiedContent | null>;
  uploadReelMedia: (
    file: File,
    caption?: string,
    options?: {
      clientPublishId?: string;
      musicTitle?: string | null;
      musicTrackId?: string | null;
      effectPreset?: string | null;
      faceEnhance?: boolean;
      aiEnhance?: boolean;
      maxDurationSec?: number;
      taggedUsers?: string[];
      locationName?: string | null;
      visibility?: 'public' | 'followers' | 'private';
      allowComments?: boolean;
      allowRemix?: boolean;
    }
  ) => Promise<UnifiedContent | null>;
  createLiveSession: (title: string, category: string, thumbnailUrl?: string) => Promise<UnifiedContent | null>;

  // Utilities
  getStorageBucket: (contentType: ContentType) => string;
}

export function useUnifiedContentCreator(): UseUnifiedContentCreatorReturn {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeContentType, setActiveContentType] = useState<ContentType>('post');

  const getStorageBucket = useCallback((contentType: ContentType): string => {
    switch (contentType) {
      case 'story':
        return 'stories-media';
      case 'post':
        return 'post-media';
      case 'reel':
        return 'reels-media';
      case 'live':
        return 'live-media'; // For live thumbnails
      default:
        return 'post-media';
    }
  }, []);

  const uploadStoryMedia = useCallback(
    async (file: File, caption?: string): Promise<UnifiedContent | null> => {
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      setIsLoading(true);
      setError(null);

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
            caption: caption || null,
          })
          .select()
          .single();

        if (storyError) throw storyError;

        return {
          id: story.id,
          content_type: 'story',
          author_id: user.id,
          caption,
          media_url: publicUrl,
          media_type: mediaType,
          created_at: story.created_at,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create story';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const uploadPostMedia = useCallback(
    async (file: File, caption?: string, scheduledAt?: string | null, opts?: { hideLikes?: boolean; commentsDisabled?: boolean }): Promise<UnifiedContent | null> => {
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const isScheduled = !!scheduledAt;

        // Create post record first
        const { data: post, error: postError } = await (supabase
          .from('posts' as any)
          .insert({
            author_id: user.id,
            content: caption || null,
            is_published: !isScheduled,
            scheduled_at: scheduledAt || null,
            hide_likes_count: opts?.hideLikes ?? false,
            comments_disabled: opts?.commentsDisabled ?? false,
          })
          .select()
          .single() as any);

        if (postError) throw postError;

        // Upload media to media server
        const uploadResult = await uploadMedia(file, { bucket: 'post-media' });
        const publicUrl = uploadResult.url;

        // Create media record
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
        const { data: media, error: mediaError } = await (supabase
          .from('post_media' as any)
          .insert({
            post_id: post.id,
            media_url: publicUrl,
            media_type: mediaType,
            sort_order: 0,
          })
          .select()
          .single() as any);

        if (mediaError) throw mediaError;

        return {
          id: post.id,
          content_type: 'post',
          author_id: user.id,
          caption,
          media_url: publicUrl,
          media_type: mediaType,
          created_at: post.created_at,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create post';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const uploadReelMedia = useCallback(
    async (
      file: File,
      caption?: string,
      options?: {
        clientPublishId?: string;
        musicTitle?: string | null;
        musicTrackId?: string | null;
        effectPreset?: string | null;
        faceEnhance?: boolean;
        aiEnhance?: boolean;
        maxDurationSec?: number;
        taggedUsers?: string[];
        locationName?: string | null;
        visibility?: 'public' | 'followers' | 'private';
        allowComments?: boolean;
        allowRemix?: boolean;
      }
    ): Promise<UnifiedContent | null> => {
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const clientPublishId = options?.clientPublishId || safeRandomUUID();
        const ext = file.name.split('.').pop() ?? 'mp4';
        const objectPath = `${user.id}/reels/${clientPublishId}/original.${ext.toLowerCase()}`;

        // Upload video to media server
        const uploadResult = await uploadMedia(file, { bucket: 'reels-media', path: objectPath });
        const publicUrl = uploadResult.url;

        const { data: reel, error: reelError } = await (supabase as any).rpc('create_reel_v1', {
          p_client_publish_id: clientPublishId,
          p_video_url: publicUrl,
          p_thumbnail_url: null,
          p_description: caption || null,
          p_music_title: options?.musicTitle?.trim() || null,
          p_music_track_id: options?.musicTrackId || null,
          p_effect_preset: options?.effectPreset?.trim() || null,
          p_face_enhance: options?.faceEnhance ?? false,
          p_ai_enhance: options?.aiEnhance ?? false,
          p_max_duration_sec: options?.maxDurationSec ?? null,
          p_visibility: options?.visibility || 'public',
          p_location_name: options?.locationName?.trim() || null,
          p_tagged_users: Array.isArray(options?.taggedUsers) ? options?.taggedUsers : [],
          p_allow_comments: options?.allowComments ?? true,
          p_allow_remix: options?.allowRemix ?? true,
        });

        if (reelError) throw reelError;

        return {
          id: reel.id,
          content_type: 'reel',
          author_id: user.id,
          caption,
          media_url: publicUrl,
          media_type: 'video',
          created_at: reel.created_at,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create reel';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const createLiveSession = useCallback(
    async (
      title: string,
      category: string,
      thumbnailUrl?: string
    ): Promise<UnifiedContent | null> => {
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data: session, error: sessionError } = await (supabase
          .from('live_sessions' as any)
          .insert({
            creator_id: user.id,
            title,
            category,
            thumbnail_url: thumbnailUrl || null,
            status: 'preparing', // Will change to 'live' when user starts broadcasting
            is_public: true,
          })
          .select()
          .single() as any);

        if (sessionError) throw sessionError;

        return {
          id: session.id.toString(),
          content_type: 'live',
          author_id: user.id,
          title,
          category,
          thumbnail_url: thumbnailUrl,
          created_at: session.created_at,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create live session';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [user]
  );

  const createContent = useCallback(
    async (options: ContentCreationOptions): Promise<UnifiedContent | null> => {
      switch (options.contentType) {
        case 'story':
          if (!options.mediaUrl) {
            setError('Media URL required for stories');
            return null;
          }
          return uploadStoryMedia(
            new File([options.mediaUrl], 'story'),
            options.caption
          );

        case 'post':
          if (!options.mediaUrl) {
            setError('Media URL required for posts');
            return null;
          }
          return uploadPostMedia(
            new File([options.mediaUrl], 'post'),
            options.caption
          );

        case 'reel':
          if (!options.mediaUrl) {
            setError('Media URL required for reels');
            return null;
          }
          return uploadReelMedia(
            new File([options.mediaUrl], 'reel'),
            options.caption
          );

        case 'live':
          if (!options.title) {
            setError('Title required for live sessions');
            return null;
          }
          return createLiveSession(
            options.title,
            options.category || 'other',
            options.thumbnailUrl
          );

        default:
          setError('Unknown content type');
          return null;
      }
    },
    [uploadStoryMedia, uploadPostMedia, uploadReelMedia, createLiveSession]
  );

  return {
    isLoading,
    error,
    activeContentType,
    setActiveContentType,
    createContent,
    uploadStoryMedia,
    uploadPostMedia,
    uploadReelMedia,
    createLiveSession,
    getStorageBucket,
  };
}
