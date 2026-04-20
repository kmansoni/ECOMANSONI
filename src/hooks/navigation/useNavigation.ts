import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/types/taxi';
import type {
  NavigationPhase,
  NavRoute,
  Maneuver,
  PedestrianRoutingOptions,
  SpeedCamera,
  SavedPlace,
  TravelMode,
  MultiModalRoute,
  TransitType,
  TransitRoutingOptions,
} from '@/types/navigation';
import { fetchRoute, buildRouteProximityChecker } from '@/lib/navigation/routing';
import { getManeuverInstruction, getVoiceInstruction, formatETA } from '@/lib/navigation/turnInstructions';
import { getNearbyCamera, getCameraDistance } from '@/lib/navigation/speedCameras';
import { calculateDistance } from '@/lib/taxi/calculations';
import { getSavedPlaces, getSearchHistory, saveSearchEntry } from '@/lib/navigation/places';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import {
  speakNavigation,
  speakTurn,
  speakCamera,
  speakArrival,
  speakReroute,
} from '@/lib/navigation/voiceAssistant';
import { startTrafficCollection, stopTrafficCollection, addTrafficProbe } from '@/lib/navigation/trafficCollector';
import {
  startTripRecording,
  updateTripPosition,
  endTripRecording,
} from '@/lib/navigation/tripHistory';
import { getLaneGuidance, loadLaneData } from '@/lib/navigation/laneAssist';
import { quantumTransportService } from '@/lib/navigation/quantumTransportService';
import { useNavigatorSettings } from '@/stores/navigatorSettingsStore';
import type { RouteSuperposition, TwinSimulationResult, SwarmRecommendation, TimeAccount } from '@/types/quantum-transport';
import { recordFallbackUsage, recordRerouteLatency, recordRouteBuildLatency } from '@/lib/navigation/navigationKpi';

function getSavedCenter(): LatLng | null {
  try {
    const raw = localStorage.getItem('nav_last_center');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') return parsed;
  } catch { /* corrupted */ }
  return null;
}

const MOSCOW_CENTER: LatLng = { lat: 55.7558, lng: 37.6173 };

const OFF_ROUTE_THRESHOLD_KM = 0.05; // 50m
const MANEUVER_COMPLETE_KM = 0.03; // 30m

interface UseNavigationOptions {
  travelMode?: TravelMode;
  transitOptions?: TransitRoutingOptions;
  pedestrianOptions?: PedestrianRoutingOptions;
}
const ARRIVAL_THRESHOLD_KM = 0.03; // 30m
const VOICE_WARN_DISTANCES = [500, 200, 50]; // meters

