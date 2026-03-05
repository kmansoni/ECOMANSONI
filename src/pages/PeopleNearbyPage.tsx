/**
 * PeopleNearbyPage — discover users nearby (opt-in geolocation).
 *
 * This is a stub implementation with the full UI structure.
 * Server-side matching requires a PostGIS-enabled Supabase function.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Users, RefreshCw, Eye, EyeOff, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { toast } from "sonner";

interface NearbyUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  distanceMeters: number;
  lastSeen: string;
}

function formatDistance(meters: number): string {
  if (meters < 100) return "< 100 м";
  if (meters < 1000) return `${Math.round(meters / 100) * 100} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

export function PeopleNearbyPage() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nearbyUsers, setNearbyUsers] = useState<NearbyUser[]>([]);
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setError("Геолокация недоступна в этом браузере");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setVisible(true);

      // TODO: Call Supabase RPC to find nearby users
      // const { data } = await supabase.rpc("find_nearby_users", { lat, lng, radius_meters: 5000 });

      // Stub data for UI demonstration
      setNearbyUsers([
        { id: "1", displayName: "Алексей", avatarUrl: null, distanceMeters: 150, lastSeen: "только что" },
        { id: "2", displayName: "Мария", avatarUrl: null, distanceMeters: 340, lastSeen: "2 мин назад" },
        { id: "3", displayName: "Дмитрий", avatarUrl: null, distanceMeters: 890, lastSeen: "5 мин назад" },
        { id: "4", displayName: "Елена", avatarUrl: null, distanceMeters: 1200, lastSeen: "10 мин назад" },
      ]);

      toast.success("Местоположение обновлено");
    } catch (err: any) {
      if (err?.code === 1) {
        setError("Доступ к геолокации запрещён. Разрешите в настройках браузера.");
      } else {
        setError("Не удалось определить местоположение");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const stopSharing = useCallback(() => {
    setVisible(false);
    setNearbyUsers([]);
    setPosition(null);
    toast.info("Вы больше не видны другим пользователям");
  }, []);

  // Auto-stop after 30 minutes
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(stopSharing, 30 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [visible, stopSharing]);

  return (
    <div className="flex flex-col h-screen bg-background dark:bg-[#0e1621]">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60 dark:border-white/10">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-muted dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground dark:text-white" />
        </button>
        <h1 className="font-semibold text-foreground dark:text-white">Люди рядом</h1>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Status card */}
        <div className="mx-4 mt-4 p-4 rounded-2xl bg-muted/30 dark:bg-white/5 border border-border/40 dark:border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-medium text-foreground dark:text-white">
                {visible ? "Вы видны другим" : "Вы скрыты"}
              </span>
            </div>
            <button
              onClick={visible ? stopSharing : requestLocation}
              disabled={loading}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                visible
                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              }`}
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : visible ? (
                <><EyeOff className="w-3.5 h-3.5" /> Скрыться</>
              ) : (
                <><Eye className="w-3.5 h-3.5" /> Показать себя</>
              )}
            </button>
          </div>

          {position && (
            <p className="text-xs text-muted-foreground dark:text-white/40">
              📍 {position.lat.toFixed(4)}, {position.lng.toFixed(4)}
            </p>
          )}

          <p className="text-xs text-muted-foreground dark:text-white/40 mt-1">
            Ваше местоположение видно только пока эта страница открыта. Автоотключение через 30 минут.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Nearby users list */}
        {visible && nearbyUsers.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between px-4 mb-2">
              <h2 className="text-sm font-medium text-foreground dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4" />
                Рядом с вами ({nearbyUsers.length})
              </h2>
              <button
                onClick={requestLocation}
                disabled={loading}
                className="w-8 h-8 rounded-full hover:bg-muted dark:hover:bg-white/10 flex items-center justify-center"
              >
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <AnimatePresence>
              {nearbyUsers.map((user, idx) => (
                <motion.button
                  key={user.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() => navigate(`/contact/${user.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/5 transition-colors"
                >
                  <GradientAvatar name={user.displayName} seed={user.id} size="md" />
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-medium text-foreground dark:text-white truncate">
                      {user.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground dark:text-white/40">
                      {user.lastSeen}
                    </p>
                  </div>
                  <span className="text-xs text-blue-400 font-medium flex-shrink-0">
                    {formatDistance(user.distanceMeters)}
                  </span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Empty state */}
        {visible && nearbyUsers.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <Users className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-semibold text-foreground dark:text-white mb-2">Никого рядом</h3>
            <p className="text-sm text-muted-foreground dark:text-white/50">
              Пока никто не делится своим местоположением поблизости
            </p>
          </div>
        )}

        {/* Not sharing state */}
        {!visible && !loading && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <MapPin className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="font-semibold text-foreground dark:text-white mb-2">Люди рядом</h3>
            <p className="text-sm text-muted-foreground dark:text-white/50 mb-4">
              Найдите пользователей mansoni поблизости. Нажмите «Показать себя» чтобы начать.
            </p>
            <Button onClick={requestLocation} disabled={loading}>
              <MapPin className="w-4 h-4 mr-2" />
              Начать поиск
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PeopleNearbyPage;
