import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, CheckCircle2, Bookmark, AlertTriangle, Mic, Footprints } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGeolocation } from '@/hooks/navigation/useGeolocation';
import { useNavigation } from '@/hooks/navigation/useNavigation';
import { useAmapNavigation } from '@/hooks/navigation/useAmapNavigation';
import { useVoiceInput } from '@/hooks/navigation/useVoiceInput';
import { NavigatorMap } from '@/components/navigation/NavigatorMap';
import { SearchPanel } from '@/components/navigation/SearchPanel';
import { RouteOverview } from '@/components/navigation/RouteOverview';
import { NavigationPanel } from '@/components/navigation/NavigationPanel';
import { AddPlaceSheet } from '@/components/navigation/AddPlaceSheet';
import { SavePlaceSheet } from '@/components/navigation/SavePlaceSheet';
import { ReportEventSheet } from '@/components/navigation/ReportEventSheet';
import { TrafficWidget } from '@/components/navigation/TrafficWidget';
import { TravelModeToggle } from '@/components/navigation/TravelModeToggle';
import { TransitTimeline } from '@/components/navigation/TransitTimeline';
import { TaxiComparisonPanel } from '@/components/navigation/TaxiComparisonPanel';
import { MetroMapViewer } from '@/components/navigation/MetroMapViewer';
import { NavigatorSettingsPopover } from '@/components/navigation/NavigatorSettingsPopover';
import { NavigationDiagnosticsOverlay } from '@/components/navigation/NavigationDiagnosticsOverlay';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { loadSpeedCameras, getCamerasOnRoute } from '@/lib/navigation/speedCameras';
import { loadOfflineData } from '@/lib/navigation/offlineSearch';
import type { SavedPlace, TravelMode, PedestrianRoutingOptions, NavigationLaneGuidance, NavigationState, ManeuverType } from '@/types/navigation';
import type { LaneRecommendation } from '@/lib/navigation/laneGraph';
import { recordPipelineConfidence } from '@/lib/navigation/navigationKpi';
import { navText } from '@/lib/navigation/navigationUi';

const glassBtn = cn(
  'flex h-11 w-11 items-center justify-center rounded-[20px]',
  'border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),rgba(255,255,255,0.045))] backdrop-blur-xl',
  'shadow-[0_10px_32px_rgba(4,8,16,0.26),inset_0_1px_0_rgba(255,255,255,0.08)]',
  'transition-all duration-200 active:scale-95 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))]'
);

const floatingGlassBtn = cn(glassBtn, 'text-white');

const AMAP_CONFIDENCE_HEADING_THRESHOLD = 0.4;
const NAV_DIAGNOSTICS_ENABLED = String(import.meta.env.VITE_NAV_DIAGNOSTICS ?? '').trim().toLowerCase() === 'true';

function adaptAmapLaneRecommendation(
  laneRecommendation: LaneRecommendation | null,
  fallbackManeuverType?: ManeuverType,
): NavigationLaneGuidance | null {
  if (!laneRecommendation) return null;

  return {
    lanes: laneRecommendation.lanes.map((lane) => ({
      index: lane.index,
      turns: lane.directions,
      isRecommended: lane.isRecommended,
      isBusLane: false,
      isBikeLane: false,
    })),
    totalLanes: laneRecommendation.totalLanes,
    distanceToIntersection: laneRecommendation.distanceToDecision,
    message: laneRecommendation.instruction || 'Follow the recommended lane',
    urgency: laneRecommendation.urgency === 'critical'
      ? 'critical'
      : laneRecommendation.urgency === 'high'
        ? 'warn'
        : 'info',
    source: 'heuristic',
    maneuverType: fallbackManeuverType ?? 'straight',
    destinationHint: null,
  };
}

