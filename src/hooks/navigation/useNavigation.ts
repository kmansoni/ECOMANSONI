import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '@/types/taxi';
import type {
  NavigationPhase,
  NavRoute,
  Maneuver,
  SpeedCamera,
  SavedPlace,
} from '@/types/navigation';
import { fetchRoute, generateFallbackRoute } from '@/lib/navigation/routing';
import { getManeuverInstruction, getVoiceInstruction, formatETA } from '@/lib/navigation/turnInstructions';
import { getNearbyCamera, getCameraDistance } from '@/lib/navigation/speedCameras';
import { calculateDistance } from '@/lib/taxi/calculations';
import { getSavedPlaces, getSearchHistory, saveSearchEntry } from '@/lib/navigation/places';
import { supabase } from '@/lib/supabase';

const DEFAULT_FAVORITES: SavedPlace[] = [
  { id: 'home', name: 'Дом', address: '', coordinates: { lat: 0, lng: 0 }, icon: 'home' },
  { id: 'work', name: 'Работа', address: '', coordinates: { lat: 0, lng: 0 }, icon: 'work' },
];

const OFF_ROUTE_THRESHOLD_KM = 0.05; // 50m
const MANEUVER_COMPLETE_KM = 0.03; // 30m
const ARRIVAL_THRESHOLD_KM = 0.03; // 30m
const VOICE_WARN_DISTANCES = [500, 200, 50]; // meters

