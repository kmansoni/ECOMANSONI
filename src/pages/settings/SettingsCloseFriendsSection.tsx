/**
 * src/pages/settings/SettingsCloseFriendsSection.tsx
 * Управление списком близких друзей.
 * Позволяет добавлять/удалять пользователей из списка.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, UserPlus, UserMinus, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCloseFriends } from "@/hooks/useCloseFriends";
import { Input } from "@/components/ui/input";
import { logger } from "@/lib/logger";
import { SettingsHeader } from "./helpers";
import type { SectionProps } from "./types";

interface UserRow {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

export function SettingsCloseFriendsSection({
  isDark,
  onNavigate,
  onBack,
}: SectionProps) {
  const { user } = useAuth();
  const { closeFriends, loading: cfLoading, addFriend, removeFriend } = useCloseFriends();

  const [followers, setFollowers] = useState<UserRow[]>([]);
  const [loadingFollowers, setLoadingFollowers] = useState(true);
  const [search, setSearch] = useState("");

  // Загружаем подписчиков (followers) — кандидаты для close friends
  const fetchFollowers = useCallback(async () => {
    if (!user) return;
    setLoadingFollowers(true);
    try {
      const { data: followData, error: followError } = await supabase
        .from("followers")
        .select("follower_id")
        .eq("following_id", user.id)
        .limit(300);

      if (followError) throw followError;
      if (!followData?.length) {
        setFollowers([]);
        return;
      }

      const followerIds = followData.map((f) => f.follower_id);

      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, display_name, avatar_url, username")
        .in("user_id", followerIds)
        .limit(300);

      if (profilesError) throw profilesError;
      setFollowers((profilesData || []) as UserRow[]);
    } catch (err) {
      logger.error("[CloseFriendsSection] fetchFollowers error", { err });
    } finally {
      setLoadingFollowers(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFollowers();
  }, [fetchFollowers]);

  const filtered = search.trim()
    ? followers.filter((f) => {
        const q = search.toLowerCase();
        return (
          f.display_name?.toLowerCase().includes(q) ||
          f.username?.toLowerCase().includes(q)
        );
      })
    : followers;

  const closeFriendsSet = useMemo(() => new Set(closeFriends), [closeFriends]);

  // Сортируем: сперва close friends, потом остальные
  const sorted = [...filtered].sort((a, b) => {
    const aIs = closeFriendsSet.has(a.user_id) ? 0 : 1;
    const bIs = closeFriendsSet.has(b.user_id) ? 0 : 1;
    return aIs - bIs;
  });

  const handleToggle = useCallback(
    async (friendId: string) => {
      if (closeFriendsSet.has(friendId)) {
        await removeFriend(friendId);
      } else {
        await addFriend(friendId);
      }
    },
    [closeFriendsSet, addFriend, removeFriend],
  );

  const isLoading = cfLoading || loadingFollowers;

  return (
    <div className="flex flex-col h-full">
      <SettingsHeader
        title="Близкие друзья"
        isDark={isDark}
        currentScreen="close_friends"
        onBack={onBack}
        onClose={() => onBack()}
      />

      <div className="px-4 pb-3">
        <p className="text-sm text-muted-foreground mb-3">
          Делитесь историями только с близкими друзьями. Они отмечаются зелёным кольцом.
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск подписчиков…"
            className="pl-9"
          />
        </div>
      </div>

      {closeFriends.length > 0 && !search.trim() && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 text-sm text-emerald-500 font-medium">
            <Star className="w-4 h-4 fill-emerald-500" />
            <span>Близких друзей: {closeFriends.length}</span>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pb-8">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-24 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <UserPlus className="w-10 h-10 mb-3 opacity-50" />
            <p className="text-sm">
              {search.trim() ? "Никого не найдено" : "Нет подписчиков"}
            </p>
          </div>
        ) : (
          <div className="space-y-1 py-1">
            {sorted.map((follower) => {
              const isCF = closeFriendsSet.has(follower.user_id);
              return (
                <button
                  key={follower.user_id}
                  onClick={() => handleToggle(follower.user_id)}
                  className={cn(
                    "flex items-center gap-3 w-full p-2.5 rounded-xl transition-colors text-left",
                    isCF
                      ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                      : "hover:bg-muted/50",
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full overflow-hidden flex-shrink-0 ring-2",
                      isCF ? "ring-emerald-500" : "ring-transparent",
                    )}
                  >
                    {follower.avatar_url ? (
                      <img loading="lazy" src={follower.avatar_url}
                        alt=""
                        className="w-full h-full object-cover"
                        
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-medium">
                        {(follower.display_name || "?")[0].toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {follower.display_name || follower.username || "—"}
                    </p>
                    {follower.username && (
                      <p className="text-xs text-muted-foreground truncate">
                        @{follower.username}
                      </p>
                    )}
                  </div>

                  {isCF ? (
                    <UserMinus className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <UserPlus className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
