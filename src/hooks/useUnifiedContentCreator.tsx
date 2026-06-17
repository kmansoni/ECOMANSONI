import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { dbLoose } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import type { ContentType } from './useMediaEditor';
import { uploadMedia } from '@/lib/mediaUpload';
import { applyImageFilter } from '@/lib/applyImageFilter';
import { logger } from '@/lib/logger';
import { FILTERS } from '@/components/editor/photoFiltersModel';
import { adjustmentsToFilterStyle } from '@/components/feed/editorStateModel';
import type { CarouselSlide } from '@/components/feed/editorStateModel';

function safeRandomUUID(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (error) {
    logger.warn('[useUnifiedContentCreator] crypto.randomUUID недоступен', { error });
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface UnifiedContent {
  id: string;
  content_type: ContentType;
  author_id: string;
  title?: string;
  caption?: string;
  media_url?: string;
  media_type?: 'image' | 'video';
  thumbnail_url?: string;
  category?: string;
  created_at: string;
}

export interface ContentCreationOptions {
  contentType: ContentType;
  caption?: string;
  title?: string;
  category?: string;
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  thumbnailUrl?: string;
  isPublished?: boolean;
  isFollowersOnly?: boolean;
  carouselSlides?: CarouselSlide[];
}

export interface TextStoryOptions {
  text: string;
  backgroundId: string;
  fontId: string;
  align: 'left' | 'center' | 'right';
  color: string;
}

interface UseUnifiedContentCreatorReturn {
  isLoading: boolean;
  error: string | null;
  activeContentType: ContentType;
  setActiveContentType: (type: ContentType) => void;

  createContent: (options: ContentCreationOptions) => Promise<UnifiedContent | null>;

  uploadStoryMedia: (file: File, caption?: string) => Promise<UnifiedContent | null>;
  createTextStory: (options: TextStoryOptions) => Promise<UnifiedContent | null>;
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
  uploadCarouselPost: (
    slides: CarouselSlide[],
    caption?: string,
    scheduledAt?: string | null,
    opts?: { hideLikes?: boolean; commentsDisabled?: boolean }
  ) => Promise<UnifiedContent | null>;

  getStorageBucket: (contentType: ContentType) => string;
}

const TEXT_STORY_BACKGROUNDS: Record<string, { from: string; via: string; to: string }> = {
  'gradient-aurora': { from: '#0f172a', via: '#7c3aed', to: '#06b6d4' },
  sunset: { from: '#7f1d1d', via: '#f97316', to: '#facc15' },
  forest: { from: '#052e16', via: '#16a34a', to: '#bef264' },
  graphite: { from: '#020617', via: '#334155', to: '#111827' },
};

const TEXT_STORY_FONTS: Record<string, string> = {
  classic: 'Inter, Arial, sans-serif',
  serif: 'Georgia, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTextForSvg(text: string): string[] {
  const words = text.trim().replace(/\s+/g, ' ').split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 22 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 8);
}

function buildTextStoryFile(options: TextStoryOptions): File {
  const background = TEXT_STORY_BACKGROUNDS[options.backgroundId] ?? TEXT_STORY_BACKGROUNDS['gradient-aurora'];
  const fontFamily = TEXT_STORY_FONTS[options.fontId] ?? TEXT_STORY_FONTS.classic;
  const lines = wrapTextForSvg(options.text);
  const lineHeight = 78;
  const startY = 960 - ((lines.length - 1) * lineHeight) / 2;
  const textAnchor = options.align === 'left' ? 'start' : options.align === 'right' ? 'end' : 'middle';
  const x = options.align === 'left' ? 96 : options.align === 'right' ? 984 : 540;

  const tspans = lines
    .map((line, index) => `<tspan x="${x}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${background.from}"/>
      <stop offset="52%" stop-color="${background.via}"/>
      <stop offset="100%" stop-color="${background.to}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <rect width="1080" height="1920" fill="url(#glow)"/>
  <text font-family="${escapeXml(fontFamily)}" font-size="70" font-weight="800" fill="${escapeXml(options.color)}" text-anchor="${textAnchor}" dominant-baseline="middle" paint-order="stroke" stroke="#000000" stroke-opacity="0.24" stroke-width="10" stroke-linejoin="round">${tspans}</text>
</svg>`;

  return new File([svg], `text-story-${Date.now()}.svg`, { type: 'image/svg+xml' });
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
        return 'live-media';
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
        const uploadResult = await uploadMedia(file, { bucket: 'stories-media' });
        const publicUrl = uploadResult.url;

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

  const createTextStory = useCallback(
    async (options: TextStoryOptions): Promise<UnifiedContent | null> => {
      const text = options.text.trim();
      if (!text) {
        setError('Text required for story');
        return null;
      }

      const file = buildTextStoryFile({ ...options, text });
      return uploadStoryMedia(file, undefined);
    },
    [uploadStoryMedia]
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

        const { data: post, error: postError } = await dbLoose
          .from('posts')
          .insert({
            author_id: user.id,
            content: caption || null,
            is_published: !isScheduled,
            scheduled_at: scheduledAt || null,
            hide_likes_count: opts?.hideLikes ?? false,
            comments_disabled: opts?.commentsDisabled ?? false,
          })
          .select()
          .single();

        if (postError) throw postError;

        const uploadResult = await uploadMedia(file, { bucket: 'post-media' });
        const publicUrl = uploadResult.url;

        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
        const { data: media, error: mediaError } = await dbLoose
          .from('post_media')
          .insert({
            post_id: post.id,
            media_url: publicUrl,
            media_type: mediaType,
            sort_order: 0,
          })
          .select()
          .single();

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

        const uploadResult = await uploadMedia(file, { bucket: 'reels-media', path: objectPath });
        const publicUrl = uploadResult.url;

        const { data: reel, error: reelError } = await dbLoose.rpc('create_reel_v1', {
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
        let stableThumbnailUrl: string | undefined = thumbnailUrl ?? undefined;
        if (thumbnailUrl?.startsWith('blob:')) {
          try {
            const response = await fetch(thumbnailUrl);
            const blob = await response.blob();
            const ext = blob.type.startsWith('video/') ? 'jpg'
              : blob.type === 'image/png' ? 'png'
              : blob.type === 'image/gif' ? 'gif'
              : 'jpg';
            const file = new File([blob], `live-cover-${Date.now()}.${ext}`, { type: blob.type || 'image/jpeg' });
            const uploadResult = await uploadMedia(file, { bucket: 'live-media' });
            stableThumbnailUrl = uploadResult.url;
            try { URL.revokeObjectURL(thumbnailUrl); } catch {}
          } catch (err) {
            logger.warn('[useUnifiedContentCreator] Не удалось загрузить обложку эфира в Storage', { error: err });
            stableThumbnailUrl = undefined;
          }
        }

        const { data: session, error: sessionError } = await dbLoose
          .from('live_sessions')
          .insert({
            creator_id: user.id,
            title,
            category,
            thumbnail_url: stableThumbnailUrl,
            status: 'preparing',
            is_public: true,
          })
          .select()
          .single();

        if (sessionError) throw sessionError;

        return {
          id: session.id.toString(),
          content_type: 'live',
          author_id: user.id,
          title,
          category,
          thumbnail_url: stableThumbnailUrl,
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

  const uploadCarouselPost = useCallback(
    async (
      slides: CarouselSlide[],
      caption?: string,
      scheduledAt?: string | null,
      opts?: { hideLikes?: boolean; commentsDisabled?: boolean }
    ): Promise<UnifiedContent | null> => {
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      if (slides.length < 2) {
        setError('Карусель требует минимум 2 слайда');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const postInsert = await dbLoose
          .from('posts')
          .insert({
            author_id: user.id,
            content: caption || null,
            is_published: !scheduledAt,
            scheduled_at: scheduledAt || null,
            hide_likes_count: opts?.hideLikes ?? false,
            comments_disabled: opts?.commentsDisabled ?? false,
          })
          .select()
          .single();

        if (postInsert.error) throw postInsert.error;
        const post = postInsert.data;

        const processedSlides = await Promise.all(
          slides.map(async (slide) => {
            if (slide.mediaType === 'image') {
              const processed = await applyImageFilter(slide.file, {
                filterIdx: slide.filterIdx,
                filterIntensity: slide.filterIntensity,
                adjustments: slide.adjustments ?? {
                  brightness: 0,
                  contrast: 0,
                  saturation: 0,
                  warmth: 0,
                  shadows: 0,
                  highlights: 0,
                  vignette: 0,
                  sharpness: 0,
                  grain: 0,
                },
              });
              return { ...slide, processedFile: processed };
            }
            return { ...slide, processedFile: slide.file };
          }),
        );

        const CONCURRENCY = 3;
        for (let i = 0; i < processedSlides.length; i += CONCURRENCY) {
          const batch = processedSlides.slice(i, i + CONCURRENCY);
          await Promise.all(
            batch.map(async (slide) => {
              const uploadResult = await uploadMedia(slide.processedFile, {
                bucket: 'post-media',
                path: `${user.id}/carousel/${post.id}/${slide.id}`,
              });
              const mediaType = slide.mediaType === 'video' ? 'video' : 'image';
              const { error: mediaError } = await dbLoose
                .from('post_media')
                .insert({
                  post_id: post.id,
                  media_url: uploadResult.url,
                  media_type: mediaType,
                  sort_order: processedSlides.indexOf(slide),
                });
              if (mediaError) throw mediaError;
            }),
          );
        }

        return {
          id: post.id,
          content_type: 'post',
          author_id: user.id,
          caption,
          media_url: processedSlides[0].previewUrl,
          media_type: processedSlides[0].mediaType === 'video' ? 'video' : 'image',
          created_at: post.created_at,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create carousel post';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [user, uploadMedia, applyImageFilter],
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
            options.caption,
          );

        case 'post':
          if (!options.mediaUrl) {
            setError('Media URL required for posts');
            return null;
          }
          return uploadPostMedia(
            new File([options.mediaUrl], 'post'),
            options.caption,
          );

        case 'reel':
          if (!options.mediaUrl) {
            setError('Media URL required for reels');
            return null;
          }
          return uploadReelMedia(
            new File([options.mediaUrl], 'reel'),
            options.caption,
          );

        case 'carousel':
          if (!options.carouselSlides || options.carouselSlides.length < 2) {
            setError('Для карусели нужно минимум 2 слайда');
            return null;
          }
          return uploadCarouselPost(
            options.carouselSlides,
            options.caption,
            undefined,
          );

        case 'live':
          if (!options.title) {
            setError('Title required for live sessions');
            return null;
          }
          return createLiveSession(
            options.title,
            options.category || 'other',
            options.thumbnailUrl,
          );

        default:
          setError('Unknown content type');
          return null;
      }
    },
    [uploadStoryMedia, uploadPostMedia, uploadReelMedia, createLiveSession, uploadCarouselPost],
  );

  return {
    isLoading,
    error,
    activeContentType,
    setActiveContentType,
    createContent,
    uploadStoryMedia,
    createTextStory,
    uploadPostMedia,
    uploadReelMedia,
    createLiveSession,
    uploadCarouselPost,
    getStorageBucket,
  };
}