export function useNavigation() {
  const [phase, setPhase] = useState<NavigationPhase>('idle');
  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null);
  const [currentHeading, setCurrentHeading] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [destination, setDestination] = useState<SavedPlace | null>(null);
  const [route, setRoute] = useState<NavRoute | null>(null);
  const [alternativeRoutes, setAlternativeRoutes] = useState<NavRoute[]>([]);
  const [currentManeuverIndex, setCurrentManeuverIndex] = useState(0);
  const [speedLimit, setSpeedLimit] = useState<number | null>(null);
  const [nearbyCamera, setNearbyCamera] = useState<SpeedCamera | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isNorthUp, setIsNorthUp] = useState(false);
  const [loading, setLoading] = useState(false);

  const voiceSpokenRef = useRef<Set<string>>(new Set());
  const recalcTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [favorites, setFavorites] = useState<SavedPlace[]>(DEFAULT_FAVORITES);
  const [recents, setRecents] = useState<SavedPlace[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

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
        const home = savedPlaces.find((p) => p.icon === 'home');
        const work = savedPlaces.find((p) => p.icon === 'work');
        const custom = savedPlaces.filter((p) => p.icon !== 'home' && p.icon !== 'work');
        setFavorites([
          home ?? DEFAULT_FAVORITES[0],
          work ?? DEFAULT_FAVORITES[1],
          ...custom,
        ]);
      }

      if (history.length > 0) {
        setRecents(history);
      }
    })();
    return () => { cancelled = true; };
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

  // Speak voice instruction
  const speak = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    u.rate = 1.05;
    window.speechSynthesis.speak(u);
  }, [voiceEnabled]);

  // Open search
  const openSearch = useCallback(() => setPhase('search'), []);
  const closeSearch = useCallback(() => setPhase('idle'), []);

  // Select destination and build route
  const selectDestination = useCallback(async (place: SavedPlace) => {
    setDestination(place);
    setPhase('route_preview');
    setLoading(true);

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

    const from = currentPosition ?? { lat: 55.7558, lng: 37.6173 };

    try {
      const result = await fetchRoute(from, place.coordinates);
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
    } catch {
      const fallback = generateFallbackRoute(from, place.coordinates);
      fallback.maneuvers.forEach((m) => {
        m.instruction = getManeuverInstruction(m.type, m.streetName);
      });
      setRoute(fallback);
      setAlternativeRoutes([]);
    } finally {
      setLoading(false);
    }
  }, [currentPosition]);

  // Select alternative route
  const selectRoute = useCallback((routeId: string) => {
    const alt = alternativeRoutes.find((r) => r.id === routeId);
    if (alt && route) {
      setAlternativeRoutes((prev) => [route, ...prev.filter((r) => r.id !== routeId)]);
      setRoute(alt);
    }
  }, [alternativeRoutes, route]);

  // Start navigation
  const startNavigation = useCallback(() => {
    if (!route) return;
    setPhase('navigating');
    setCurrentManeuverIndex(0);
    voiceSpokenRef.current.clear();
    speak('Маршрут построен. Начните движение.');
  }, [route, speak]);

  // Stop navigation
  const stopNavigation = useCallback(() => {
    setPhase('idle');
    setRoute(null);
    setAlternativeRoutes([]);
    setDestination(null);
    setCurrentManeuverIndex(0);
    setNearbyCamera(null);
    setSpeedLimit(null);
    voiceSpokenRef.current.clear();
    window.speechSynthesis?.cancel();
  }, []);

  // Toggle voice
  const toggleVoice = useCallback(() => {
    setVoiceEnabled((v) => !v);
    if (voiceEnabled) window.speechSynthesis?.cancel();
  }, [voiceEnabled]);

  // Toggle orientation
  const toggleOrientation = useCallback(() => setIsNorthUp((v) => !v), []);

  // Update position from geolocation hook
  const updatePosition = useCallback((pos: LatLng, heading: number, speed: number) => {
    setCurrentPosition(pos);
    setCurrentHeading(heading);
    setCurrentSpeed(speed);
  }, []);

  // Navigation logic: maneuver progression, off-route, cameras
  useEffect(() => {
    if (phase !== 'navigating' || !route || !currentPosition) return;

    // Check arrival
    if (destination) {
      const distToDest = calculateDistance(currentPosition, destination.coordinates);
      if (distToDest < ARRIVAL_THRESHOLD_KM) {
        speak('Вы прибыли в пункт назначения');
        setPhase('arrived');
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
          speak(getVoiceInstruction(nextInstruction.type, distM, nextInstruction.streetName));
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
        speak(`Внимание, камера. Ограничение ${cam.speedLimit} километров в час.`);
      }
    } else {
      // Use route segment speed limit
      const seg = route.segments.find((s) =>
        s.points.some((p) => calculateDistance(currentPosition!, p) < 0.05)
      );
      setSpeedLimit(seg?.speedLimit ?? null);
    }

    // Off-route detection
    const onRoute = route.geometry.some(
      (p) => calculateDistance(currentPosition!, p) < OFF_ROUTE_THRESHOLD_KM
    );
    if (!onRoute && !recalcTimeoutRef.current) {
      recalcTimeoutRef.current = setTimeout(async () => {
        speak('Перестроение маршрута');
        try {
          const result = await fetchRoute(currentPosition!, destination!.coordinates, false);
          result.main.maneuvers.forEach((m) => {
            m.instruction = getManeuverInstruction(m.type, m.streetName);
          });
          setRoute(result.main);
          setCurrentManeuverIndex(0);
          voiceSpokenRef.current.clear();
        } catch {
          // keep current route
        }
        recalcTimeoutRef.current = null;
      }, 3000);
    }
  }, [currentPosition, currentHeading, phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload favorites from Supabase
  const reloadFavorites = useCallback(async () => {
    if (!userId) return;
    const savedPlaces = await getSavedPlaces(userId);
    if (savedPlaces.length > 0) {
      const home = savedPlaces.find((p) => p.icon === 'home');
      const work = savedPlaces.find((p) => p.icon === 'work');
      const custom = savedPlaces.filter((p) => p.icon !== 'home' && p.icon !== 'work');
      setFavorites([
        home ?? DEFAULT_FAVORITES[0],
        work ?? DEFAULT_FAVORITES[1],
        ...custom,
      ]);
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
    currentManeuverIndex,
    nextInstruction,
    followingInstruction,
    distanceToNextTurn,
    remainingDistance,
    remainingTime,
    eta,
    speedLimit,
    nearbyCamera,
    voiceEnabled,
    isNorthUp,
    loading,
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
