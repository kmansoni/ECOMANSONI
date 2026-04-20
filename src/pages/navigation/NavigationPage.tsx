import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Volume2, VolumeX, Search, Flag, CheckCircle2, Bookmark, Settings, AlertTriangle, Mic, Clock, Sparkles, Footprints } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGeolocation } from '@/hooks/navigation/useGeolocation';
import { useNavigation } from '@/hooks/navigation/useNavigation';
import { NavigatorMap } from '@/components/navigation/NavigatorMap';
import { SearchPanel } from '@/components/navigation/SearchPanel';
import { RouteOverview } from '@/components/navigation/RouteOverview';
import { NavigationPanel } from '@/components/navigation/NavigationPanel';
import { AddPlaceSheet } from '@/components/navigation/AddPlaceSheet';
import { SavePlaceSheet } from '@/components/navigation/SavePlaceSheet';
import { ReportEventSheet } from '@/components/navigation/ReportEventSheet';
import { VoiceSearchSheet } from '@/components/navigation/VoiceSearchSheet';
import { TrafficWidget } from '@/components/navigation/TrafficWidget';
import { TravelModeToggle } from '@/components/navigation/TravelModeToggle';
import { TransitTimeline } from '@/components/navigation/TransitTimeline';
import { TaxiComparisonPanel } from '@/components/navigation/TaxiComparisonPanel';
import { QuantumInsightsPanel } from '@/components/navigation/QuantumInsightsPanel';
import { MetroMapViewer } from '@/components/navigation/MetroMapViewer';
import { loadSpeedCameras, getCamerasOnRoute } from '@/lib/navigation/speedCameras';
import { loadOfflineData } from '@/lib/navigation/offlineSearch';
import type { SavedPlace, TravelMode, PedestrianRoutingOptions } from '@/types/navigation';
import { useNavigatorSettings, type MapViewMode } from '@/stores/navigatorSettingsStore';

const glassBtn = cn(
  'w-11 h-11 rounded-xl',
  'bg-gray-900/80 backdrop-blur-md border border-white/10',
  'flex items-center justify-center',
  'transition-all active:scale-95 hover:bg-gray-800/90',
  'shadow-lg shadow-black/30'
);

const QUICK_MAP_MODES: Array<{ id: MapViewMode; label: string }> = [
  { id: 'standard', label: 'Схема' },
  { id: 'satellite', label: 'Спутник' },
  { id: 'hybrid', label: 'Гибрид' },
  { id: 'terrain', label: 'Рельеф' },
];

const MODE_LABELS: Record<TravelMode, string> = {
  car: 'Авто',
  taxi: 'Такси',
  pedestrian: 'Пешком',
  transit: 'ОТ',
  metro: 'Метро',
  multimodal: 'Мультимодально',
};

