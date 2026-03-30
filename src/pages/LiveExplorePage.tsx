/**
 * LiveExplorePage — страница обнаружения прямых эфиров.
 *
 * Архитектура:
 *  - Прямые запросы к supabase (live_sessions + profiles JOIN) через React Query,
 *    поскольку LiveKit Gateway API требует VITE_LIVESTREAM_GATEWAY_URL.
 *  - RLS гарантирует видимость только is_public = true сессий.
 *  - Realtime-подписка на INSERT/UPDATE live_sessions для мгновенного обновления
 *    без polling (refetchInterval = 30s как fallback).
 *  - Три секции: активные, запланированные, рекомендуемые стримеры.
 *  - Pull-to-refresh через кнопку (touch-based PTR требует нативного shell).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio, Search, RefreshCw, Bell, BellOff, Clock, Users, X } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { buildProfilePath } from '@/lib/users/profileLinks';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionRow {
  id: number;
  title: string;
  category: string;
  thumbnail_url: string | null;
  cover_url: string | null;
  status: string;
  started_at: string | null;
  scheduled_at: string | null;
  actual_start_at: string | null;
  viewer_count_current: number | null;
  total_viewers: number;
  tags: string[];
  creator_id: string;
  profiles: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface RecommendedStreamer {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  streams_count: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = ['Все', 'music', 'gaming', 'chat', 'performance', 'other'];
const CATEGORY_LABELS: Record<string, string> = {
  'Все': 'Все',
  music: 'Музыка',
  gaming: 'Игры',
  chat: 'Общение',
  performance: 'Выступление',
  other: 'Другое',
};

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchActiveSessions(category: string, search: string): Promise<SessionRow[]> {
  let query = supabase
    .from('live_sessions')
    .select(`
      id, title, category, thumbnail_url, cover_url, status,
      started_at, scheduled_at, actual_start_at,
      viewer_count_current, total_viewers, tags, creator_id,
      profiles!live_sessions_creator_id_fkey(id, username, display_name, avatar_url)
    `)
    .in('status', ['live', 'preparing'])
    .eq('is_public', true)
    .order('viewer_count_current', { ascending: false })
    .limit(30);

  if (category !== 'Все') {
    query = query.eq('category', category);
  }
  if (search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as SessionRow[];
}

async function fetchScheduledSessions(category: string, search: string): Promise<SessionRow[]> {
  const now = new Date().toISOString();
  let query = supabase
    .from('live_sessions')
    .select(`
      id, title, category, thumbnail_url, cover_url, status,
      started_at, scheduled_at, actual_start_at,
      viewer_count_current, total_viewers, tags, creator_id,
      profiles!live_sessions_creator_id_fkey(id, username, display_name, avatar_url)
    `)
    .eq('status', 'scheduled')
    .eq('is_public', true)
    .gt('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(20);

  if (category !== 'Все') {
    query = query.eq('category', category);
  }
  if (search.trim()) {
    query = query.ilike('title', `%${search.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as SessionRow[];
}

async function fetchRecommendedStreamers(): Promise<RecommendedStreamer[]> {
  // Стримеры с наибольшим количеством сессий за последние 30 дней
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('live_sessions')
    .select('creator_id, profiles!live_sessions_creator_id_fkey(id, username, display_name, avatar_url)')
    .gte('created_at', since)
    .eq('is_public', true)
    .limit(100);

  if (error) throw error;

  // Группируем по creator_id, считаем количество стримов
  const countMap = new Map<string, { profile: NonNullable<SessionRow['profiles']>; count: number }>();
  for (const row of (data ?? []) as unknown as SessionRow[]) {
    if (!row.profiles) continue;
    const existing = countMap.get(row.creator_id);
    if (existing) {
      existing.count += 1;
    } else {
      countMap.set(row.creator_id, { profile: row.profiles, count: 1 });
    }
  }

  return Array.from(countMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(({ profile, count }) => ({
      id: profile.id,
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      streams_count: count,
    }));
}

async function toggleReminder(sessionId: number, userId: string, hasReminder: boolean): Promise<void> {
  if (hasReminder) {
    const { error } = await supabase
      .from('live_schedule_reminders')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    // notify_at = 15 минут до эфира (заглушка notify_at = now если нет расписания)
    const notifyAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from('live_schedule_reminders')
      .insert({ session_id: sessionId, user_id: userId, notify_at: notifyAt });
    if (error) throw error;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActiveStreamCard({ session }: { session: SessionRow }) {
  const navigate = useNavigate();
  const profile = session.profiles;
  const name = profile?.display_name || profile?.username || 'Стример';
  const thumb = session.thumbnail_url || session.cover_url;
  const viewers = session.viewer_count_current ?? 0;
  const startedAt = session.actual_start_at || session.started_at;

  return (
    <button
      onClick={() => navigate(`/live/${session.id}`)}
      className="group relative w-full text-left rounded-xl overflow-hidden bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      aria-label={`Смотреть ${name}: ${session.title}`}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-zinc-800">
        {thumb ? (
          <img
            src={thumb}
            alt={session.title}
            className="absolute inset-0 h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-600">
            <Radio className="h-10 w-10 opacity-40" aria-hidden />
          </div>
        )}
        {/* LIVE badge */}
        <div className="absolute top-2 left-2">
          <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
        </div>
        {/* Viewer count */}
        <div className="absolute top-2 right-2">
          <span className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
            <Users className="h-3 w-3" aria-hidden />
            {viewers >= 1000 ? `${(viewers / 1000).toFixed(1)}K` : viewers}
          </span>
        </div>
        {/* Duration */}
        {startedAt && (
          <div className="absolute bottom-2 right-2">
            <span className="rounded bg-black/60 px-1.5 py-0.5 text-xs text-zinc-300 backdrop-blur-sm">
              {formatDistanceToNow(new Date(startedAt), { locale: ru })}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      {/* Info */}
      <div className="flex items-center gap-2 p-2">
        <Avatar className="h-8 w-8 shrink-0 border border-red-500/50">
          <AvatarImage src={profile?.avatar_url ?? undefined} alt={name} />
          <AvatarFallback className="text-xs">{name[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate leading-tight">{session.title}</p>
          <p className="text-xs text-zinc-400 truncate">{name}</p>
        </div>
        {session.category && (
          <Badge variant="secondary" className="shrink-0 text-xs bg-zinc-700 text-zinc-300">
            {CATEGORY_LABELS[session.category] ?? session.category}
          </Badge>
        )}
      </div>
    </button>
  );
}

function ActiveStreamCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-zinc-900">
      <Skeleton className="aspect-video w-full" />
      <div className="flex items-center gap-2 p-2">
        <Skeleton className="h-8 w-8 rounded-full shrink-0" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    </div>
  );
}

