/**
 * MapLibre3D — Full 3D navigation map inspired by Amap.
 * Uses MapLibre GL JS with free vector tiles for:
 *   - 3D perspective (pitch/bearing)
 *   - 3D extruded buildings
 *   - Smooth route rendering with traffic colors
 *   - Animated car icon with heading
 *   - Speed camera markers
 *   - Destination pin
 */
import { useEffect, useRef, useState, memo } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LatLng } from '@/types/taxi';
import type { Maneuver, RouteSegment, SpeedCamera, NavRoute, TrafficLevel, MultiModalRoute } from '@/types/navigation';
import { useNavigatorSettings } from '@/stores/navigatorSettingsStore';
import { getVehicleMarkerSVG } from '@/lib/navigation/vehicleMarkers';
import { useRoadEvents, getRoadEventInfo } from '@/stores/roadEventsStore';
import { getRelevantMapObjects, loadRoadFeatures } from '@/lib/navigation/roadFeatures';
import { getStyleUrl, addEnhancedRoadLayers, addTerrain, applyMapThemeEnhancements, type MapTheme } from '@/lib/map/vectorTileProvider';
import { ensureNavigationLayers, updateNavigationObjectSource } from '@/lib/map/navigationLayers';
import { getNearbyTrafficLights, type TrafficLightStatus } from '@/lib/navigation/trafficLightTiming';
import { getBuildingExtrusionColorExpression, getProductionPalette } from '@/lib/map/mapStyles';
import { fetchTrafficInBbox, type TrafficSegment } from '@/lib/navigation/trafficProvider';
import { useUserSettings } from '@/contexts/UserSettingsContext';

// ─── Style URLs: auto-detect MapTiler or fallback to CartoDB ────────────────
const STYLES = {
  dark: getStyleUrl('dark'),
  light: getStyleUrl('light'),
  satellite: getStyleUrl('satellite'),
  hybrid: getStyleUrl('hybrid'),
  terrain: getStyleUrl('terrain'),
  streets: getStyleUrl('streets'),
  // Legacy keys for compatibility
  voyager: getStyleUrl('light'),
  positron: getStyleUrl('light'),
  darkNolabels: getStyleUrl('dark'),
} as const;

export type MapStyle = keyof typeof STYLES;

// ─── Traffic colors ─────────────────────────────────────────────────────────
const TRAFFIC_COLORS: Record<TrafficLevel, string> = {
  free: '#00E676',
  moderate: '#FFAB00',
  slow: '#FF6D00',
  congested: '#F44336',
  unknown: '#42A5F5',
};

const TRAFFIC_OVERLAY_SOURCE_ID = 'traffic-overlay-source';
const TRAFFIC_OVERLAY_LAYER_ID = 'traffic-overlay-layer';
const TRANSIT_OVERLAY_SOURCE_ID = 'transit-overlay-source';
const TRANSIT_LINE_LAYER_ID = 'transit-overlay-lines';
const TRANSIT_STATION_LAYER_ID = 'transit-overlay-stations';
const TRANSIT_LABEL_LAYER_ID = 'transit-overlay-labels';

// ─── Traffic light colors ───────────────────────────────────────────────────
const TL_COLORS = {
  red: '#EF4444',
  yellow: '#F59E0B',
  green: '#22C55E',
};

