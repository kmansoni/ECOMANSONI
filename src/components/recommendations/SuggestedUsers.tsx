import { useEffect, useState, useRef } from 'react';
import { X, UserPlus, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRecommendations } from '@/hooks/useRecommendations';
import { tracker } from '@/lib/recommendations/tracker';
import { DismissedSuggestion } from './DismissedSuggestion';

interface SuggestedUser {
  id: string;
  username: string;
  full_name?: string;
  avatar_url?: string;
  reason?: string;
  similarityScore?: number;
}

interface SuggestedUsersProps {
  className?: string;
}

const REASON_LABELS: Record<string, string> = {
  similar_interests: 'Похожие интересы',
  followed_by: 'Подписан на вас',
  popular: 'Популярный',
  similar_users: 'Среди подписчиков',
};

export function SuggestedUsers({ className = '' }: SuggestedUsersProps) {
  const { getRecommendedUsers } = useRecommendations();
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const result = await getRecommendedUsers(15);
        setUsers(result);
      } finally {
        setLoading(false);
      }
    })();
  }, [getRecommendedUsers]);

  const visible = users.filter((u) => !hidden.has(u.id));

  async function handleFollow(userId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await (supabase as any).from('followers').upsert({ follower_id: user.id, following_id: userId });
    tracker.trackFollow(userId);
    setFollowedIds((prev) => new Set([...prev, userId]));
  }

  function handleHide(userId: string) {
    setHidden((prev) => new Set([...prev, userId]));
  }

  if (loading) {
    return (
      <div className={`${className} py-4`} aria-label="Загрузка рекомендаций">
        <div className="flex gap-3 overflow-hidden px-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-36 h-44 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!visible.length) return null;

  return (
    <section className={`${className}`} aria-label="Рекомендуемые пользователи">
      <div className="flex items-center justify-between px-4 mb-3">
        <h2 className="text-sm font-semibold text-foreground">Рекомендуемые для вас</h2>
        <button
          className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          aria-label="Посмотреть всех рекомендуемых"
        >
          Все <ChevronRight className="inline w-3 h-3" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scrollbar-none"
        role="list"
        aria-label="Список рекомендуемых пользователей"
      >
        {visible.map((user) => (
          <div
            key={user.id}
            role="listitem"
            className="flex-shrink-0 w-36 bg-card border border-border rounded-xl p-3 flex flex-col items-center gap-2 snap-start relative"
          >
            <DismissedSuggestion
              userId={user.id}
              onDismiss={handleHide}
              className="absolute top-2 right-2"
            />

            <div className="w-14 h-14 rounded-full overflow-hidden bg-muted flex items-center justify-center mt-2">
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={`Аватар ${user.username}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground" aria-hidden="true">
                  {(user.username?.[0] ?? '?').toUpperCase()}
                </span>
              )}
            </div>

            <div className="text-center min-w-0 w-full">
              <p className="text-xs font-medium text-foreground truncate">{user.full_name || user.username || 'Пользователь'}</p>
              <p className="text-xs text-muted-foreground truncate">@{user.username || '...'}</p>
            </div>

            {user.reason && (
              <p className="text-[10px] text-muted-foreground text-center leading-tight">
                {REASON_LABELS[user.reason] ?? user.reason}
              </p>
            )}

            <button
              onClick={() => handleFollow(user.id)}
              disabled={followedIds.has(user.id)}
              className="w-full mt-auto flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              style={{
                background: followedIds.has(user.id) ? 'var(--muted)' : 'var(--primary)',
                color: followedIds.has(user.id) ? 'var(--muted-foreground)' : 'var(--primary-foreground)',
              }}
              aria-label={followedIds.has(user.id) ? `Вы подписаны на ${user.username || 'пользователя'}` : `Подписаться на ${user.username || 'пользователя'}`}
              aria-pressed={followedIds.has(user.id)}
            >
              {!followedIds.has(user.id) && <UserPlus className="w-3 h-3" aria-hidden="true" />}
              {followedIds.has(user.id) ? 'Подписан' : 'Подписаться'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