function ScheduledStreamCard({
  session,
  userId,
}: {
  session: SessionRow;
  userId: string | null;
}) {
  const navigate = useNavigate();
  const [hasReminder, setHasReminder] = useState(false);
  const [loading, setLoading] = useState(false);
  const profile = session.profiles;
  const name = profile?.display_name || profile?.username || 'Стример';
  const thumb = session.thumbnail_url || session.cover_url;

  const handleReminder = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!userId) {
        toast.error('Войдите, чтобы получить напоминание');
        return;
      }
      setLoading(true);
      try {
        await toggleReminder(session.id, userId, hasReminder);
        setHasReminder((v) => !v);
        toast.success(hasReminder ? 'Напоминание отключено' : 'Напомним перед эфиром!');
      } catch (_err) {
        toast.error('Не удалось изменить напоминание');
      } finally {
        setLoading(false);
      }
    },
    [session.id, userId, hasReminder],
  );

  return (
    <div className="flex items-center gap-3 rounded-xl bg-zinc-900 p-3">
      {/* Thumbnail preview */}
      <button
        onClick={() => navigate(`/live/${session.id}`)}
        className="relative h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-zinc-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        aria-label={`Подробнее: ${session.title}`}
      >
        {thumb ? (
          <img src={thumb} alt={session.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <Clock className="h-6 w-6 opacity-40" aria-hidden />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <span className="rounded-full border border-white/40 px-1.5 py-0.5 text-[10px] font-bold text-white">
            СКОРО
          </span>
        </div>
      </button>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white truncate">{session.title}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
          <Avatar className="h-4 w-4">
            <AvatarImage src={profile?.avatar_url ?? undefined} alt={name} />
            <AvatarFallback className="text-[8px]">{name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="truncate">{name}</span>
        </div>
        {session.scheduled_at && (
          <p className="mt-0.5 text-xs text-zinc-500">
            {format(new Date(session.scheduled_at), 'd MMM, HH:mm', { locale: ru })}
          </p>
        )}
      </div>

      {/* Reminder button */}
      <button
        onClick={handleReminder}
        disabled={loading}
        className={cn(
          'shrink-0 flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
          hasReminder
            ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            : 'bg-red-600/20 border border-red-600/30 text-red-400 hover:bg-red-600/30',
        )}
        aria-label={hasReminder ? 'Отключить напоминание' : 'Напомнить'}
        aria-pressed={hasReminder}
      >
        {hasReminder ? (
          <><BellOff className="h-3 w-3" aria-hidden /> Отключить</>
        ) : (
          <><Bell className="h-3 w-3" aria-hidden /> Напомнить</>
        )}
      </button>
    </div>
  );
}

function RecommendedStreamerCard({ streamer }: { streamer: RecommendedStreamer }) {
  const navigate = useNavigate();
  const name = streamer.display_name || streamer.username;
  return (
    <button
      onClick={() => navigate(buildProfilePath({ username: streamer.username }))}
      className="flex shrink-0 flex-col items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-xl p-2"
      aria-label={`Профиль ${name}`}
    >
      <Avatar className="h-14 w-14 border-2 border-red-500/60">
        <AvatarImage src={streamer.avatar_url ?? undefined} alt={name} />
        <AvatarFallback>{name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <p className="w-16 text-center text-xs font-medium text-white truncate">{name}</p>
      <p className="text-[10px] text-zinc-500">{streamer.streams_count} эфиров</p>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LiveExplorePage() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');
  const [searchValue, setSearchValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Resolve current user id once
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  // Debounce search input: 400ms
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setSearchQuery(searchValue);
    }, 400);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchValue]);

  const activeKey = ['live-explore-active', selectedCategory, searchQuery];
  const scheduledKey = ['live-explore-scheduled', selectedCategory, searchQuery];
  const recommendedKey = ['live-explore-recommended'];

  const {
    data: activeSessions,
    isLoading: activeLoading,
    refetch: refetchActive,
  } = useQuery({
    queryKey: activeKey,
    queryFn: () => fetchActiveSessions(selectedCategory, searchQuery),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const {
    data: scheduledSessions,
    isLoading: scheduledLoading,
    refetch: refetchScheduled,
  } = useQuery({
    queryKey: scheduledKey,
    queryFn: () => fetchScheduledSessions(selectedCategory, searchQuery),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: recommended, isLoading: recommendedLoading } = useQuery({
    queryKey: recommendedKey,
    queryFn: fetchRecommendedStreamers,
    staleTime: 5 * 60_000,
  });

  // Realtime subscription — invalidate active sessions on changes
  useEffect(() => {
    const channel = supabase
      .channel('live-explore-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_sessions' },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['live-explore-active'] });
          void queryClient.invalidateQueries({ queryKey: ['live-explore-scheduled'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refetchActive(), refetchScheduled()]);
    setIsRefreshing(false);
  }, [refetchActive, refetchScheduled]);

  const handleClearSearch = () => {
    setSearchValue('');
    setSearchQuery('');
  };

  const hasActiveResults = (activeSessions?.length ?? 0) > 0;
  const hasScheduledResults = (scheduledSessions?.length ?? 0) > 0;
  const hasNoResults =
    !activeLoading && !scheduledLoading && !hasActiveResults && !hasScheduledResults && searchQuery;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold">Прямые эфиры</h1>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label="Обновить список"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} aria-hidden />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Поиск по названию эфира…"
            className="pl-9 pr-9 bg-muted border-transparent"
            aria-label="Поиск эфиров"
          />
          {searchValue && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Очистить поиск"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>

        {/* Category chips */}
        <div
          className="flex gap-2 overflow-x-auto pb-1 no-scrollbar mt-3"
          role="tablist"
          aria-label="Фильтр по категориям"
        >
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              role="tab"
              aria-selected={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                selectedCategory === cat
                  ? 'bg-red-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {CATEGORY_LABELS[cat] ?? cat}
            </button>
          ))}
        </div>
      </header>

      <main className="px-4 py-4 space-y-8 pb-24">
        {/* No results */}
        {hasNoResults && (
          <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
            <Search className="h-10 w-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">Ничего не найдено по запросу «{searchQuery}»</p>
            <Button variant="ghost" size="sm" onClick={handleClearSearch}>
              Сбросить поиск
            </Button>
          </div>
        )}

        {/* Секция "Сейчас в эфире" */}
        <section aria-label="Сейчас в эфире">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden />
              Сейчас в эфире
            </h2>
            {!activeLoading && (
              <span className="text-xs text-muted-foreground">
                {activeSessions?.length ?? 0} эфиров
              </span>
            )}
          </div>

          {activeLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ActiveStreamCardSkeleton key={i} />
              ))}
            </div>
          ) : hasActiveResults ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {activeSessions!.map((s) => (
                <ActiveStreamCard key={s.id} session={s} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground rounded-xl bg-muted/30">
              <Radio className="h-8 w-8 opacity-30" aria-hidden />
              <p className="text-sm">Нет активных эфиров</p>
            </div>
          )}
        </section>

        {/* Секция "Запланированные эфиры" */}
        <section aria-label="Запланированные эфиры">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-400" aria-hidden />
              Запланированные эфиры
            </h2>
          </div>

          {scheduledLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-muted/30 p-3">
                  <Skeleton className="h-16 w-28 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-7 w-24 rounded-full shrink-0" />
                </div>
              ))}
            </div>
          ) : hasScheduledResults ? (
            <div className="space-y-3">
              {scheduledSessions!.map((s) => (
                <ScheduledStreamCard key={s.id} session={s} userId={currentUserId} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground rounded-xl bg-muted/30">
              <Clock className="h-8 w-8 opacity-30" aria-hidden />
              <p className="text-sm">Нет запланированных эфиров</p>
            </div>
          )}
        </section>

        {/* Секция "Рекомендуемые стримеры" */}
        <section aria-label="Рекомендуемые стримеры">
          <h2 className="text-base font-bold mb-3">Рекомендуемые стримеры</h2>
          {recommendedLoading ? (
            <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex shrink-0 flex-col items-center gap-1.5 p-2">
                  <Skeleton className="h-14 w-14 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-2.5 w-10" />
                </div>
              ))}
            </div>
          ) : (recommended?.length ?? 0) > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {recommended!.map((s) => (
                <RecommendedStreamerCard key={s.id} streamer={s} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground rounded-xl bg-muted/30">
              <Users className="h-8 w-8 opacity-30" aria-hidden />
              <p className="text-sm">Нет данных о стримерах</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
