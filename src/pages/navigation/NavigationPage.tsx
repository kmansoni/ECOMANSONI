import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Volume2, VolumeX, Car, Search, Flag, CheckCircle2, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGeolocation } from '@/hooks/navigation/useGeolocation';
import { useNavigation } from '@/hooks/navigation/useNavigation';
import { NavigatorMap } from '@/components/navigation/NavigatorMap';
import { SearchPanel } from '@/components/navigation/SearchPanel';
import { RouteOverview } from '@/components/navigation/RouteOverview';
import { NavigationPanel } from '@/components/navigation/NavigationPanel';
import { AddPlaceSheet } from '@/components/navigation/AddPlaceSheet';
import { SavePlaceSheet } from '@/components/navigation/SavePlaceSheet';
import { loadSpeedCameras, getCamerasOnRoute } from '@/lib/navigation/speedCameras';
import type { SavedPlace } from '@/types/navigation';

const glassBtn = cn(
  'w-11 h-11 rounded-xl',
  'bg-gray-900/80 backdrop-blur-md border border-white/10',
  'flex items-center justify-center',
  'transition-all active:scale-95 hover:bg-gray-800/90',
  'shadow-lg shadow-black/30'
);

export default function NavigationPage() {
  const routerNav = useNavigate();
  const geo = useGeolocation();
  const nav = useNavigation();
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [savePlaceTarget, setSavePlaceTarget] = useState<SavedPlace | null>(null);

  // Загрузить камеры при монтировании
  useEffect(() => { loadSpeedCameras(); }, []);

  // Start GPS on mount
  useEffect(() => {
    geo.startTracking();
    return () => geo.stopTracking();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync geolocation → navigation state
  useEffect(() => {
    if (geo.position) {
      nav.updatePosition(geo.position, geo.heading, geo.speed);
    }
  }, [geo.position, geo.heading, geo.speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapCenter = nav.phase === 'navigating' && nav.currentPosition
    ? nav.currentPosition
    : nav.currentPosition ?? geo.position ?? { lat: 55.7558, lng: 37.6173 };

  const mapZoom = nav.phase === 'navigating' ? 17 : 14;

  const routeCameras = useMemo(
    () => nav.route ? getCamerasOnRoute(nav.route.geometry) : [],
    [nav.route]
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-950">
      {/* Full-screen map */}
      <NavigatorMap
        center={mapCenter}
        zoom={mapZoom}
        heading={nav.currentHeading}
        isNorthUp={nav.isNorthUp}
        userPosition={nav.currentPosition}
        routeSegments={nav.route?.segments ?? []}
        alternativeRoutes={nav.alternativeRoutes}
        speedCameras={routeCameras}
        destinationMarker={nav.destination?.coordinates ?? null}
        onCenterOnUser={() => {
          if (geo.position) nav.updatePosition(geo.position, geo.heading, geo.speed);
        }}
        onToggleOrientation={nav.toggleOrientation}
        className="absolute inset-0"
      />

      {/* Header controls */}
      <div className="absolute top-0 left-0 right-0 z-[900] flex items-center justify-between p-3 pt-safe">
        <button onClick={() => routerNav(-1)} className={glassBtn} aria-label="Назад">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>

        <div className="flex items-center gap-2">
          {/* Voice toggle */}
          {typeof window !== 'undefined' && window.speechSynthesis && (
            <button onClick={nav.toggleVoice} className={glassBtn} aria-label="Голос">
              {nav.voiceEnabled
                ? <Volume2 className="h-5 w-5 text-blue-400" />
                : <VolumeX className="h-5 w-5 text-gray-400" />
              }
            </button>
          )}

          {/* Taxi shortcut (only in idle) */}
          {nav.phase === 'idle' && (
            <button onClick={() => routerNav('/taxi')} className={glassBtn} aria-label="Такси">
              <Car className="h-5 w-5 text-amber-400" />
            </button>
          )}
        </div>
      </div>

      {/* Phase: Idle — search bar */}
      {nav.phase === 'idle' && (
        <button
          onClick={nav.openSearch}
          className={cn(
            'absolute top-[4.5rem] left-3 right-3 z-[800]',
            'bg-gray-900/80 backdrop-blur-md',
            'rounded-2xl px-4 py-3.5',
            'border border-white/10',
            'flex items-center gap-3',
            'shadow-lg shadow-black/30',
            'transition-all active:scale-[0.99] hover:bg-gray-800/90'
          )}
        >
          <Search className="w-5 h-5 text-gray-400" />
          <span className="text-gray-400 text-sm">Куда едем?</span>
        </button>
      )}

      {/* Phase: Search */}
      {nav.phase === 'search' && (
        <SearchPanel
          favorites={nav.favorites}
          recents={nav.recents}
          currentPosition={nav.currentPosition}
          onSelectDestination={nav.selectDestination}
          onClose={nav.closeSearch}
          onAddPlace={() => setShowAddPlace(true)}
          onSavePlace={(place) => setSavePlaceTarget(place)}
        />
      )}

      {/* Phase: Route preview */}
      {nav.phase === 'route_preview' && nav.route && (
        <RouteOverview
          route={nav.route}
          alternatives={nav.alternativeRoutes}
          loading={nav.loading}
          onSelectRoute={nav.selectRoute}
          onStart={nav.startNavigation}
          onCancel={nav.stopNavigation}
        />
      )}

      {/* Phase: Navigating */}
      {nav.phase === 'navigating' && (
        <NavigationPanel
          speed={nav.currentSpeed}
          speedLimit={nav.speedLimit}
          nextInstruction={nav.nextInstruction}
          followingInstruction={nav.followingInstruction}
          distanceToNextTurn={nav.distanceToNextTurn}
          remainingDistance={nav.remainingDistance}
          remainingTime={nav.remainingTime}
          eta={nav.eta}
          nearbyCamera={nav.nearbyCamera}
          currentPosition={nav.currentPosition}
          onStop={nav.stopNavigation}
        />
      )}

      {/* Phase: Arrived */}
      {nav.phase === 'arrived' && (
        <div className={cn(
          'absolute bottom-0 left-0 right-0 z-[900]',
          'bg-gray-950/95 backdrop-blur-xl',
          'rounded-t-2xl border-t border-white/10',
          'shadow-[0_-8px_40px_rgba(0,0,0,0.5)]',
          'pb-safe'
        )}>
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>
          <div className="px-4 pb-6 flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">Вы прибыли!</h2>
            {nav.destination && (
              <p className="text-sm text-gray-400 text-center mb-4">{nav.destination.address || nav.destination.name}</p>
            )}
            <button
              onClick={nav.stopNavigation}
              className={cn(
                'w-full h-12 rounded-xl',
                'bg-green-500 hover:bg-green-600',
                'text-white font-bold text-sm',
                'transition-all active:scale-[0.98]',
                'shadow-lg shadow-green-500/30'
              )}
            >
              Готово
            </button>
          </div>
        </div>
      )}

      {/* Save place button (visible during route_preview) */}
      {nav.phase === 'route_preview' && nav.destination && nav.userId && (
        <button
          onClick={() => setSavePlaceTarget(nav.destination)}
          className={cn(
            glassBtn,
            'absolute top-[4.5rem] right-3 z-[850]'
          )}
          aria-label="Сохранить место"
        >
          <Bookmark className="h-5 w-5 text-blue-400" />
        </button>
      )}

      {/* AddPlaceSheet */}
      {showAddPlace && nav.userId && (
        <AddPlaceSheet
          userId={nav.userId}
          onClose={() => setShowAddPlace(false)}
          onAdded={() => nav.reloadFavorites()}
        />
      )}

      {/* SavePlaceSheet */}
      {savePlaceTarget && nav.userId && (
        <SavePlaceSheet
          place={savePlaceTarget}
          userId={nav.userId}
          onClose={() => setSavePlaceTarget(null)}
          onSaved={() => nav.reloadFavorites()}
        />
      )}

      {/* Loading overlay during route building */}
      {nav.loading && nav.phase === 'route_preview' && (
        <div className="absolute inset-0 z-[850] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-white text-sm font-medium">Строим маршрут...</span>
          </div>
        </div>
      )}
    </div>
  );
}
