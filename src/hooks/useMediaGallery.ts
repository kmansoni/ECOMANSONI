import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { fetchUserBriefMap, resolveUserBrief } from '@/lib/users/userBriefs';
import { dbLoose } from "@/lib/supabase";

export type MediaFilterType = 'all' | 'photos' | 'videos' | 'files' | 'voice' | 'links';

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video' | 'file' | 'voice' | 'link';
  created_at: string;
  filename?: string;
  filesize?: number;
  duration?: number;
  sender_name?: string;
  link_title?: string;
  link_description?: string;
  link_preview?: string;
  message_id?: string;
}

export interface GroupedMedia {
  month: string;
  items: MediaItem[];
}

const PAGE_SIZE = 50;

function filterToTypes(filter: MediaFilterType): string[] {
  switch (filter) {
    case 'photos': return ['image'];
    case 'videos': return ['video'];
    case 'files': return ['file'];
    case 'voice': return ['voice'];
    case 'links': return ['link'];
    case 'all': return ['image', 'video', 'file', 'voice'];
  }
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export function useMediaGallery(conversationId: string) {
  const [allMedia, setAllMedia] = useState<MediaItem[]>([]);
  const [filterType, setFilterType] = useState<MediaFilterType>('all');
  const [fileSearch, setFileSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [page, setPage] = useState<number>(0);
  const [viewerIndex, setViewerIndex] = useState<number>(-1);

  // Сброс при изменении conversationId или фильтра
  useEffect(() => {
    setAllMedia([]);
    setPage(0);
    setHasMore(true);
  }, [conversationId, filterType]);

  const loadMedia = useCallback(async (pageNum: number) => {
    if (!conversationId) return;
    setIsLoading(true);

    try {
      const from = pageNum * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      if (filterType === 'links') {
        // Ссылки — поиск по тексту сообщений
        const { data, error } = await supabase
          .from('messages')
          .select('id, content, created_at')
          .eq('conversation_id', conversationId)
          .not('content', 'is', null)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;

        const linkItems: MediaItem[] = [];
        for (const row of data ?? []) {
          const content = (row.content as string) ?? '';
          const matches = content.match(URL_REGEX);
          if (!matches) continue;
          linkItems.push({
            id: row.id as string,
            url: matches[0],
            type: 'link',
            created_at: row.created_at as string,
            link_title: matches[0],
            message_id: row.id as string,
          });
        }
        setAllMedia((prev) => (pageNum === 0 ? linkItems : [...prev, ...linkItems]));
        setHasMore(linkItems.length === PAGE_SIZE);
      } else {
        const types = filterToTypes(filterType);

        const { data, error } = await supabase
          .from('messages')
          .select('id, media_url, media_type, created_at, duration_seconds, sender_id, content')
          .eq('conversation_id', conversationId)
          .not('media_url', 'is', null)
          .in('media_type', types)
          .order('created_at', { ascending: false })
          .range(from, to);

        if (error) throw error;

        // Получаем имена отправителей для голосовых
        let senderNameMap = new Map<string, string>();
        const rows = data ?? [];
        if (filterType === 'voice' || filterType === 'all') {
          const senderIds = [...new Set(rows.map((r) => r.sender_id as string).filter(Boolean))];
          if (senderIds.length > 0) {
            const briefMap = await fetchUserBriefMap(senderIds);
            senderNameMap = new Map(
              senderIds.map((senderId) => {
                const brief = resolveUserBrief(senderId, briefMap);
                return [senderId, brief?.display_name ?? senderId] as const;
              })
            );
          }
        }

        const items: MediaItem[] = rows.map((row) => {
          const mediaUrl = (row.media_url as string) ?? '';
          const mediaType = (row.media_type as MediaItem['type']) ?? 'file';
          const filename = mediaUrl.split('/').pop() ?? 'file';

          return {
            id: row.id as string,
            url: mediaUrl,
            type: mediaType,
            created_at: row.created_at as string,
            filename: mediaType === 'file' ? filename : undefined,
            duration: mediaType === 'voice' ? ((row.duration_seconds as number) ?? 0) : undefined,
            sender_name: mediaType === 'voice'
              ? senderNameMap.get(row.sender_id as string)
              : undefined,
            message_id: row.id as string,
          };
        });

        setAllMedia((prev) => (pageNum === 0 ? items : [...prev, ...items]));
        setHasMore(items.length === PAGE_SIZE);
      }
    } catch {
      if (pageNum === 0) setAllMedia([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, filterType]);

  useEffect(() => {
    loadMedia(0);
  }, [loadMedia]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading) return;
    const nextPage = page + 1;
    setPage(nextPage);
    loadMedia(nextPage);
  }, [hasMore, isLoading, page, loadMedia]);

  // Фильтрация по имени файла (клиентская)
  const filteredMedia = useMemo(() => {
    if (!fileSearch.trim()) return allMedia;
    const q = fileSearch.toLowerCase();
    return allMedia.filter(
      (item) =>
        item.filename?.toLowerCase().includes(q) ||
        item.link_title?.toLowerCase().includes(q)
    );
  }, [allMedia, fileSearch]);

  // Группировка по месяцам
  const groupedByMonth = useMemo<GroupedMedia[]>(() => {
    const map = new Map<string, MediaItem[]>();
    for (const item of filteredMedia) {
      const date = new Date(item.created_at);
      const raw = format(date, 'LLLL yyyy', { locale: ru });
      const key = raw.charAt(0).toUpperCase() + raw.slice(1);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries()).map(([month, items]) => ({ month, items }));
  }, [filteredMedia]);

  const openViewer = useCallback((index: number) => {
    setViewerIndex(index);
  }, []);

  const closeViewer = useCallback(() => {
    setViewerIndex(-1);
  }, []);

  const navigateViewer = useCallback((direction: 'prev' | 'next') => {
    setViewerIndex((idx) => {
      if (idx === -1) return -1;
      const max = filteredMedia.length - 1;
      if (direction === 'prev') return idx > 0 ? idx - 1 : idx;
      return idx < max ? idx + 1 : idx;
    });
  }, [filteredMedia.length]);

  const downloadMedia = useCallback(async (item: MediaItem) => {
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = item.filename ?? `media-${item.id}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Освобождаем объект URL через 60 секунд
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  return {
    allMedia,
    filteredMedia,
    filterType,
    setFilterType,
    fileSearch,
    setFileSearch,
    groupedByMonth,
    currentIndex: viewerIndex,
    openViewer,
    closeViewer,
    navigateViewer,
    downloadMedia,
    isLoading,
    hasMore,
    loadMore,
  };
}
