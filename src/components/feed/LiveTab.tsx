import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface LiveSession {
  id: number;
  title: string;
  category: string;
  thumbnail_url: string | null;
  viewer_count_current: number;
  creator_id: string;
}

/**
 * LiveTab
 * Discovery tab showing active live streams
 * Displayed in ShortVideoFeed as a tab option
 */
export function LiveTab() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLiveSessions();

    // Refresh every 10 seconds
    const interval = setInterval(loadLiveSessions, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadLiveSessions() {
    try {
      const { data, error } = await supabase.rpc("get_active_live_sessions_v1", {
        p_limit: 20,
      });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error("Failed to load live sessions:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <Play className="w-12 h-12 text-muted-foreground" />
        <p className="text-muted-foreground">No live streams right now</p>
        <p className="text-sm text-muted-foreground">Check back soon!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
      {sessions.map((session) => (
        <Card
          key={session.id}
          className="cursor-pointer hover:shadow-lg transition-shadow overflow-hidden"
          onClick={() => navigate(`/live/${session.id}`)}
        >
          {/* Thumbnail */}
          <div className="aspect-video bg-gray-900 relative flex items-center justify-center">
            {session.thumbnail_url ? (
              <img
                src={session.thumbnail_url}
                alt={session.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-gray-400">📺 Live</div>
            )}

            {/* Live badge */}
            <Badge className="absolute top-2 left-2 bg-red-600 animate-pulse">
              🔴 LIVE
            </Badge>

            {/* Viewer count */}
            <Badge variant="secondary" className="absolute bottom-2 right-2">
              {session.viewer_count_current} watching
            </Badge>
          </div>

          {/* Info */}
          <CardContent className="p-3 space-y-2">
            <p className="font-semibold line-clamp-2 text-sm">{session.title}</p>
            <p className="text-xs text-muted-foreground">
              {session.category.charAt(0).toUpperCase() + session.category.slice(1)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