// ─── Props ──────────────────────────────────────────────────────────────────
export interface MapLibre3DProps {
  center: LatLng;
  zoom: number;
  heading: number;
  pitch?: number;
  isNorthUp: boolean;
  isNavigating: boolean;
  userPosition: LatLng | null;
  routeSegments: RouteSegment[];
  route?: NavRoute | null;
  multimodalRoute?: MultiModalRoute | null;
  selectedMultimodalSegmentIndex?: number | null;
  speedCameras: SpeedCamera[];
  destinationMarker: LatLng | null;
  recenterTrigger?: number;
  nextManeuver?: Maneuver | null;
  mapStyle?: MapStyle;
  onMapClick?: (latlng: LatLng) => void;
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────
export const MapLibre3D = memo(function MapLibre3D({
  center,
  zoom,
  heading,
  pitch: propPitch,
  isNorthUp,
  isNavigating,
  userPosition,
  routeSegments,
  route = null,
  multimodalRoute = null,
  selectedMultimodalSegmentIndex = null,
  speedCameras,
  destinationMarker,
  recenterTrigger = 0,
  nextManeuver = null,
  mapStyle = 'dark',
  onMapClick,
  className = '',
}: MapLibre3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const carMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const eventMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [isReady, setIsReady] = useState(false);
  const animFrameRef = useRef<number | null>(null);

  // Get settings for vehicle marker + display toggles
  const navSettings = useNavigatorSettings();
  const { events: roadEvents } = useRoadEvents();
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;

  // Navigation pitch: 60° for Amap-like tilt, 0° for top-down
  const pitch = propPitch ?? (isNavigating ? 60 : 0);
  const bearing = isNorthUp ? 0 : -heading;

  // Загрузка данных дорожных объектов при монтировании
  useEffect(() => { loadRoadFeatures(); }, []);

  // ── Initialize map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLES[mapStyle],
      center: [center.lng, center.lat],
      zoom,
      pitch: isNavigating ? 60 : 0,
      bearing: isNorthUp ? 0 : -heading,
      attributionControl: false,
      maxPitch: 70,
    });

    const applyManagedLayers = () => {
      if (!map.isStyleLoaded()) return;

      applyMapThemeEnhancements(map, mapStyle, languageCode);

      if (navSettings.show3DBuildings) {
        add3DBuildings(map, mapStyle);
      }
      addEnhancedRoadLayers(map, navSettings.labelSizeMultiplier, navSettings.highContrastLabels, mapStyle, languageCode);
      ensureNavigationLayers(map, {
        labelSizeMultiplier: navSettings.labelSizeMultiplier,
        highContrast: navSettings.highContrastLabels,
        theme: mapStyle,
      });
      if (mapStyle === 'terrain' || mapStyle === 'dark') {
        addTerrain(map);
      }
    };

    map.on('load', () => {
      applyManagedLayers();
      setIsReady(true);
    });

    map.on('styledata', applyManagedLayers);

    map.on('click', (e) => {
      onMapClick?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    mapRef.current = map;

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      carMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
      eventMarkersRef.current.forEach(m => m.remove());
      carMarkerRef.current = null;
      destMarkerRef.current = null;
      eventMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
      setIsReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [languageCode, mapStyle]);

   // ── Dynamic label updates when settings change ────────────────────────────
   useEffect(() => {
     const map = mapRef.current;
     if (!map || !isReady) return;

     ensureNavigationLayers(map, {
       labelSizeMultiplier: navSettings.labelSizeMultiplier,
       highContrast: navSettings.highContrastLabels,
       theme: mapStyle,
     });

     // Compute scaled sizes
     const baseRoadSizes = [11, 13, 15, 17, 19];
     const scaledRoadSizes = baseRoadSizes.map(s => s * navSettings.labelSizeMultiplier);
     const [r12, r14, r16, r18, r20] = scaledRoadSizes;

     const baseHNSizes = [10, 13, 15];
     const scaledHNSizes = baseHNSizes.map(s => s * navSettings.labelSizeMultiplier);
     const [hn16, hn18, hn20] = scaledHNSizes;

     const haloWidth = navSettings.highContrastLabels ? 4 : 3;
     const haloBlur = navSettings.highContrastLabels ? 0 : 0.5;

     // Update road label layer
     try {
       map.setLayoutProperty('enhanced-road-labels', 'text-size', [
         'interpolate', ['linear'], ['zoom'],
         12, r12,
         14, r14,
         16, r16,
         18, r18,
         20, r20,
       ]);
       map.setPaintProperty('enhanced-road-labels', 'text-halo-width', haloWidth);
       map.setPaintProperty('enhanced-road-labels', 'text-halo-blur', haloBlur);
     } catch (e) {
       // Layer not yet created
     }

     // Update house number layer
     try {
       map.setLayoutProperty('enhanced-house-numbers', 'text-size', [
         'interpolate', ['linear'], ['zoom'],
         16, hn16,
         18, hn18,
         20, hn20,
       ]);
       map.setPaintProperty('enhanced-house-numbers', 'text-halo-width', haloWidth);
       map.setPaintProperty('enhanced-house-numbers', 'text-halo-blur', haloBlur);
     } catch (e) {
       // Layer not yet created
     }
    }, [navSettings.labelSizeMultiplier, navSettings.highContrastLabels, isReady]);

  // ── City-wide traffic overlay ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    if (!navSettings.showTrafficFlowOverlay) {
      removeTrafficOverlay(map);
      return;
    }

