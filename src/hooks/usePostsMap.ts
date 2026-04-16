/**
 * usePostsMap — посты с геотегами для отображения на карте.
 *
 * - posts: массив постов с координатами в текущих bounds
 * - loading: состояние загрузки
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { dbLoose } from "@/lib/supabase";

export interface MapPost {
  id: string;
  latitude: number;
  longitude: number;
  thumbnail_url: string;
  author_id: string;
  created_at: string;
  content: string | null;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usePostsMap(bounds?: MapBounds) {
  const [posts, setPosts] = useState<MapPost[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);

      let query = dbLoose
        .from('posts')
        .select('id, latitude, longitude, author_id, created_at, content, post_media(media_url, media_type, sort_order)')
        .eq('is_published', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (bounds) {
        query = query
          .gte('latitude', bounds.south)
          .lte('latitude', bounds.north)
          .gte('longitude', bounds.west)
          .lte('longitude', bounds.east);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('[usePostsMap] Ошибка загрузки постов', { error });
        return;
      }

      const mapped: MapPost[] = (data ?? []).map(
        (p: { id: string; latitude: number; longitude: number; author_id: string; created_at: string; content: string | null; post_media?: { media_url: string }[] }) => ({
          id: p.id,
          latitude: p.latitude,
          longitude: p.longitude,
          author_id: p.author_id,
          created_at: p.created_at,
          content: p.content,
          thumbnail_url: p.post_media?.[0]?.media_url ?? '',
        })
      );

      setPosts(mapped);
    } catch (err) {
      logger.error('[usePostsMap] Непредвиденная ошибка', { error: err });
    } finally {
      setLoading(false);
    }
  }, [bounds?.north, bounds?.south, bounds?.east, bounds?.west]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  return { posts, loading, refetch: loadPosts } as const;
}