export function useNavigation(options?: UseNavigationOptions) {
  const travelMode = options?.travelMode ?? 'car';
  const transitOptions = options?.transitOptions;
  const pedestrianOptions = options?.pedestrianOptions;
  const metroTransitTypes: TransitType[] = ['metro'];
  const effectiveTransitOptions = travelMode === 'metro'
    ? { ...transitOptions, transitTypes: metroTransitTypes, maxTransfers: transitOptions?.maxTransfers ?? 3 }
    : transitOptions;
  const voiceEnabled = useNavigatorSettings((state) => state.voiceEnabled);
  const setVoiceEnabled = useNavigatorSettings((state) => state.setVoiceEnabled);
  const previewModeKey = JSON.stringify({
    travelMode,
    transitTypes: effectiveTransitOptions?.transitTypes ?? [],
    maxTransfers: effectiveTransitOptions?.maxTransfers ?? null,
    minimize: effectiveTransitOptions?.minimize ?? null,
    wheelchairAccessible: effectiveTransitOptions?.wheelchairAccessible ?? null,
    includeTaxiAlternatives: effectiveTransitOptions?.includeTaxiAlternatives ?? null,
    avoidStairs: pedestrianOptions?.avoidStairs ?? false,
    preferElevators: pedestrianOptions?.preferElevators ?? false,
    maxSlopePercent: pedestrianOptions?.maxSlopePercent ?? null,
  });

  const [phase, setPhase] = useState<NavigationPhase>('idle');
  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null);
  const [currentHeading, setCurrentHeading] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [destination, setDestination] = useState<SavedPlace | null>(null);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [alternativeRoutes, setAlternativeRoutes] = useState<NavRoute[]>([]);
  const [multimodalRoute, setMultimodalRoute] = useState<MultiModalRoute | null>(null);
  const [currentManeuverIndex, setCurrentManeuverIndex] = useState(0);
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const [nearbyCamera, setNearbyCamera] = useState<SpeedCamera | null>(null);
  const [isNorthUp, setIsNorthUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quantumSuperposition, setQuantumSuperposition] = useState<RouteSuperposition | null>(null);
  const [twinSimulation, setTwinSimulation] = useState<TwinSimulationResult | null>(null);
  const [swarmRecommendation, setSwarmRecommendation] = useState<SwarmRecommendation | null>(null);
  const [timeAccount, setTimeAccount] = useState<TimeAccount | null>(null);

  const voiceSpokenRef = useRef<Set<string>>(new Set());
  const recalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOnRouteRef = useRef<((pos: LatLng) => boolean) | null>(null);
  const previewModeKeyRef = useRef<string | null>(null);

  const [favorites, setFavorites] = useState<SavedPlace[]>([]);
  const [recents, setRecents] = useState<SavedPlace[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const handleTripFinalizePersistError = useCallback((error: unknown, status: 'completed' | 'cancelled') => {
    logger.warn('[useNavigation] Не удалось сохранить завершение поездки', { status, error });
    toast.error('Поездка не сохранена');
  }, []);

  // Load user, favorites, and recents from Supabase
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      setUserId(user.id);

      const [savedPlaces, history] = await Promise.all([
        getSavedPlaces(user.id),
        getSearchHistory(user.id),
      ]);

      if (cancelled) return;

      if (savedPlaces.length > 0) {
        setFavorites(savedPlaces);
      }

      if (history.length > 0) {
        setRecents(history);
      }

      const account = await quantumTransportService.initUser(user.id).catch(() => null);
      if (!cancelled) {
        setTimeAccount(account);
      }
    })();
    return () => { cancelled = true; };
  }, [travelMode]);

  useEffect(() => {
    const insights = quantumTransportService.buildLiveInsights({
      route,
      alternatives: alternativeRoutes,
      userId,
      travelMode,
      origin: currentPosition,
      destination: destination?.coordinates ?? null,
    });
    setQuantumSuperposition(insights.quantumSuperposition);
    setTwinSimulation(insights.twinSimulation);
    setSwarmRecommendation(insights.swarmRecommendation);
    setTimeAccount(insights.timeAccount);
  }, [route, alternativeRoutes, userId, travelMode, currentPosition, destination]);

  useEffect(() => () => {
    quantumTransportService.clearLiveSession();
  }, []);

  useEffect(() => {
    void loadLaneData();
  }, []);

  // Derived values
  const maneuvers = route?.maneuvers ?? [];
  const nextInstruction = maneuvers[currentManeuverIndex] ?? null;
  const followingInstruction = maneuvers[currentManeuverIndex + 1] ?? null;

  const distanceToNextTurn = nextInstruction && currentPosition
    ? calculateDistance(currentPosition, nextInstruction.location) * 1000
    : 0;

  const remainingDistance = route
    ? maneuvers.slice(currentManeuverIndex).reduce((s, m) => s + m.distanceMeters, 0)
    : 0;

  const remainingTime = route
    ? maneuvers.slice(currentManeuverIndex).reduce((s, m) => s + m.durationSeconds, 0)
    : 0;

  const eta = formatETA(remainingTime);

  const laneGuidance = route && currentPosition
    ? getLaneGuidance(nextInstruction, distanceToNextTurn, currentPosition, route.geometry)
    : null;

  // Speak voice instruction — uses enhanced voice assistant
  const speak = useCallback((text: string, eventType: 'turn' | 'camera' | 'arrival' | 'reroute' | 'info' = 'info') => {
    speakNavigation(text, eventType);
  }, []);

  // Open search
  const openSearch = useCallback(() => setPhase('search'), []);
  const closeSearch = useCallback(() => setPhase('idle'), []);

  // Select destination and build route
  const selectDestination = useCallback(async (place: SavedPlace) => {
    setDestination(place);
    setPhase('route_preview');
    setLoading(true);
    const startedAt = performance.now();

    // Add to recents (local + Supabase)
    setRecents((prev) => {
      const filtered = prev.filter((p) => p.id !== place.id);
      return [{ ...place, icon: 'recent' as const }, ...filtered].slice(0, 10);
    });

    if (userId) {
      saveSearchEntry(userId, place.name, {
        type: 'address',
        id: place.fiasId,
        label: place.address || place.name,
        coordinates: place.coordinates,
      }).catch(() => {});
    }

    const from = currentPosition ?? getSavedCenter() ?? MOSCOW_CENTER;

    try {
      const result = await fetchRoute(from, place.coordinates, true, travelMode, effectiveTransitOptions, pedestrianOptions);
      recordRouteBuildLatency(performance.now() - startedAt, result.source);
      if (result.source !== 'navigation_server' && (travelMode === 'car' || travelMode === 'taxi')) {
        recordFallbackUsage('routing', `select_destination:${result.source}`);
      }
      // Fill in Russian instructions
      result.main.maneuvers.forEach((m) => {
        m.instruction = getManeuverInstruction(m.type, m.streetName);
      });
      result.alternatives.forEach((alt) => {
        alt.maneuvers.forEach((m) => {
          m.instruction = getManeuverInstruction(m.type, m.streetName);
        });
      });
      setRoute(result.main);
      setAlternativeRoutes(result.alternatives);
      setMultimodalRoute(result.multimodal ?? null);
      previewModeKeyRef.current = previewModeKey;
      // Строим spatial index для off-route проверки O(1)
      isOnRouteRef.current = buildRouteProximityChecker(result.main.geometry);
      quantumTransportService.recordRouteBuild({ success: true, latencyMs: performance.now() - startedAt, travelMode, destinationId: place.id, userId });
    } catch (err) {
      logger.error('[useNavigation] Ошибка построения маршрута', err);
      toast.error('Не удалось построить маршрут, проверьте подключение');
      quantumTransportService.recordRouteBuild({
        success: false,
        latencyMs: performance.now() - startedAt,
        travelMode,
        destinationId: place.id,
        userId,
        errorType: 'route_build_failed',
      });
      setRoute(null);
      setAlternativeRoutes([]);
      setPhase('idle');
    } finally {
      setLoading(false);
    }
  }, [currentPosition, effectiveTransitOptions, pedestrianOptions, previewModeKey, travelMode, userId]);

  useEffect(() => {
    if (phase !== 'route_preview' || !destination || !route) return;
    if (previewModeKeyRef.current === previewModeKey) return;

    let cancelled = false;
    const from = currentPosition ?? getSavedCenter() ?? MOSCOW_CENTER;
    setLoading(true);

    void (async () => {
      try {
        const result = await fetchRoute(from, destination.coordinates, true, travelMode, effectiveTransitOptions, pedestrianOptions);
        if (cancelled) return;
        if (result.source !== 'navigation_server' && (travelMode === 'car' || travelMode === 'taxi')) {
          recordFallbackUsage('routing', `preview_rebuild:${result.source}`);
        }
        result.main.maneuvers.forEach((m) => {
          m.instruction = getManeuverInstruction(m.type, m.streetName);
        });
        result.alternatives.forEach((alt) => {
          alt.maneuvers.forEach((m) => {
            m.instruction = getManeuverInstruction(m.type, m.streetName);
          });
        });
        setRoute(result.main);
        setAlternativeRoutes(result.alternatives);
        setMultimodalRoute(result.multimodal ?? null);
        isOnRouteRef.current = buildRouteProximityChecker(result.main.geometry);
        previewModeKeyRef.current = previewModeKey;
      } catch (err) {
        if (!cancelled) {
          logger.error('[useNavigation] Ошибка перестроения превью маршрута', err);
          toast.error('Не удалось обновить маршрут для выбранного режима');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentPosition, destination, effectiveTransitOptions, pedestrianOptions, phase, previewModeKey, route, travelMode]);

  // Select alternative route
  const selectRoute = useCallback((routeId: string) => {
    const alt = alternativeRoutes.find((r) => r.id === routeId);
    if (alt && route) {
      if (userId) {
        void quantumTransportService.trackRouteSelection({
          selectedRoute: alt,
          alternatives: [route, ...alternativeRoutes.filter((r) => r.id !== routeId)],
          userId,
          travelMode,
        }).catch(() => {});
      }
      setAlternativeRoutes((prev) => [route, ...prev.filter((r) => r.id !== routeId)]);
      setRoute(alt);
    }
  }, [alternativeRoutes, route, userId, travelMode]);

  // Start navigation
  const startNavigation = useCallback(() => {
    if (!route) return;
    setPhase('navigating');
    setCurrentManeuverIndex(0);
    voiceSpokenRef.current.clear();
    speakNavigation('Маршрут построен. Начните движение.', 'info');
    // Запуск crowdsourced сбора GPS-проб для трафика
    startTrafficCollection();
    // Начать запись поездки
    if (currentPosition && destination) {
      startTripRecording(
        currentPosition,
        'Текущее местоположение',
        '',
        destination,
        route,
      );
    }
    quantumTransportService.handleNavigationStart(userId, route.id);
  }, [route, speak, currentPosition, destination, userId]);

  // Stop navigation
  const stopNavigation = useCallback(() => {
    // Сохранить поездку перед очисткой
    const wasNavigating = phase === 'navigating' || phase === 'arrived';
    if (wasNavigating) {
      const status = phase === 'arrived' ? 'completed' : 'cancelled';
      endTripRecording(status).catch((error) => {
        handleTripFinalizePersistError(error, status);
      });
    }
    setPhase('idle');
    setRoute(null);
    setAlternativeRoutes([]);
    setDestination(null);
    setMultimodalRoute(null);
    setCurrentManeuverIndex(0);
    setNearbyCamera(null);
    setSpeedLimit(null);
    previewModeKeyRef.current = null;
    voiceSpokenRef.current.clear();
    window.speechSynthesis?.cancel();
    // Остановить сбор GPS-проб
    stopTrafficCollection();
    quantumTransportService.clearLiveSession();
  }, [handleTripFinalizePersistError, phase]);

  // Toggle voice
  const toggleVoice = useCallback(() => {
    setVoiceEnabled(!voiceEnabled);
    if (voiceEnabled) window.speechSynthesis?.cancel();
  }, [setVoiceEnabled, voiceEnabled]);

  // Toggle orientation
  const toggleOrientation = useCallback(() => setIsNorthUp((v) => !v), []);

  // Update position from geolocation hook
  const updatePosition = useCallback((pos: LatLng, heading: number, speed: number) => {
    setCurrentPosition(pos);
    setCurrentHeading(heading);
    setCurrentSpeed(speed);
    // сохраняем последний известный центр
    try { localStorage.setItem('nav_last_center', JSON.stringify(pos)); } catch { /* quota */ }
    // Отправляем GPS-пробу для crowdsourced трафика
    addTrafficProbe(pos, speed, heading, null);
    // Обновляем запись поездки
    updateTripPosition(pos, speed);
  }, []);

  // Navigation logic: maneuver progression, off-route, cameras
  useEffect(() => {
    if (phase !== 'navigating' || !route || !currentPosition) return;

    // Check arrival
    if (destination) {
      const distToDest = calculateDistance(currentPosition, destination.coordinates);
      if (distToDest < ARRIVAL_THRESHOLD_KM) {
        speakArrival();
        setPhase('arrived');
        // Завершить запись поездки
        endTripRecording('completed').catch((error) => {
          handleTripFinalizePersistError(error, 'completed');
        });
        if (userId && route) {
          setTimeAccount(quantumTransportService.handleNavigationArrival({
            userId,
            route,
            alternatives: alternativeRoutes,
          }));
        }
        return;
      }
    }

    // Advance maneuver
    if (nextInstruction) {
      const distToManeuver = calculateDistance(currentPosition, nextInstruction.location);
      if (distToManeuver < MANEUVER_COMPLETE_KM && currentManeuverIndex < maneuvers.length - 1) {
        setCurrentManeuverIndex((i) => i + 1);
      }
    }

    // Voice warnings at specific distances
    if (nextInstruction) {
      const distM = distanceToNextTurn;
      for (const threshold of VOICE_WARN_DISTANCES) {
        const key = `${currentManeuverIndex}-${threshold}`;
        if (distM <= threshold && distM > threshold - 30 && !voiceSpokenRef.current.has(key)) {
          voiceSpokenRef.current.add(key);
          speakTurn(getVoiceInstruction(nextInstruction.type, distM, nextInstruction.streetName), distM);
          break;
        }
      }
    }

    // Speed cameras
    const cam = getNearbyCamera(currentPosition, currentHeading);
    setNearbyCamera(cam);
    if (cam) {
      setSpeedLimit(cam.speedLimit);
      const camDist = getCameraDistance(currentPosition, cam);
      const key = `cam-${cam.id}`;
      if (camDist < 500 && !voiceSpokenRef.current.has(key)) {
        voiceSpokenRef.current.add(key);
        speakCamera(cam.speedLimit, camDist);
      }
    } else {
      // Use route segment speed limit
      const seg = route.segments.find((s) =>
        s.points.some((p) => calculateDistance(currentPosition!, p) < 0.05)
      );
      setSpeedLimit(seg?.speedLimit ?? null);
    }

    // Off-route: O(1) spatial grid проверка
    const onRoute = isOnRouteRef.current
      ? isOnRouteRef.current(currentPosition!)
      : route.geometry.some(
          (p) => calculateDistance(currentPosition!, p) < OFF_ROUTE_THRESHOLD_KM
        );
    if (!onRoute && !recalcTimeoutRef.current) {
      recalcTimeoutRef.current = setTimeout(async () => {
        speakReroute();
        const rerouteStarted = performance.now();
        try {
          const result = await fetchRoute(currentPosition!, destination!.coordinates, false, travelMode, effectiveTransitOptions, pedestrianOptions);
          recordRerouteLatency(performance.now() - rerouteStarted, result.source);
          if (result.source !== 'navigation_server' && (travelMode === 'car' || travelMode === 'taxi')) {
            recordFallbackUsage('routing', `reroute:${result.source}`);
          }
          result.main.maneuvers.forEach((m) => {
            m.instruction = getManeuverInstruction(m.type, m.streetName);
          });
          setRoute(result.main);
          setCurrentManeuverIndex(0);
          voiceSpokenRef.current.clear();
          isOnRouteRef.current = buildRouteProximityChecker(result.main.geometry);
        } catch {
          // keep current route
          recordFallbackUsage('routing', 'reroute_failed_keep_current');
        }
        recalcTimeoutRef.current = null;
      }, 3000);
    }
  }, [alternativeRoutes, currentHeading, currentPosition, destination, effectiveTransitOptions, handleTripFinalizePersistError, pedestrianOptions, phase, route, travelMode, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload favorites from Supabase
  const reloadFavorites = useCallback(async () => {
    if (!userId) return;
    const savedPlaces = await getSavedPlaces(userId);
    if (savedPlaces.length > 0) {
      setFavorites(savedPlaces);
    }
  }, [userId]);

  return {
    phase,
    currentPosition,
    currentHeading,
    currentSpeed,
    destination,
    route,
    alternativeRoutes,
    multimodalRoute,
    currentManeuverIndex,
    nextInstruction,
    followingInstruction,
    distanceToNextTurn,
    remainingDistance,
    remainingTime,
    eta,
    laneGuidance,
    speedLimit,
    nearbyCamera,
    voiceEnabled,
    isNorthUp,
    loading,
    quantumSuperposition,
    twinSimulation,
    swarmRecommendation,
    timeAccount,
    favorites,
    recents,
    userId,
    openSearch,
    closeSearch,
    selectDestination,
    selectRoute,
    startNavigation,
    stopNavigation,
    toggleVoice,
    toggleOrientation,
    updatePosition,
    reloadFavorites,
  };
}