    let disposed = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const refreshTrafficOverlay = async () => {
      try {
        const bounds = map.getBounds();
        const segments = await fetchTrafficInBbox(
          bounds.getSouth(),
          bounds.getWest(),
          bounds.getNorth(),
          bounds.getEast(),
        );
        if (disposed) return;
        upsertTrafficOverlay(map, segments);
      } catch (error) {
        console.warn('[MapLibre3D] Traffic overlay update failed:', error);
      }
    };

    void refreshTrafficOverlay();
    map.on('moveend', refreshTrafficOverlay);
    timer = setInterval(() => {
      void refreshTrafficOverlay();
    }, 120_000);

    return () => {
      disposed = true;
      map.off('moveend', refreshTrafficOverlay);
      if (timer) clearInterval(timer);
      removeTrafficOverlay(map);
    };
  }, [isReady, mapStyle, navSettings.showTrafficFlowOverlay]);

  // ── Transit and metro overlay ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    if (!navSettings.showTransitOverlay || !multimodalRoute || multimodalRoute.segments.length === 0) {
      removeTransitOverlay(map);
      return;
    }

    upsertTransitOverlay(map, multimodalRoute, selectedMultimodalSegmentIndex);

    return () => {
      removeTransitOverlay(map);
    };
  }, [isReady, mapStyle, multimodalRoute, navSettings.showTransitOverlay, selectedMultimodalSegmentIndex]);

   // ── Sync camera ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    if (isNavigating && userPosition) {
      map.easeTo({
        center: [userPosition.lng, userPosition.lat],
        zoom: Math.max(zoom, 16.5),
        pitch,
        bearing,
        duration: 800,
        easing: (t) => t * (2 - t), // ease-out quad
      });
    } else {
      map.easeTo({
        center: [center.lng, center.lat],
        zoom,
        pitch,
        bearing,
        duration: 500,
      });
    }
  }, [center.lat, center.lng, zoom, pitch, bearing, isNavigating, userPosition, isReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !userPosition) return;

    map.easeTo({
      center: [userPosition.lng, userPosition.lat],
      zoom: Math.max(map.getZoom(), isNavigating ? 16.5 : 15.5),
      pitch,
      bearing,
      duration: 900,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    });
  }, [recenterTrigger, isReady, userPosition, isNavigating, pitch, bearing]);

  // ── Route rendering ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    // Clear old route layers
    removeRouteLayers(map);

    if (routeSegments.length === 0) return;

    // Render each segment with traffic color
    routeSegments.forEach((segment, i) => {
      if (segment.points.length < 2) return;

      const coords = segment.points.map(p => [p.lng, p.lat] as [number, number]);
      const sourceId = `route-seg-${i}`;
      const layerId = `route-seg-layer-${i}`;
      const outlineId = `route-seg-outline-${i}`;

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
      });

      // Outline (dark border for depth)
      map.addLayer({
        id: outlineId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#000000',
          'line-width': 10,
          'line-opacity': 0.4,
        },
      });

      // Main route line with traffic color
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': TRAFFIC_COLORS[segment.traffic] || TRAFFIC_COLORS.unknown,
          'line-width': 7,
          'line-opacity': 0.9,
        },
      });
    });

    // Fit bounds when not navigating
    if (!isNavigating && routeSegments.length > 0) {
      const allPoints = routeSegments.flatMap(s => s.points);
      if (allPoints.length >= 2) {
        const bounds = new maplibregl.LngLatBounds();
        allPoints.forEach(p => bounds.extend([p.lng, p.lat]));
        map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
      }
    }
  }, [routeSegments, isReady, isNavigating]);

  // ── Car marker ────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    if (!userPosition) {
      carMarkerRef.current?.remove();
      carMarkerRef.current = null;
      return;
    }

    if (!carMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'maplibre-car-marker';
      const vehicleSrc = getVehicleMarkerSVG(navSettings.selectedVehicle, 0);
      const visualState = getVehicleVisualState(nextManeuver);
      el.innerHTML = `
        <div style="
          width: 60px; height: 60px;
          filter: ${getVehicleGlow(visualState)};
          transition: transform 0.3s ease, filter 0.3s ease;
          transform-origin: 50% 50%;
        ">
          <img src="${vehicleSrc}" width="60" height="60" />
        </div>
      `;

      const surface = el.firstElementChild as HTMLDivElement | null;
      if (surface) {
        surface.dataset.heading = String(heading);
        surface.style.transform = `rotate(${heading}deg)`;
      }

      carMarkerRef.current = new maplibregl.Marker({
        element: el,
        rotationAlignment: 'map',
        pitchAlignment: 'map',
      })
        .setLngLat([userPosition.lng, userPosition.lat])
        .addTo(map);
    } else {
      carMarkerRef.current.setLngLat([userPosition.lng, userPosition.lat]);
      // Update vehicle image if changed
      const el = carMarkerRef.current.getElement();
      const surface = el.firstElementChild as HTMLDivElement | null;
      const img = el.querySelector('img');
      if (img) {
        const newSrc = getVehicleMarkerSVG(navSettings.selectedVehicle, 0);
        if (img.src !== newSrc) img.src = newSrc;
      }
      if (surface) {
        surface.style.filter = getVehicleGlow(getVehicleVisualState(nextManeuver));
        applySmoothRotation(surface, heading);
      }
    }
  }, [userPosition, heading, isReady, navSettings.selectedVehicle, nextManeuver]);

  // ── Destination marker ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    if (!destinationMarker) {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
      return;
    }

    const el = document.createElement('div');
    el.innerHTML = `
      <div style="
        width: 40px; height: 52px;
        filter: drop-shadow(0 4px 12px rgba(244,63,94,0.5));
      ">
        <svg width="40" height="52" viewBox="0 0 40 52" fill="none">
          <path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="#F43F5E"/>
          <circle cx="20" cy="20" r="10" fill="#fff"/>
          <circle cx="20" cy="20" r="5" fill="#ef4444"/>
        </svg>
      </div>
    `;

    destMarkerRef.current?.remove();
    destMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([destinationMarker.lng, destinationMarker.lat])
      .addTo(map);
  }, [destinationMarker, isReady]);

  // ── Road events markers ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    eventMarkersRef.current.forEach(m => m.remove());
    eventMarkersRef.current = [];

    const now = Date.now();
    const activeEvents = roadEvents.filter(e => e.expiresAt > now);

    activeEvents.forEach((evt) => {
      const info = getRoadEventInfo(evt.type, languageCode);
      if (!info) return;

      const el = document.createElement('div');
      el.innerHTML = `
        <div style="
          background: rgba(0,0,0,0.75);
          border-radius: 12px;
          padding: 4px 8px;
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid rgba(255,255,255,0.15);
          filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4));
          cursor: pointer;
          white-space: nowrap;
        ">
          <span style="font-size: 16px;">${info.emoji}</span>
          <span style="font-size: 11px; color: white;">${info.label}</span>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([evt.location.lng, evt.location.lat])
        .addTo(map);

      eventMarkersRef.current.push(marker);
    });
  }, [roadEvents, isReady]);

  // ── Route-aware map objects via GeoJSON source ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady) return;

    const anchor = userPosition ?? center;
    const objects = getRelevantMapObjects({
      position: anchor,
      route,
      heading,
      speedCameras,
      showTrafficLights: navSettings.showTrafficLights,
      showSpeedBumps: navSettings.showSpeedBumps,
      showRoadSigns: navSettings.showRoadSigns,
      showSpeedCameras: navSettings.showSpeedCameras,
      showPOI: navSettings.showPOI,
      radiusKm: isNavigating ? 1.8 : 1.2,
    });
    updateNavigationObjectSource(map, objects);
  }, [
    center,
    userPosition,
    heading,
    isNavigating,
    speedCameras,
    route,
    isReady,
    navSettings.showTrafficLights,
    navSettings.showSpeedBumps,
    navSettings.showRoadSigns,
    navSettings.showSpeedCameras,
    navSettings.showPOI,
  ]);

  // ── Traffic light timers (real-time color + countdown) ──────────────────
  const tlTimerMarkersRef = useRef<maplibregl.Marker[]>([]);
  const tlTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isReady || !isNavigating || !userPosition) return;
    if (!navSettings.showTrafficLights) return;

    let cancelled = false;

    async function fetchAndRender() {
      if (cancelled || !userPosition) return;

      try {
        const lights = await getNearbyTrafficLights(userPosition, 300);
        if (cancelled) return;

        // Clear old markers
        tlTimerMarkersRef.current.forEach(m => m.remove());
        tlTimerMarkersRef.current = [];

        lights.slice(0, 10).forEach((light) => {
          const el = document.createElement('div');
          el.className = 'tl-timer-marker';
          updateTLMarkerHtml(el, light);

          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([light.lon, light.lat])
            .addTo(map!);
          tlTimerMarkersRef.current.push(marker);
        });
      } catch { /* no timings available */ }
    }

    fetchAndRender();

    // Refresh every 5 seconds
    tlTimerRef.current = setInterval(fetchAndRender, 5000);

    return () => {
      cancelled = true;
      if (tlTimerRef.current) clearInterval(tlTimerRef.current);
      tlTimerMarkersRef.current.forEach(m => m.remove());
      tlTimerMarkersRef.current = [];
    };
  }, [userPosition?.lat, userPosition?.lng, isReady, isNavigating, navSettings.showTrafficLights]);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Inject animations */}
      <style>{`
        @keyframes car-pulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
          50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.2; }
        }
        @keyframes camera-blink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.08); }
        }
        @keyframes tl-glow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .maplibregl-canvas { outline: none; }
      `}</style>
    </div>
  );
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function add3DBuildings(map: maplibregl.Map, mapStyle: MapStyle) {
  const layers = map.getStyle()?.layers;
  if (!layers) return;
  const palette = getProductionPalette(mapStyle);

  // Find the first label layer to insert buildings underneath
  let labelLayerId: string | undefined;
  for (const layer of layers) {
    if (layer.type === 'symbol' && (layer as any).layout?.['text-field']) {
      labelLayerId = layer.id;
      break;
    }
  }

  // Check if building source exists
  const sources = map.getStyle()?.sources;
  const hasBuildings = sources && Object.keys(sources).some(k =>
    k.includes('carto') || k.includes('openmaptiles') || k === 'composite'
  );

  if (!hasBuildings) return;

  // Find the correct source name
  const sourceId = Object.keys(sources!).find(k =>
    k.includes('carto') || k.includes('openmaptiles') || k === 'composite'
  );

  if (!sourceId) return;

  try {
    if (map.getLayer('3d-buildings')) {
      map.removeLayer('3d-buildings');
    }

    map.addLayer(
      {
        id: '3d-buildings',
        source: sourceId,
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': getBuildingExtrusionColorExpression(mapStyle),
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], ['get', 'height'], 10],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': mapStyle === 'satellite' || mapStyle === 'hybrid' ? 0.45 : 0.82,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      labelLayerId,
    );

    if (map.getLayer('3d-buildings-outline')) {
      map.removeLayer('3d-buildings-outline');
    }

    map.addLayer(
      {
        id: '3d-buildings-outline',
        source: sourceId,
        'source-layer': 'building',
        type: 'line',
        minzoom: 14,
        paint: {
          'line-color': palette.buildingLine,
          'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 18, 1.5],
          'line-opacity': 0.65,
        },
      },
      labelLayerId,
    );
  } catch (e) {
    console.warn('[MapLibre3D] Could not add 3D buildings:', e);
  }
}

function removeRouteLayers(map: maplibregl.Map) {
  const style = map.getStyle();
  if (!style?.layers) return;

  const routeLayerIds = style.layers
    .filter(l => l.id.startsWith('route-seg-'))
    .map(l => l.id);

  routeLayerIds.forEach(id => {
    try { map.removeLayer(id); } catch { /* ignore */ }
  });

  const sourceIds = Object.keys(style.sources || {}).filter(s => s.startsWith('route-seg-'));
  sourceIds.forEach(id => {
    try { map.removeSource(id); } catch { /* ignore */ }
  });
}

function upsertTrafficOverlay(map: maplibregl.Map, segments: TrafficSegment[]) {
  const data = {
    type: 'FeatureCollection' as const,
    features: segments.map((segment) => ({
      type: 'Feature' as const,
      properties: {
        congestion: segment.congestionLevel,
        confidence: segment.confidence,
        sampleCount: segment.sampleCount,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [segment.centerLon, segment.centerLat],
      },
    })),
  };

  const existingSource = map.getSource(TRAFFIC_OVERLAY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(data);
  } else {
    map.addSource(TRAFFIC_OVERLAY_SOURCE_ID, {
      type: 'geojson',
      data,
    });
  }

  if (!map.getLayer(TRAFFIC_OVERLAY_LAYER_ID)) {
    const beforeId = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;
    map.addLayer({
      id: TRAFFIC_OVERLAY_LAYER_ID,
      type: 'circle',
      source: TRAFFIC_OVERLAY_SOURCE_ID,
      paint: {
        'circle-color': [
          'match',
          ['get', 'congestion'],
          'free', TRAFFIC_COLORS.free,
          'moderate', '#EAB308',
          'slow', TRAFFIC_COLORS.slow,
          'congested', TRAFFIC_COLORS.congested,
          TRAFFIC_COLORS.unknown,
        ],
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          8, ['+', 3, ['*', ['coalesce', ['get', 'confidence'], 0.3], 4]],
          14, ['+', 6, ['*', ['coalesce', ['get', 'confidence'], 0.3], 6]],
          18, ['+', 10, ['*', ['coalesce', ['get', 'confidence'], 0.3], 8]],
        ],
        'circle-opacity': [
          'match',
          ['get', 'congestion'],
          'free', 0.18,
          'moderate', 0.28,
          'slow', 0.34,
          'congested', 0.42,
          0.2,
        ],
        'circle-stroke-color': 'rgba(15, 23, 42, 0.72)',
        'circle-stroke-width': 0.75,
      },
    }, beforeId);
  }
}

function removeTrafficOverlay(map: maplibregl.Map) {
  if (map.getLayer(TRAFFIC_OVERLAY_LAYER_ID)) {
    try { map.removeLayer(TRAFFIC_OVERLAY_LAYER_ID); } catch { /* ignore */ }
  }

  if (map.getSource(TRAFFIC_OVERLAY_SOURCE_ID)) {
    try { map.removeSource(TRAFFIC_OVERLAY_SOURCE_ID); } catch { /* ignore */ }
  }
}

function upsertTransitOverlay(map: maplibregl.Map, multimodalRoute: MultiModalRoute, selectedSegmentIndex: number | null) {
  const stationFeatures = new Map<string, GeoJSON.Feature<GeoJSON.Point>>();
  const features: GeoJSON.Feature[] = multimodalRoute.segments.flatMap((segment, index) => {
    const segmentCoordinates = (segment.geometry && segment.geometry.length >= 2
      ? segment.geometry
      : [segment.from, segment.to]
    ).map((point) => [point.lng, point.lat]);

    if (segment.fromStop) {
      stationFeatures.set(segment.fromStop.stopId, {
        type: 'Feature',
        properties: {
          kind: 'station',
          name: segment.fromStop.name,
          routeType: segment.trip?.routeType ?? 'transit',
          routeColor: segment.trip?.routeColor ?? '#38BDF8',
        },
        geometry: {
          type: 'Point',
          coordinates: [segment.fromStop.location.lng, segment.fromStop.location.lat],
        },
      });
    }

    if (segment.toStop) {
      stationFeatures.set(segment.toStop.stopId, {
        type: 'Feature',
        properties: {
          kind: 'station',
          name: segment.toStop.name,
          routeType: segment.trip?.routeType ?? 'transit',
          routeColor: segment.trip?.routeColor ?? '#38BDF8',
        },
        geometry: {
          type: 'Point',
          coordinates: [segment.toStop.location.lng, segment.toStop.location.lat],
        },
      });
    }

    return [{
      type: 'Feature' as const,
      properties: {
        kind: 'segment',
        segmentIndex: index,
        isSelected: selectedSegmentIndex === index,
        segmentMode: segment.mode,
        routeType: segment.trip?.routeType ?? segment.mode,
        routeName: segment.trip?.routeName ?? null,
        routeColor: segment.trip?.routeColor ?? (segment.trip?.routeType === 'metro' ? '#38BDF8' : '#A78BFA'),
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: segmentCoordinates,
      },
    }];
  });

  const data = {
    type: 'FeatureCollection' as const,
    features: [...features, ...stationFeatures.values()],
  };

  const existingSource = map.getSource(TRANSIT_OVERLAY_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(data);
  } else {
    map.addSource(TRANSIT_OVERLAY_SOURCE_ID, {
      type: 'geojson',
      data,
    });
  }

  const beforeId = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id;

  if (!map.getLayer(TRANSIT_LINE_LAYER_ID)) {
    map.addLayer({
      id: TRANSIT_LINE_LAYER_ID,
      type: 'line',
      source: TRANSIT_OVERLAY_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': ['coalesce', ['get', 'routeColor'], '#38BDF8'],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          10, ['case', ['boolean', ['get', 'isSelected'], false], 6, ['match', ['get', 'routeType'], 'metro', 4, 'walk', 2, 3]],
          15, ['case', ['boolean', ['get', 'isSelected'], false], 10, ['match', ['get', 'routeType'], 'metro', 7, 'walk', 3, 5]],
          18, ['case', ['boolean', ['get', 'isSelected'], false], 12, ['match', ['get', 'routeType'], 'metro', 9, 'walk', 4, 6]],
        ],
        'line-opacity': ['case', ['boolean', ['get', 'isSelected'], false], 1, ['match', ['get', 'routeType'], 'walk', 0.5, 0.88]],
        'line-dasharray': [
          'match', ['get', 'routeType'],
          'walk', ['literal', [0.8, 1.2]],
          'bus', ['literal', [1.2, 0.9]],
          'tram', ['literal', [1.1, 0.8]],
          ['literal', [1, 0]],
        ],
      },
    }, beforeId);
  }

  if (!map.getLayer(TRANSIT_STATION_LAYER_ID)) {
    map.addLayer({
      id: TRANSIT_STATION_LAYER_ID,
      type: 'circle',
      source: TRANSIT_OVERLAY_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 5, 18, 7],
        'circle-color': ['coalesce', ['get', 'routeColor'], '#38BDF8'],
        'circle-stroke-color': '#E2E8F0',
        'circle-stroke-width': 1.5,
      },
    }, beforeId);
  }

  if (!map.getLayer(TRANSIT_LABEL_LAYER_ID)) {
    map.addLayer({
      id: TRANSIT_LABEL_LAYER_ID,
      type: 'symbol',
      source: TRANSIT_OVERLAY_SOURCE_ID,
      minzoom: 12,
      filter: ['==', ['geometry-type'], 'Point'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold', 'Arial Unicode MS Bold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 12],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
      },
      paint: {
        'text-color': '#F8FAFC',
        'text-halo-color': 'rgba(15, 23, 42, 0.92)',
        'text-halo-width': 1.5,
      },
    });
  }
}

function removeTransitOverlay(map: maplibregl.Map) {
  for (const layerId of [TRANSIT_LABEL_LAYER_ID, TRANSIT_STATION_LAYER_ID, TRANSIT_LINE_LAYER_ID]) {
    if (map.getLayer(layerId)) {
      try { map.removeLayer(layerId); } catch { /* ignore */ }
    }
  }

  if (map.getSource(TRANSIT_OVERLAY_SOURCE_ID)) {
    try { map.removeSource(TRANSIT_OVERLAY_SOURCE_ID); } catch { /* ignore */ }
  }
}

function applySmoothRotation(element: HTMLDivElement, nextHeading: number) {
  const current = Number(element.dataset.heading ?? nextHeading);
  const delta = ((((nextHeading - current) % 360) + 540) % 360) - 180;
  const resolved = current + delta;
  element.dataset.heading = String(resolved);
  element.style.transform = `rotate(${resolved}deg)`;
}

function getVehicleVisualState(maneuver: Maneuver | null | undefined) {
  if (!maneuver) return 'straight';

  switch (maneuver.type) {
    case 'turn-left':
    case 'turn-slight-left':
    case 'turn-sharp-left':
      return 'left';
    case 'turn-right':
    case 'turn-slight-right':
    case 'turn-sharp-right':
      return 'right';
    case 'merge-left':
    case 'merge-right':
      return 'merge';
    case 'ramp-left':
    case 'ramp-right':
      return 'ramp';
    case 'arrive':
      return 'arrival';
    default:
      return 'straight';
  }
}

function getVehicleGlow(state: ReturnType<typeof getVehicleVisualState>) {
  switch (state) {
    case 'left':
      return 'drop-shadow(0 4px 12px rgba(34,197,94,0.45))';
    case 'right':
      return 'drop-shadow(0 4px 12px rgba(59,130,246,0.45))';
    case 'merge':
      return 'drop-shadow(0 4px 12px rgba(168,85,247,0.45))';
    case 'ramp':
      return 'drop-shadow(0 4px 12px rgba(245,158,11,0.5))';
    case 'arrival':
      return 'drop-shadow(0 4px 12px rgba(244,63,94,0.55))';
    default:
      return 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))';
  }
}

/** Update traffic light marker HTML with current color + timer */
function updateTLMarkerHtml(el: HTMLDivElement, light: TrafficLightStatus) {
  const color = TL_COLORS[light.currentColor];
  const remaining = light.timeRemaining;
  const hasTimer = remaining > 0 && remaining < 300;

  el.innerHTML = `
    <div style="
      display: flex; flex-direction: column; align-items: center;
      filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6));
    ">
      <div style="
        width: 28px; height: 28px; border-radius: 50%;
        background: ${color};
        border: 2px solid rgba(255,255,255,0.3);
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 12px ${color}80;
        animation: tl-glow 1.5s ease-in-out infinite;
      ">
        ${hasTimer ? `<span style="font-size: 11px; font-weight: bold; color: white; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">${remaining}</span>` : ''}
      </div>
      ${light.confidence < 0.5 ? '<div style="font-size: 8px; color: #9CA3AF; margin-top: 1px;">~</div>' : ''}
    </div>
  `;
}
