/**
 * PeopleNearbyPage — обнаружение пользователей рядом (opt-in геолокация).
 *
 * Реальная реализация через usePeopleNearby + Edge Function people-nearby + PostGIS.
 *
 * Приватность:
 *  - By default isSharing = false (пользователь явно включает)
 *  - Первое включение показывает предупреждение о приватности
 *  - navigator.geolocation.watchPosition() обновляет позицию и список каждые 60 секунд
 *  - При уходе со страницы (unmount) хук скрывает пользователя (cleanup)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Users, RefreshCw, Eye, EyeOff, Loader2, MessageSquare, AlertTriangle, X, Heart, SlidersHorizontal } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { GradientAvatar } from "@/components/ui/gradient-avatar";
import { toast } from "sonner";
import { usePeopleNearby, type NearbyUser } from "@/hooks/usePeopleNearby";
import { useDating } from "@/hooks/useDating";
import { SwipeStack } from "@/components/dating/SwipeStack";
import { DatingFilters } from "@/components/dating/DatingFilters";
import { cn } from "@/lib/utils";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDistance(meters: number): string {
  if (meters < 100) return "< 100 м";
  if (meters < 1000) return `${Math.round(meters / 100) * 100} м`;
  return `${(meters / 1000).toFixed(1)} км`;
}

// ---------------------------------------------------------------------------
// Privacy warning dialog
// ---------------------------------------------------------------------------

function PrivacyWarning({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50" onClick={onCancel}>
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25 }}
        className="w-full bg-zinc-900 rounded-t-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-white font-semibold text-base">Геолокация и приватность</h3>
            <p className="text-zinc-400 text-sm mt-1 leading-relaxed">
              Пока вы показываете своё местоположение, другие пользователи смогут видеть вас
              в радиусе до 50 км. Ваши точные координаты никогда не передаются другим —
              они видят только приблизительное расстояние.
            </p>
            <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
              Вы можете скрыться в любой момент, нажав «Скрыть меня».
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onCancel}
            className="flex-1 border-zinc-700 text-zinc-300"
          >
            Отмена
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            Включить
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserCard
// ---------------------------------------------------------------------------

function UserCard({ user, onMessage }: { user: NearbyUser; onMessage: (id: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 bg-zinc-800/60 rounded-xl px-4 py-3"
    >
      <GradientAvatar
        seed={user.id}
        name={user.displayName}
        avatarUrl={user.avatarUrl}
        size="md"
      />
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{user.displayName}</p>
        <p className="text-zinc-500 text-xs flex items-center gap-1 mt-0.5">
          <MapPin className="w-3 h-3" />
          {formatDistance(user.distanceMeters)}
        </p>
      </div>
      <button
        onClick={() => onMessage(user.id)}
        className="p-2 rounded-full bg-zinc-700 hover:bg-zinc-600 text-blue-400 transition-colors"
        title="Написать сообщение"
      >
        <MessageSquare className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const LOCATION_REFRESH_INTERVAL = 60_000; // 60 секунд

export function PeopleNearbyPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'nearby' | 'dating'>('nearby');
  const [showDatingFilters, setShowDatingFilters] = useState(false);
  const {
    nearbyUsers,
    isSharing,
    isLoading,
    error,
    startSharing,
    stopSharing,
    refreshNearby,
    updateMyLocation,
  } = usePeopleNearby();

  const dating = useDating();

  const [showPrivacyWarning, setShowPrivacyWarning] = useState(false);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lon: number } | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------------------------------------------------------------------------
  // watchPosition — авто-обновление позиции и списка
  // ---------------------------------------------------------------------------

  const startWatchingPosition = useCallback(() => {
    if (!("geolocation" in navigator)) return;

    // Очистить предыдущий watch
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setCurrentPosition({ lat, lon });

        // Обновить свою позицию (rate limited в хуке)
        await updateMyLocation(lat, lon);
      },
      (err) => {
        logger.warn("[PeopleNearbyPage] watchPosition error", { error: err.message });
      },
      { enableHighAccuracy: false, timeout: 15_000 },
    );
  }, [updateMyLocation]);

  // Периодическое обновление списка
  useEffect(() => {
    if (!isSharing || !currentPosition) return;

    // Первичная загрузка
    void refreshNearby(currentPosition.lat, currentPosition.lon);

    refreshTimerRef.current = setInterval(() => {
      void refreshNearby(currentPosition.lat, currentPosition.lon);
    }, LOCATION_REFRESH_INTERVAL);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [isSharing, currentPosition, refreshNearby]);

  // Cleanup watchPosition при unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Toggle sharing
  // ---------------------------------------------------------------------------

  const doStartSharing = useCallback(async () => {
    await startSharing();
    setPrivacyConfirmed(true);
    startWatchingPosition();
  }, [startSharing, startWatchingPosition]);

  const handleToggleSharing = useCallback(async () => {
    if (isSharing) {
      await stopSharing();
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setCurrentPosition(null);
      toast.success("Ваша геолокация скрыта");
      return;
    }

    // Первый раз — показать предупреждение
    if (!privacyConfirmed) {
      setShowPrivacyWarning(true);
      return;
    }

    await doStartSharing();
  }, [doStartSharing, isSharing, privacyConfirmed, stopSharing]);

  const handlePrivacyConfirm = useCallback(async () => {
    setShowPrivacyWarning(false);
    await doStartSharing();
  }, [doStartSharing]);

  // ---------------------------------------------------------------------------
  // Refresh button
  // ---------------------------------------------------------------------------

  const handleRefresh = useCallback(async () => {
    if (!currentPosition) {
      toast.error("Позиция неизвестна. Включите отображение.");
      return;
    }
    await refreshNearby(currentPosition.lat, currentPosition.lon);
  }, [currentPosition, refreshNearby]);

  // ---------------------------------------------------------------------------
  // Navigate to chat
  // ---------------------------------------------------------------------------

  const handleMessage = useCallback((userId: string) => {
    navigate(`/chat/${userId}`);
  }, [navigate]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-zinc-900 text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm px-4 py-3 flex items-center gap-3 border-b border-zinc-800">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-lg flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-400" />
          Люди рядом
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {activeTab === 'dating' && (
            <button
              onClick={() => setShowDatingFilters(true)}
              className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
              aria-label="Фильтры знакомств"
            >
              <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
            </button>
          )}
          {activeTab === 'nearby' && isSharing && currentPosition && (
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-2 rounded-full hover:bg-zinc-800 transition-colors"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
              ) : (
                <RefreshCw className="w-4 h-4 text-zinc-400" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 px-4">
        <button
          onClick={() => setActiveTab('nearby')}
          className={cn(
            "flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2",
            activeTab === 'nearby'
              ? "border-blue-500 text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300",
          )}
        >
          <Users className="w-4 h-4 inline mr-1.5" />
          Рядом
        </button>
        <button
          onClick={() => setActiveTab('dating')}
          className={cn(
            "flex-1 py-3 text-sm font-medium text-center transition-colors border-b-2",
            activeTab === 'dating'
              ? "border-pink-500 text-white"
              : "border-transparent text-zinc-500 hover:text-zinc-300",
          )}
        >
          <Heart className="w-4 h-4 inline mr-1.5" />
          Знакомства
        </button>
      </div>

      {/* Dating Tab */}
      {activeTab === 'dating' && (
        <div className="px-4 py-4">
          {dating.loading ? (
            <div className="flex flex-col items-center py-20 gap-3">
              <Loader2 className="w-8 h-8 text-pink-400 animate-spin" />
              <p className="text-zinc-400 text-sm">Загрузка анкет...</p>
            </div>
          ) : dating.cards.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Heart className="w-8 h-8 text-zinc-600" />
              </div>
              <p className="text-zinc-400 text-sm">Анкеты закончились</p>
              <p className="text-zinc-600 text-xs mt-1">Попробуйте изменить фильтры</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDatingFilters(true)}
                className="mt-4 border-zinc-700 text-zinc-300"
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Настроить фильтры
              </Button>
            </div>
          ) : (
            <SwipeStack
              cards={dating.cards}
              onSwipe={dating.swipe}
              loading={dating.loading}
              onRefresh={dating.refreshCards}
            />
          )}

          {showDatingFilters && (
            <DatingFilters
              filters={dating.filters}
              onUpdate={dating.updateFilters}
            />
          )}
        </div>
      )}

      {/* Nearby Tab */}
      {activeTab === 'nearby' && (
      <div className="px-4 py-4 space-y-4">
        {/* Toggle sharing */}
        <div
          className={cn(
            "flex items-center justify-between rounded-xl px-4 py-3 transition-colors",
            isSharing ? "bg-blue-600/20 border border-blue-600/40" : "bg-zinc-800/60",
          )}
        >
          <div className="flex items-center gap-3">
            {isSharing ? (
              <Eye className="w-5 h-5 text-blue-400" />
            ) : (
              <EyeOff className="w-5 h-5 text-zinc-500" />
            )}
            <div>
              <p className="text-white text-sm font-medium">
                {isSharing ? "Показываю себя" : "Не показываю себя"}
              </p>
              <p className="text-zinc-500 text-xs">
                {isSharing ? "Другие видят вас рядом" : "Tap чтобы включить"}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleSharing}
            disabled={isLoading}
            className={cn(
              "relative w-12 h-6 rounded-full transition-colors duration-200",
              isSharing ? "bg-blue-600" : "bg-zinc-600",
            )}
          >
            <span
              className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200",
                isSharing ? "translate-x-7" : "translate-x-1",
              )}
            />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Not sharing info */}
        {!isSharing && !error && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-400 text-sm">
              Включите отображение, чтобы увидеть людей рядом
            </p>
          </div>
        )}

        {/* Loading */}
        {isSharing && isLoading && nearbyUsers.length === 0 && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-zinc-400 text-sm">Поиск людей рядом...</p>
          </div>
        )}

        {/* Empty state */}
        {isSharing && !isLoading && nearbyUsers.length === 0 && !error && (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-zinc-600" />
            </div>
            <p className="text-zinc-400 text-sm">Никого нет поблизости</p>
            <p className="text-zinc-600 text-xs mt-1">В радиусе 5 км не найдено пользователей</p>
          </div>
        )}

        {/* Users list */}
        {nearbyUsers.length > 0 && (
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs px-1">
              {nearbyUsers.length} {nearbyUsers.length === 1 ? "пользователь" : "пользователей"} рядом
            </p>
            <AnimatePresence>
              {nearbyUsers.map(user => (
                <UserCard key={user.id} user={user} onMessage={handleMessage} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
      )}

      {/* Privacy warning */}
      <AnimatePresence>
        {showPrivacyWarning && (
          <PrivacyWarning
            onConfirm={handlePrivacyConfirm}
            onCancel={() => setShowPrivacyWarning(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
