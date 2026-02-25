import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ContentType } from './useMediaEditor';

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
  uploadPostMedia: (file: File, caption?: string) => Promise<UnifiedContent | null>;
  uploadReelMedia: (file: File, caption?: string) => Promise<UnifiedContent | null>;
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
        // Upload to Supabase Storage
        const fileName = `${user.id}/${Date.now()}_${file.name}`;
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
            caption: caption || null,
          })
          .select()
          .single() as any);

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
    async (file: File, caption?: string): Promise<UnifiedContent | null> => {
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Create post record first
        const { data: post, error: postError } = await (supabase
          .from('posts' as any)
          .insert({
            author_id: user.id,
            content: caption || null,
            is_published: true,
          })
          .select()
          .single() as any);

        if (postError) throw postError;

        // Upload media to Supabase Storage
        const fileName = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('post-media')
          .getPublicUrl(fileName);

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
    async (file: File, caption?: string): Promise<UnifiedContent | null> => {
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Upload video to Supabase Storage
        const fileName = `${user.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('reels-media')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('reels-media')
          .getPublicUrl(fileName);

        // Create reel record
        const { data: reel, error: reelError } = await (supabase
          .from('reels' as any)
          .insert({
            author_id: user.id,
            video_url: publicUrl,
            caption: caption || null,
            is_published: true,
          })
          .select()
          .single() as any);

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