export default function NavigationPage() {
  const routerNav = useNavigate();
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const geo = useGeolocation();
  const [travelMode, setTravelMode] = useState<TravelMode>('car');
  const [pedestrianOptions, setPedestrianOptions] = useState<PedestrianRoutingOptions>({
    avoidStairs: false,
    preferElevators: false,
    maxSlopePercent: 12,
  });
  const [selectedTransitSegmentIndex, setSelectedTransitSegmentIndex] = useState<number | null>(null);
  const nav = useNavigation({ travelMode, pedestrianOptions });
  const navigationState = useMemo<NavigationState>(() => ({
    phase: nav.phase,
    currentPosition: nav.currentPosition,
    currentHeading: nav.currentHeading,
    currentSpeed: nav.currentSpeed,
    destination: nav.destination,
    route: nav.route,
    alternativeRoutes: nav.alternativeRoutes,
    currentManeuverIndex: nav.currentManeuverIndex,
    nextInstruction: nav.nextInstruction,
    distanceToNextTurn: nav.distanceToNextTurn,
    remainingDistance: nav.remainingDistance,
    remainingTime: nav.remainingTime,
    eta: nav.eta,
    laneGuidance: nav.laneGuidance,
    speedLimit: nav.speedLimit,
    nearbyCamera: nav.nearbyCamera,
    voiceEnabled: nav.voiceEnabled,
    isNorthUp: nav.isNorthUp,
    favorites: nav.favorites,
    recents: nav.recents,
  }), [
    nav.phase,
    nav.currentPosition,
    nav.currentHeading,
    nav.currentSpeed,
    nav.destination,
    nav.route,
    nav.alternativeRoutes,
    nav.currentManeuverIndex,
    nav.nextInstruction,
    nav.distanceToNextTurn,
    nav.remainingDistance,
    nav.remainingTime,
    nav.eta,
    nav.laneGuidance,
    nav.speedLimit,
    nav.nearbyCamera,
    nav.voiceEnabled,
    nav.isNorthUp,
    nav.favorites,
    nav.recents,
  ]);
  const amapNav = useAmapNavigation(navigationState);
  const searchVoice = useVoiceInput({ lang: 'ru-RU', continuous: false, interimResults: true });
  const {
    isSupported: isVoiceSupported,
    state: voiceState,
    transcript: voiceTranscript,
    interimTranscript,
    finalTranscript,
    alternatives,
    error: voiceError,
    startListening,
    stopListening,
    reset: resetSearchVoice,
  } = searchVoice;
  const [showAddPlace, setShowAddPlace] = useState(false);
  const [savePlaceTarget, setSavePlaceTarget] = useState<SavedPlace | null>(null);
  const [showReportEvent, setShowReportEvent] = useState(false);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [pendingCenterOnUser, setPendingCenterOnUser] = useState(false);
  const [pendingVoiceSearch, setPendingVoiceSearch] = useState<{ text: string; alternatives: string[] } | null>(null);

  // Preload offline datasets used by navigation runtime.
  useEffect(() => { loadOfflineData(); loadSpeedCameras(); }, []);

  useEffect(() => {
    if (nav.phase === 'route_preview' || nav.phase === 'navigating') {
      geo.startTracking();
      return;
    }

    geo.stopTracking();
  }, [geo.startTracking, geo.stopTracking, nav.phase]);

  // Sync geolocation → navigation state
  useEffect(() => {
    if (geo.position) {
      nav.updatePosition(geo.position, geo.heading, geo.speed);
    }
  }, [geo.position, geo.heading, geo.speed]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingCenterOnUser || !geo.position) return;

    nav.updatePosition(geo.position, geo.heading, geo.speed);
    setRecenterTrigger((value) => value + 1);
    setPendingCenterOnUser(false);
  }, [pendingCenterOnUser, geo.position, geo.heading, geo.speed]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchedPosition = amapNav.matchedPosition
    ? { lat: amapNav.matchedPosition.lat, lng: amapNav.matchedPosition.lng }
    : null;

  const mapUserPosition = matchedPosition ?? nav.currentPosition;
  const isAmapPipelineReady = amapNav.isReady;
  const hasAmapTelemetry = amapNav.isInitialized && amapNav.hasKalman && !!amapNav.filteredPosition;
  const hasReliableAmapHeading = isAmapPipelineReady && amapNav.matchConfidence >= AMAP_CONFIDENCE_HEADING_THRESHOLD;
  const kpiPipelineStateRef = useRef<string>('');

  useEffect(() => {
    const key = `${nav.phase}|${isAmapPipelineReady}|${amapNav.matchConfidence.toFixed(2)}`;
    if (kpiPipelineStateRef.current === key) return;
    kpiPipelineStateRef.current = key;

    if (nav.phase !== 'navigating') return;
    if (!isAmapPipelineReady) {
      recordPipelineConfidence(0.4, 'navigation_page', true, 'amap_pipeline_not_ready');
      return;
    }

    const confidence = Math.max(0, Math.min(1, amapNav.matchConfidence));
    recordPipelineConfidence(confidence, 'navigation_page', confidence < 0.5, confidence < 0.5 ? 'low_match_confidence' : 'ok');
  }, [amapNav.matchConfidence, isAmapPipelineReady, nav.phase]);

  const mapCenter = nav.phase === 'navigating' && mapUserPosition
    ? mapUserPosition
    : mapUserPosition ?? geo.position ?? { lat: 55.7558, lng: 37.6173 };

  const displayHeading = hasReliableAmapHeading ? amapNav.smoothedHeading : nav.currentHeading;
  const displaySpeed = hasAmapTelemetry ? amapNav.smoothedSpeed : nav.currentSpeed;
  const displaySpeedLimit = isAmapPipelineReady ? (amapNav.currentSpeedLimit ?? nav.speedLimit) : nav.speedLimit;
  const displayRoadName = isAmapPipelineReady ? (amapNav.currentRoadName || nav.nextInstruction?.streetName) : nav.nextInstruction?.streetName;
  const displayLaneGuidance = isAmapPipelineReady
    ? (adaptAmapLaneRecommendation(amapNav.laneRecommendation, nav.nextInstruction?.type) ?? nav.laneGuidance)
    : nav.laneGuidance;

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

  useEffect(() => {
    setSelectedTransitSegmentIndex(null);
  }, [travelMode, nav.destination?.id, nav.multimodalRoute?.id, nav.phase]);

  useEffect(() => {
    if (nav.phase === 'route_preview' || nav.phase === 'navigating') {
      resetSearchVoice();
      setPendingVoiceSearch(null);
    }
  }, [nav.phase, resetSearchVoice]);

  useEffect(() => {
    if (nav.phase !== 'idle' || voiceState !== 'idle') return;

    const nextQuery = finalTranscript.trim();
    if (!nextQuery) return;

    setPendingVoiceSearch({
      text: nextQuery,
      alternatives,
    });
  }, [alternatives, finalTranscript, nav.phase, voiceState]);

  const handleOpenSearch = () => {
    resetSearchVoice();
    setPendingVoiceSearch(null);
    nav.openSearch();
  };

  const handleIdleVoiceToggle = () => {
    if (voiceState === 'listening' || voiceState === 'processing') {
      stopListening();
      return;
    }

    setPendingVoiceSearch(null);
    startListening();
  };

  const handleApplyIdleVoiceChoice = (text: string) => {
    const cleaned = text.trim();
    if (!cleaned) return;

    const remainingAlternatives = [finalTranscript, ...alternatives]
      .map((item) => item.trim())
      .filter((item, index, items) => item.length >= 2 && item.toLowerCase() !== cleaned.toLowerCase() && items.findIndex((entry) => entry.toLowerCase() === item.toLowerCase()) === index);

    resetSearchVoice();
    setPendingVoiceSearch({ text: cleaned, alternatives: remainingAlternatives });
    nav.openSearch();
  };

  const idleVoiceChoices = [
    finalTranscript.trim(),
    ...alternatives.map((item) => item.trim()),
    interimTranscript.trim(),
  ].filter((value, index, items) => value.length >= 2 && items.findIndex((entry) => entry.toLowerCase() === value.toLowerCase()) === index).slice(0, 3);

  const isIdleListening = voiceState === 'listening';
  const isIdleVoiceBusy = voiceState === 'processing';
  const showIdleVoiceCard = nav.phase === 'idle' && (
    isIdleListening ||
    isIdleVoiceBusy ||
    !!voiceTranscript.trim() ||
    !!pendingVoiceSearch ||
    !!voiceError
  );

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-950">
      {/* Full-screen map */}
      <NavigatorMap
        center={mapCenter}
        zoom={mapZoom}
        heading={displayHeading}
        isNorthUp={nav.isNorthUp}
        userPosition={mapUserPosition}
        routeSegments={nav.route?.segments ?? []}
        alternativeRoutes={nav.alternativeRoutes}
        speedCameras={routeCameras}
        destinationMarker={nav.destination?.coordinates ?? null}
        recenterTrigger={recenterTrigger}
        isNavigating={nav.phase === 'navigating'}
        speed={displaySpeed}
        speedLimit={displaySpeedLimit}
        nearbyCamera={nav.nearbyCamera}
        nextManeuver={nav.nextInstruction}
        laneGuidance={displayLaneGuidance}
        distanceToNextTurn={nav.distanceToNextTurn}
        remainingDistance={nav.remainingDistance}
        totalDistance={nav.route?.totalDistanceMeters}
        roadName={displayRoadName}
        route={nav.route}
        multimodalRoute={nav.multimodalRoute}
        selectedMultimodalSegmentIndex={selectedTransitSegmentIndex}
        onCenterOnUser={() => {
          geo.startTracking();

          if (geo.position) {
            nav.updatePosition(geo.position, geo.heading, geo.speed);
            setRecenterTrigger((value) => value + 1);
            setPendingCenterOnUser(false);
            return;
          }

          setPendingCenterOnUser(true);
        }}
        onToggleOrientation={nav.toggleOrientation}
        className="absolute inset-0 z-[1]"
      />

      <div className="absolute top-0 right-0 z-[910] p-3 pt-safe pr-safe">
        <NavigatorSettingsPopover
          open={showSettingsPopover}
          onOpenChange={setShowSettingsPopover}
          triggerClassName={floatingGlassBtn}
        />
      </div>

      {/* Header controls */}
      <div className="absolute top-0 left-0 right-0 z-[900] flex items-center justify-between p-3 pt-safe">
        <button type="button" onClick={() => routerNav(-1)} className={glassBtn} aria-label={navText('Назад', 'Back', languageCode)}>
          <ArrowLeft className="h-5 w-5 text-white" />
        </button>

        <div className="mr-14 flex items-center gap-2">
          {/* Виджет пробок (баллы) */}
          <TrafficWidget position={nav.currentPosition ?? geo.position} />

          {/* Переключатель режима поездки */}
          <TravelModeToggle value={travelMode} onChange={setTravelMode} />

          {/* Report road event */}
          {nav.phase === 'navigating' && (
            <button type="button" onClick={() => setShowReportEvent(true)} className={glassBtn} aria-label={navText('Сообщить о событии', 'Report event', languageCode)}>
              <AlertTriangle className="h-5 w-5 text-amber-400" />
            </button>
          )}
        </div>
      </div>

      {/* Phase: Idle — search bar */}
      {nav.phase === 'idle' && (
        <div className="absolute top-[4.5rem] left-3 right-3 z-[800]">
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenSearch}
            className={cn(
              'group flex h-12 min-w-0 flex-1 items-center gap-3 overflow-hidden rounded-[24px] border border-white/14 px-3.5 text-left',
              'bg-[linear-gradient(180deg,rgba(255,255,255,0.13),rgba(255,255,255,0.045))] backdrop-blur-2xl',
              'shadow-[0_14px_40px_rgba(2,8,18,0.20),inset_0_1px_0_rgba(255,255,255,0.08)]',
              'transition-all duration-200 active:scale-[0.99] hover:border-white/20 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.16),rgba(255,255,255,0.055))]'
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-white/[0.08] text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-200 group-hover:scale-105">
              <Search className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-white/92">{navText('Куда едем?', 'Where to?', languageCode)}</div>
            </div>
          </button>

          {isVoiceSupported && (
            <button
              type="button"
              onClick={handleIdleVoiceToggle}
              className={cn(
                floatingGlassBtn,
                'relative h-12 w-12 overflow-visible',
                (isIdleListening || isIdleVoiceBusy) && 'border-cyan-300/35 text-cyan-100 shadow-[0_0_0_1px_rgba(103,232,249,0.12),0_10px_24px_rgba(8,145,178,0.22)]'
              )}
              aria-label={navText('Голосовой поиск', 'Voice search', languageCode)}
            >
              {(isIdleListening || isIdleVoiceBusy) && (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute inset-[-6px] rounded-[24px] border',
                      isIdleListening ? 'border-cyan-300/30 animate-ping' : 'border-blue-300/20 animate-pulse'
                    )}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'pointer-events-none absolute inset-[-12px] rounded-[28px] border',
                      isIdleListening ? 'border-cyan-300/20 animate-pulse' : 'border-blue-300/15 animate-pulse'
                    )}
                  />
                </>
              )}
              <span className={cn('absolute inset-0 rounded-[20px] transition-opacity', (isIdleListening || isIdleVoiceBusy) ? 'bg-cyan-400/18 opacity-100' : 'opacity-0')} />
              <Mic className={cn('relative z-10 h-4.5 w-4.5', isIdleListening && 'animate-pulse')} />
            </button>
          )}
          </div>

          {showIdleVoiceCard && (
            <div className="mt-3 rounded-[24px] border border-white/10 bg-gray-950/82 p-3 backdrop-blur-xl shadow-[0_18px_40px_rgba(2,8,18,0.24)]">
              <p className={cn('text-xs', voiceError ? 'text-red-300' : 'text-gray-300')}>
                {voiceError
                  ? voiceError
                  : isIdleListening
                    ? navText('Слушаю адрес...', 'Listening for the address...', languageCode)
                    : isIdleVoiceBusy
                      ? navText('Обрабатываю адрес...', 'Processing the address...', languageCode)
                      : pendingVoiceSearch
                        ? navText('Распознано. Выберите вариант или откройте поиск.', 'Recognized. Choose an option or open search.', languageCode)
                        : navText('Выберите вариант распознавания.', 'Choose a recognition option.', languageCode)}
              </p>

              {(voiceTranscript || pendingVoiceSearch?.text) && !voiceError && (
                <p className="mt-2 truncate text-sm font-medium text-white">
                  {pendingVoiceSearch?.text || voiceTranscript}
                </p>
              )}

              {idleVoiceChoices.length > 0 && !voiceError && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {idleVoiceChoices.map((choice) => (
                    <button
                      type="button"
                      key={choice}
                      onClick={() => handleApplyIdleVoiceChoice(choice)}
                      className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-gray-200 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              {pendingVoiceSearch && !voiceError && (
                <button
                  type="button"
                  onClick={() => handleApplyIdleVoiceChoice(pendingVoiceSearch.text)}
                  className="mt-3 flex items-center gap-2 rounded-2xl border border-cyan-300/18 bg-cyan-400/12 px-3 py-2 text-xs font-medium text-cyan-50 transition-colors hover:bg-cyan-400/18"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {navText('Открыть варианты адреса', 'Open address options', languageCode)}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Phase: Search */}
      {nav.phase === 'search' && (
        <SearchPanel
          favorites={nav.favorites}
          recents={nav.recents}
          currentPosition={nav.currentPosition}
          voice={searchVoice}
          initialVoiceQuery={pendingVoiceSearch}
          onInitialVoiceQueryHandled={() => setPendingVoiceSearch(null)}
          onSelectDestination={nav.selectDestination}
          onClose={nav.closeSearch}
          onAddPlace={() => setShowAddPlace(true)}
        />
      )}

      {/* Phase: Route preview */}
      {nav.phase === 'route_preview' && nav.route && (
        <>
          <RouteOverview
            route={nav.route}
            alternatives={nav.alternativeRoutes}
            travelMode={travelMode}
            multimodalRoute={nav.multimodalRoute}
            loading={nav.loading}
            onSelectRoute={nav.selectRoute}
            onPrimaryAction={travelMode === 'taxi' ? () => routerNav('/taxi') : nav.startNavigation}
            primaryActionLabel={travelMode === 'taxi' ? navText('К заказу такси', 'Book taxi', languageCode) : undefined}
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
                  <p className="text-sm font-semibold text-white">{navText('Пеший профиль', 'Walking profile', languageCode)}</p>
                  <p className="text-xs text-gray-400">{navText('Настройки сразу перестраивают маршрут пешком', 'These settings rebuild the walking route immediately', languageCode)}</p>
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
                  {navText('Без лестниц', 'Avoid stairs', languageCode)}
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
                  {navText('Предпочесть лифты', 'Prefer elevators', languageCode)}
                </button>
              </div>
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-gray-400">{navText('Максимальный уклон', 'Maximum incline', languageCode)}</p>
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
                      {navText('до', 'up to', languageCode)} {slope}%
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
          <NavigationPanel
            speed={displaySpeed}
            speedLimit={displaySpeedLimit}
            nextInstruction={nav.nextInstruction}
            followingInstruction={nav.followingInstruction}
            distanceToNextTurn={nav.distanceToNextTurn}
            remainingDistance={nav.remainingDistance}
            remainingTime={nav.remainingTime}
            eta={nav.eta}
            nearbyCamera={nav.nearbyCamera}
            currentPosition={mapUserPosition}
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
            <h2 className="text-xl font-bold text-white mb-1">{navText('Вы прибыли!', 'You have arrived!', languageCode)}</h2>
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
              {navText('Готово', 'Done', languageCode)}
            </button>
          </div>
        </div>
      )}

      {/* Save place button (visible during route_preview) */}
      {nav.phase === 'route_preview' && nav.destination && nav.userId && (
        <button
          type="button"
          onClick={() => setSavePlaceTarget(nav.destination)}
          className={cn(
            floatingGlassBtn,
            'absolute top-[4.5rem] right-3 z-[850]'
          )}
          aria-label={navText('Сохранить место', 'Save place', languageCode)}
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
            <span className="text-white text-sm font-medium">{navText('Строим маршрут...', 'Building route...', languageCode)}</span>
          </div>
        </div>
      )}

      {/* Report road event sheet */}
      <ReportEventSheet
        open={showReportEvent}
        onClose={() => setShowReportEvent(false)}
        location={nav.currentPosition}
      />

      {NAV_DIAGNOSTICS_ENABLED && <NavigationDiagnosticsOverlay />}
    </div>
  );
}
