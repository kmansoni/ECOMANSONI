import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Loader2, Radio } from "lucide-react";
import { supabase, dbLoose } from "@/lib/supabase";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { fetchUserBriefMap, resolveUserBrief } from "@/lib/users/userBriefs";
import { logger } from "@/lib/logger";

interface LiveSession {
  id: string;
  title: string;
  category: string;
  thumbnail_url: string | null;
  viewer_count_current: number;
  creator_id: string;
  creator_name?: string;
  creator_avatar?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  general: "Общее",
  gaming: "Игры",
  music: "Музыка",
  education: "Образование",
  sport: "Спорт",
  cooking: "Кулинария",
  travel: "Путешествия",
};

/**
 * LiveTab — Лента активных прямых эфиров с Realtime subscription
 */
export function LiveTab() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSessions = async () => {
    try {
      const { data, error } = await dbLoose
        .from("live_sessions")
        .select("id, title, category, thumbnail_url, viewer_count_current, creator_id")
        .eq("status", "active")
        .order("viewer_count_current", { ascending: false })
        .limit(20);

      if (error) throw error;

      const rows = (data || []) as LiveSession[];

      // Загрузить аватары создателей
      const creatorIds = [...new Set(rows.map((r) => r.creator_id).filter(Boolean))];
      const briefMap = await fetchUserBriefMap(creatorIds);

      setSessions(
        rows.map((r) => ({
          ...r,
          creator_name: resolveUserBrief(r.creator_id, briefMap)?.display_name ?? "Стример",
          creator_avatar: resolveUserBrief(r.creator_id, briefMap)?.avatar_url ?? undefined,
        })),
      );
    } catch (err) {
      logger.error('[LiveTab] Ошибка загрузки эфиров', { error: err });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSessions();

    // Realtime подписка — обновлять список при любых изменениях live_sessions
    const sub = supabase
      .channel("live_tab_sessions")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "live_sessions",
      }, () => {
        void loadSessions();
      })
      .subscribe();

    return () => { sub.unsubscribe(); };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Radio className="w-12 h-12" />
        <p className="text-base font-medium">Сейчас нет активных эфиров</p>
        <p className="text-sm">Загляните позже!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
      {sessions.map((session) => (
        <button
          key={session.id}
          onClick={() => navigate(`/live/${session.id}`)}
          className="text-left rounded-2xl overflow-hidden border border-border bg-card hover:shadow-md transition-all active:scale-[0.98]"
        >
          {/* Превью */}
          <div className="aspect-video bg-gray-900 relative flex items-center justify-center">
            {session.thumbnail_url ? (
              <img
                src={session.thumbnail_url}
                alt={session.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <Avatar className="w-14 h-14 border-2 border-red-500">
                  <AvatarImage src={session.creator_avatar} />
                  <AvatarFallback className="bg-gray-700 text-white text-lg">
                    {session.creator_name?.slice(0, 2).toUpperCase() ?? "?"}
                  </AvatarFallback>
                </Avatar>
              </div>
            )}
            <Badge className="absolute top-2 left-2 bg-red-600 text-white animate-pulse">
              🔴 LIVE
            </Badge>
            <Badge variant="secondary" className="absolute bottom-2 right-2 text-xs">
              👁 {session.viewer_count_current} зрителей
            </Badge>
          </div>

          {/* Информация */}
          <div className="p-3 flex items-center gap-2">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarImage src={session.creator_avatar} />
              <AvatarFallback className="bg-muted text-xs">
                {session.creator_name?.slice(0, 2).toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="font-semibold text-sm line-clamp-1">{session.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {session.creator_name} · {CATEGORY_LABELS[session.category] ?? session.category}
              </p>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