export default function NavigationPage() {
  const routerNav = useNavigate();
  const geo = useGeolocation();
  const navSettings = useNavigatorSettings();
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [pedestrianOptions, setPedestrianOptions] = useState<PedestrianRoutingOptions>({
    avoidStairs: false,
    preferElevators: false,
    maxSlopePercent: 12,
  });
  const [selectedTransitSegmentIndex, setSelectedTransitSegmentIndex] = useState<number | null>(null);
  const nav = useNavigation({ travelMode, pedestrianOptions });
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [savePlaceTarget, setSavePlaceTarget] = useState<SavedPlace | null>(null);
  const [showReportEvent, setShowReportEvent] = useState(false);
  const [showVoiceSearch, setShowVoiceSearch] = useState(false);

  // Загрузить камеры и оффлайн данные при монтировании
  useEffect(() => { loadOfflineData(); loadSpeedCameras(); }, []);

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

  const metroCity = useMemo(() => {
    const metroSegment = nav.multimodalRoute?.segments.find((segment) => segment.trip?.routeType === 'metro');
    return metroSegment?.fromStop?.city?.trim().toLowerCase() || metroSegment?.toStop?.city?.trim().toLowerCase() || 'moscow';
  }, [nav.multimodalRoute]);

  const metroStations = useMemo(() => {
    const metroSegments = nav.multimodalRoute?.segments.filter((segment) => segment.trip?.routeType === 'metro') ?? [];
    const first = metroSegments[0];
    const last = metroSegments[metroSegments.length - 1];
    return {
      fromStationId: first?.fromStop?.stopId,
      toStationId: last?.toStop?.stopId,
    };
  }, [nav.multimodalRoute]);

  const transitLikeMode = travelMode === 'transit' || travelMode === 'multimodal' || travelMode === 'metro';
  const taxiLikeMode = travelMode === 'taxi';
  const quickModeRecommendations = useMemo(() => {
    if (!nav.route) return [] as Array<{ mode: TravelMode; reason: string }>;

    const distanceMeters = nav.route.totalDistanceMeters;
    const hasMetroPath = Boolean(nav.multimodalRoute?.segments.some((segment) => segment.trip?.routeType === 'metro'));
    const candidates: Array<{ mode: TravelMode; reason: string }> = [];

    if (distanceMeters <= 2500 && travelMode !== 'pedestrian') {
      candidates.push({ mode: 'pedestrian', reason: 'Короткая дистанция без ожидания транспорта' });
    }
    if (distanceMeters >= 1800 && travelMode !== 'taxi') {
      candidates.push({ mode: 'taxi', reason: 'Быстрый старт без пересадок и парковки' });
    }
    if (distanceMeters >= 2500 && travelMode !== 'transit') {
      candidates.push({ mode: 'transit', reason: 'Можно снизить стоимость поездки' });
    }
    if (hasMetroPath && travelMode !== 'metro') {
      candidates.push({ mode: 'metro', reason: 'Есть маршрут через метро с устойчивым ETA' });
    }
    if (distanceMeters >= 3000 && travelMode !== 'car') {
      candidates.push({ mode: 'car', reason: 'Подходит прямой автомобильный маршрут' });
    }
    if ((hasMetroPath || distanceMeters >= 2500) && travelMode !== 'multimodal') {
      candidates.push({ mode: 'multimodal', reason: 'Комбинация пешего пути и транспорта' });
    }

    return candidates.filter((item, index, array) => array.findIndex((entry) => entry.mode === item.mode) === index).slice(0, 3);
  }, [nav.multimodalRoute, nav.route, travelMode]);

  useEffect(() => {
    setSelectedTransitSegmentIndex(null);
  }, [travelMode, nav.destination?.id, nav.multimodalRoute?.id, nav.phase]);

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
        isNavigating={nav.phase === 'navigating'}
        speed={nav.currentSpeed}
        speedLimit={nav.speedLimit}
        nearbyCamera={nav.nearbyCamera}
        nextManeuver={nav.nextInstruction}
        laneGuidance={nav.laneGuidance}
        distanceToNextTurn={nav.distanceToNextTurn}
        remainingDistance={nav.remainingDistance}
        totalDistance={nav.route?.totalDistanceMeters}
        roadName={nav.nextInstruction?.streetName}
        route={nav.route}
        multimodalRoute={nav.multimodalRoute}
        selectedMultimodalSegmentIndex={selectedTransitSegmentIndex}
        onCenterOnUser={() => {
          if (geo.position) nav.updatePosition(geo.position, geo.heading, geo.speed);
        }}
        onToggleOrientation={nav.toggleOrientation}
        className="absolute inset-0 z-[1]"
      />

      {/* Header controls */}
      <div className="absolute top-0 left-0 right-0 z-[900] flex items-center justify-between p-3 pt-safe">
        <button onClick={() => routerNav(-1)} className={glassBtn} aria-label="Назад">
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>

        <div className="flex items-center gap-2">
          {/* Виджет пробок (баллы) */}
          <TrafficWidget position={nav.currentPosition ?? geo.position} />

          {/* Переключатель режима поездки */}
          <TravelModeToggle value={travelMode} onChange={setTravelMode} />

          {/* Navigator Settings */}
          <button onClick={() => routerNav('/navigator-settings')} className={glassBtn} aria-label="Настройки навигатора">
            <Settings className="h-5 w-5 text-gray-300" />
          </button>

          {/* Историю поездок */}
          <button onClick={() => routerNav('/trip-history')} className={glassBtn} aria-label="История поездок">
            <Clock className="h-5 w-5 text-gray-300" />
          </button>

          <button onClick={() => routerNav('/navigation-lab')} className={glassBtn} aria-label="Quantum Transport Lab">
            <Sparkles className="h-5 w-5 text-cyan-300" />
          </button>

          {/* Report road event */}
          {nav.phase === 'navigating' && (
            <button onClick={() => setShowReportEvent(true)} className={glassBtn} aria-label="Сообщить о событии">
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </button>
          )}

          {/* Voice toggle */}
          {typeof window !== 'undefined' && window.speechSynthesis && (
            <button onClick={nav.toggleVoice} className={glassBtn} aria-label="Голос">
              {nav.voiceEnabled
                ? <Volume2 className="h-5 w-5 text-blue-400" />
                : <VolumeX className="h-5 w-5 text-gray-400" />
              }
            </button>
          )}


        </div>
      </div>

      {(nav.phase === 'route_preview' || nav.phase === 'navigating') && (
        <div className="absolute top-[4.8rem] left-3 z-[860] flex max-w-[calc(100vw-1.5rem)] gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-gray-950/78 p-1 backdrop-blur-md shadow-lg shadow-black/30">
          {QUICK_MAP_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => navSettings.setMapViewMode(mode.id)}
              className={cn(
                'shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition-colors',
                navSettings.mapViewMode === mode.id
                  ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30'
                  : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent'
              )}
            >
              {mode.label}
            </button>
          ))}
        </div>
      )}

      {nav.phase === 'route_preview' && nav.route && quickModeRecommendations.length > 0 && (
        <div className="absolute top-[8.4rem] left-3 z-[850] w-[min(430px,calc(100vw-1.5rem))] rounded-2xl border border-white/10 bg-gray-950/86 p-3 backdrop-blur-md shadow-xl shadow-black/30">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Быстрое переключение</p>
          <div className="mt-2 space-y-2">
            {quickModeRecommendations.map((item) => (
              <button
                key={item.mode}
                onClick={() => setTravelMode(item.mode)}
                disabled={nav.loading}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{MODE_LABELS[item.mode]}</p>
                  <p className="text-xs text-gray-400">{item.reason}</p>
                </div>
                <span className="text-xs text-blue-300">Перестроить</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
          <span className="text-gray-400 text-sm flex-1 text-left">Куда едем?</span>
          <button
            onClick={(e) => { e.stopPropagation(); setShowVoiceSearch(true); }}
            className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center hover:bg-blue-500/30 transition-colors"
            aria-label="Голосовой поиск"
          >
            <Mic className="w-4 h-4 text-blue-400" />
          </button>
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
        <>
          <div className="absolute bottom-[10.5rem] left-3 right-3 z-[845]">
            <QuantumInsightsPanel
              superposition={nav.quantumSuperposition}
              twinSimulation={nav.twinSimulation}
              swarmRecommendation={nav.swarmRecommendation}
              timeAccount={nav.timeAccount}
            />
          </div>

          <RouteOverview
            route={nav.route}
            alternatives={nav.alternativeRoutes}
            travelMode={travelMode}
            multimodalRoute={nav.multimodalRoute}
            loading={nav.loading}
            onSelectRoute={nav.selectRoute}
            onPrimaryAction={travelMode === 'taxi' ? () => routerNav('/taxi') : nav.startNavigation}
            primaryActionLabel={travelMode === 'taxi' ? 'К заказу такси' : undefined}
            onCancel={nav.stopNavigation}
          />

          {/* Transit timeline for transit/multimodal modes */}
          {transitLikeMode && nav.multimodalRoute && (
            <div className="absolute bottom-[220px] left-3 right-3 z-[850] max-h-[40vh] overflow-y-auto rounded-2xl">
              <TransitTimeline
                route={nav.multimodalRoute}
                selectedSegmentIndex={selectedTransitSegmentIndex}
                onSelectSegment={setSelectedTransitSegmentIndex}
              />
            </div>
          )}

          {travelMode === 'metro' && metroStations.fromStationId && metroStations.toStationId && (
            <div className="absolute top-[8.5rem] right-3 z-[845] w-[min(420px,calc(100vw-1.5rem))] max-h-[42vh] overflow-hidden rounded-2xl border border-white/10 bg-gray-950/88 backdrop-blur-md shadow-xl shadow-black/35">
              <MetroMapViewer
                city={metroCity}
                fromStation={metroStations.fromStationId}
                toStation={metroStations.toStationId}
                className="p-3"
              />
            </div>
          )}

          {travelMode === 'pedestrian' && (
            <div className="absolute bottom-[180px] left-3 right-3 z-[840] rounded-2xl border border-white/10 bg-gray-950/88 p-3 backdrop-blur-md shadow-lg shadow-black/30">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/15 text-green-300">
                  <Footprints className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Пеший профиль</p>
                  <p className="text-xs text-gray-400">Настройки сразу перестраивают маршрут пешком</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setPedestrianOptions((prev) => ({ ...prev, avoidStairs: !prev.avoidStairs }))}
                  className={cn(
                    'rounded-xl px-3 py-2 text-xs font-semibold transition-colors',
                    pedestrianOptions.avoidStairs
                      ? 'bg-green-500/20 text-green-200 border border-green-400/30'
                      : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10'
                  )}
                >
                  Без лестниц
                </button>
                <button
                  onClick={() => setPedestrianOptions((prev) => ({ ...prev, preferElevators: !prev.preferElevators }))}
                  className={cn(
                    'rounded-xl px-3 py-2 text-xs font-semibold transition-colors',
                    pedestrianOptions.preferElevators
                      ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-400/30'
                      : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10'
                  )}
                >
                  Предпочесть лифты
                </button>
              </div>
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-gray-400">Максимальный уклон</p>
                <div className="flex gap-2">
                  {[8, 12, 16].map((slope) => (
                    <button
                      key={slope}
                      onClick={() => setPedestrianOptions((prev) => ({ ...prev, maxSlopePercent: slope }))}
                      className={cn(
                        'rounded-xl px-3 py-2 text-xs font-semibold transition-colors',
                        pedestrianOptions.maxSlopePercent === slope
                          ? 'bg-amber-500/20 text-amber-100 border border-amber-400/30'
                          : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10'
                      )}
                    >
                      до {slope}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Taxi price comparison from transfer points */}
          {nav.destination && nav.currentPosition && transitLikeMode && nav.multimodalRoute && (
            <div className="absolute bottom-[180px] left-3 right-3 z-[840]">
              <TaxiComparisonPanel
                pickup={nav.currentPosition}
                destination={nav.destination.coordinates}
                viaPoints={nav.multimodalRoute.segments
                  .filter(s => s.mode === 'transit' && s.toStop)
                  .map(s => s.toStop!.location)}
              />
            </div>
          )}

          {nav.destination && nav.currentPosition && taxiLikeMode && (
            <div className="absolute bottom-[180px] left-3 right-3 z-[840]">
              <TaxiComparisonPanel
                pickup={nav.currentPosition}
                destination={nav.destination.coordinates}
                viaPoints={[]}
                onSelectDirect={() => routerNav('/taxi')}
              />
            </div>
          )}
        </>
      )}

      {/* Phase: Navigating */}
      {nav.phase === 'navigating' && (
        <>
          <div className="absolute bottom-[11.5rem] left-3 right-3 z-[845]">
            <QuantumInsightsPanel
              superposition={nav.quantumSuperposition}
              twinSimulation={nav.twinSimulation}
              swarmRecommendation={nav.swarmRecommendation}
              timeAccount={nav.timeAccount}
              compact
            />
          </div>

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
        </>
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

      {/* Report road event sheet */}
      <ReportEventSheet
        open={showReportEvent}
        onClose={() => setShowReportEvent(false)}
        location={nav.currentPosition}
      />

      {/* Голосовой поиск адреса */}
      <VoiceSearchSheet
        open={showVoiceSearch}
        onClose={() => setShowVoiceSearch(false)}
        onSelectDestination={(place) => {
          setShowVoiceSearch(false);
          nav.selectDestination(place);
        }}
      />
    </div>
  );
}
