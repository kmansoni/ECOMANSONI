import { useState, useCallback, useEffect, useRef } from 'react';
import type { LatLng } from '@/types/taxi';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/lib/taxi/constants';
import { calculateRoute, getNearbyDrivers } from '@/lib/taxi/api';

interface NearbyDriver {
  id: string;
  location: LatLng;
  tariff: string;
}

interface UseTaxiMapState {
  center: LatLng;
  zoom: number;
  userLocation: LatLng | null;
  routePoints: LatLng[];
  driverPosition: LatLng | null;
  driverHeading: number;
  pickupMarker: LatLng | null;
  destinationMarker: LatLng | null;
  nearbyDrivers: NearbyDriver[];
  isLocating: boolean;
}

export function useTaxiMap() {
  const [state, setState] = useState<UseTaxiMapState>({
    center: DEFAULT_MAP_CENTER,
    zoom: DEFAULT_MAP_ZOOM,
    userLocation: null,
    routePoints: [],
    driverPosition: null,
    driverHeading: 0,
    pickupMarker: null,
    destinationMarker: null,
    nearbyDrivers: [],
    isLocating: false,
  });

  // Ref для Leaflet map instance
  const mapRef = useRef<L.Map | null>(null);

  // ─── Запросить геопозицию пользователя ────────────────────────────────────
  const locateUser = useCallback(() => {
    if (!navigator.geolocation) return;

    setState((s) => ({ ...s, isLocating: true }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setState((s) => ({
          ...s,
          userLocation: loc,
          center: loc,
          zoom: 15,
          isLocating: false,
        }));
      },
      () => {
        // Fallback на Москву при ошибке геолокации
        setState((s) => ({
          ...s,
          center: DEFAULT_MAP_CENTER,
          isLocating: false,
        }));
      },
      { timeout: 5000, maximumAge: 30000 }
    );
  }, []);

  // ─── Центрировать карту на пользователе ───────────────────────────────────
  const centerOnUser = useCallback(() => {
    if (state.userLocation) {
      setState((s) => ({
        ...s,
        center: s.userLocation!,
        zoom: 15,
      }));
    } else {
      locateUser();
    }
  }, [state.userLocation, locateUser]);

  // ─── Установить маркер подачи ─────────────────────────────────────────────
  const setPickupMarker = useCallback((location: LatLng | null) => {
    setState((s) => ({ ...s, pickupMarker: location }));
  }, []);

  // ─── Установить маркер назначения ─────────────────────────────────────────
  const setDestinationMarker = useCallback((location: LatLng | null) => {
    setState((s) => ({ ...s, destinationMarker: location }));
  }, []);

  // ─── Рассчитать и отобразить маршрут ─────────────────────────────────────
  const showRoute = useCallback(
    async (from: LatLng, to: LatLng) => {
      try {
        const points = await calculateRoute(from, to);
        setState((s) => ({
          ...s,
          routePoints: points,
          pickupMarker: from,
          destinationMarker: to,
        }));

        // Центрировать карту чтобы маршрут влез
        fitBoundsToRoute(from, to);
      } catch {
        // Если ошибка — просто соединить прямой линией
        setState((s) => ({
          ...s,
          routePoints: [from, to],
          pickupMarker: from,
          destinationMarker: to,
        }));
      }
    },
    [] // eslint-disable-line
  );

  // ─── Вписать маршрут в видимую область карты ─────────────────────────────
  const fitBoundsToRoute = useCallback((from: LatLng, to: LatLng) => {
    const padding = 0.005;
    const minLat = Math.min(from.lat, to.lat) - padding;
    const maxLat = Math.max(from.lat, to.lat) + padding;
    const minLng = Math.min(from.lng, to.lng) - padding;
    const maxLng = Math.max(from.lng, to.lng) + padding;

    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // Приблизительный зум
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const maxDiff = Math.max(latDiff, lngDiff);
    const zoom = maxDiff < 0.01 ? 15 : maxDiff < 0.05 ? 13 : maxDiff < 0.1 ? 12 : 11;

    setState((s) => ({
      ...s,
      center: { lat: centerLat, lng: centerLng },
      zoom,
    }));
  }, []);

  // ─── Обновить позицию водителя ────────────────────────────────────────────
  const updateDriverPosition = useCallback(
    (position: LatLng, heading: number = 0) => {
      setState((s) => ({
        ...s,
        driverPosition: position,
        driverHeading: heading,
      }));
    },
    []
  );

  // ─── Очистить маршрут ─────────────────────────────────────────────────────
  const clearRoute = useCallback(() => {
    setState((s) => ({
      ...s,
      routePoints: [],
      pickupMarker: null,
      destinationMarker: null,
      driverPosition: null,
    }));
  }, []);

  // ─── Загрузить водителей рядом для idle-экрана ────────────────────────────
  const loadNearbyDrivers = useCallback(async (location: LatLng) => {
    try {
      const drivers = await getNearbyDrivers(location);
      setState((s) => ({ ...s, nearbyDrivers: drivers }));
    } catch {
      // Тихая ошибка — водители рядом необязательны
    }
  }, []);

  // ─── Инициализация: геопозиция и nearby drivers ───────────────────────────
  useEffect(() => {
    locateUser();
  }, [locateUser]);

  useEffect(() => {
    loadNearbyDrivers(state.userLocation ?? DEFAULT_MAP_CENTER);
  }, [state.userLocation, loadNearbyDrivers]);

  return {
    // Состояние
    center: state.center,
    zoom: state.zoom,
    userLocation: state.userLocation,
    routePoints: state.routePoints,
    driverPosition: state.driverPosition,
    driverHeading: state.driverHeading,
    pickupMarker: state.pickupMarker,
    destinationMarker: state.destinationMarker,
    nearbyDrivers: state.nearbyDrivers,
    isLocating: state.isLocating,
    mapRef,

    // Действия
    locateUser,
    centerOnUser,
    setPickupMarker,
    setDestinationMarker,
    showRoute,
    fitBoundsToRoute,
    updateDriverPosition,
    clearRoute,
    loadNearbyDrivers,

    // Сеттеры
    setCenter: (center: LatLng) => setState((s) => ({ ...s, center })),
    setZoom: (zoom: number) => setState((s) => ({ ...s, zoom })),
  };
}
