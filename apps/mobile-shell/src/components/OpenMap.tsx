import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapCamera, MapMarker, MapRoute, UserLocation, LatLng } from '../types';

// ─── Free tile providers (no API key required) ─────────────────────────────
export const TILE_PROVIDERS = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  cartoDark: {
    name: 'Тёмная (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  cartoLight: {
    name: 'Светлая (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  cartoVoyager: {
    name: 'Voyager (CartoDB)',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
  },
  osmHot: {
    name: 'Humanitarian OSM',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a>, tiles by HOT',
    maxZoom: 19,
  },
  cyclosm: {
    name: 'CyclOSM',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> CyclOSM',
    maxZoom: 20,
  },
  esriSatellite: {
    name: 'Спутник (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
  esriTopo: {
    name: 'Топо (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, HERE, Garmin, OpenStreetMap contributors',
    maxZoom: 18,
  },
} as const;

export type TileProviderKey = keyof typeof TILE_PROVIDERS;

// ─── Map type → tile provider mapping ───────────────────────────────────────
const MAP_TYPE_TO_PROVIDER: Record<string, TileProviderKey> = {
  standard: 'cartoVoyager',
  satellite: 'esriSatellite',
  night: 'cartoDark',
  navigation: 'cartoDark',
};

export interface OpenMapProps {
  camera?: MapCamera;
  userLocation?: UserLocation | null;
  isTracking?: boolean;
  markers?: MapMarker[];
  route?: MapRoute | null;
  showsUserLocation?: boolean;
  showsCompass?: boolean;
  showsScale?: boolean;
  mapType?: 'standard' | 'satellite' | 'night' | 'navigation';
  tileProvider?: TileProviderKey;
  onMapClick?: (latlng: LatLng) => void;
  onUserLocationChange?: (location: UserLocation) => void;
  onMarkerPress?: (marker: MapMarker) => void;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

// ─── User location marker (blue dot with heading arrow) ─────────────────────
function createUserIcon(heading?: number): L.DivIcon {
  const rotation = heading != null ? heading : 0;
  return L.divIcon({
    className: 'openmap-user-icon',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `
      <div style="
        width:24px;height:24px;
        background:#3B82F6;
        border:3px solid white;
        border-radius:50%;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);
        position:relative;
      ">
        <div style="
          position:absolute;top:-10px;left:50%;
          transform:translateX(-50%) rotate(${rotation}deg);
          width:0;height:0;
          border-left:6px solid transparent;
          border-right:6px solid transparent;
          border-bottom:10px solid #3B82F6;
          filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));
        "></div>
      </div>
    `,
  });
}

// ─── Default marker icon ────────────────────────────────────────────────────
function createDefaultIcon(): L.DivIcon {
  return L.divIcon({
    className: 'openmap-marker-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    html: `
      <div style="
        width:32px;height:32px;
        background:#F43F5E;
        border:2px solid white;
        border-radius:50%;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        display:flex;align-items:center;justify-content:center;
      ">
        <div style="width:12px;height:12px;background:white;border-radius:50%;"></div>
      </div>
    `,
  });
}

// ─── Component ──────────────────────────────────────────────────────────────
function OpenMap({
  camera: propCamera,
  userLocation: propUserLocation,
  isTracking = false,
  markers: propMarkers = [],
  route: propRoute,
  showsUserLocation = true,
  showsCompass: _showsCompass = true,
  showsScale = true,
  mapType = 'standard',
  tileProvider,
  onMapClick,
  onUserLocationChange,
  onMarkerPress,
  className = '',
  style,
  children,
}: OpenMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userCircleRef = useRef<L.Circle | null>(null);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [isMapReady, setIsMapReady] = useState(false);
  const [internalUserLocation, setInternalUserLocation] = useState<UserLocation | null>(null);

  // Default: Moscow
  const defaultCenter = useMemo<LatLng>(() => ({ lat: 55.7558, lng: 37.6173 }), []);
  const defaultZoom = 14;

  const currentCamera = useMemo(() => ({
    center: propCamera?.center ?? defaultCenter,
    zoom: propCamera?.zoom ?? defaultZoom,
    heading: propCamera?.heading ?? 0,
  }), [propCamera, defaultCenter]);

  // Resolve tile provider
  const resolvedProvider = useMemo(() => {
    if (tileProvider) return TILE_PROVIDERS[tileProvider];
    return TILE_PROVIDERS[MAP_TYPE_TO_PROVIDER[mapType] ?? 'cartoVoyager'];
  }, [tileProvider, mapType]);

  // ── Initialize map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || typeof window === 'undefined') return;

    const map = L.map(containerRef.current, {
      center: [currentCamera.center.lat, currentCamera.center.lng],
      zoom: currentCamera.zoom,
      zoomControl: false,
      attributionControl: true,
      keyboard: false,
    });

    const tile = L.tileLayer(resolvedProvider.url, {
      attribution: resolvedProvider.attribution,
      maxZoom: resolvedProvider.maxZoom,
    }).addTo(map);

    tileLayerRef.current = tile;

    if (showsScale) {
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    }

    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    map.on('click', (e: L.LeafletMouseEvent) => {
      onMapClick?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    mapRef.current = map;
    setIsMapReady(true);

    // Start built-in geolocation if no external user location provided
    if (showsUserLocation && !propUserLocation && navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const loc: UserLocation = {
            position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            heading: pos.coords.heading ?? undefined,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          };
          setInternalUserLocation(loc);
          onUserLocationChange?.(loc);
        },
        (err) => console.warn('[OpenMap] Geolocation error:', err.message),
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 },
      );
    }

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      userMarkerRef.current = null;
      userCircleRef.current = null;
      routeLayerRef.current = null;
      markersGroupRef.current = null;
      setIsMapReady(false);
    };
    // Only re-init when tile provider or scale changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedProvider.url, showsScale, showsUserLocation]);

  // ── Update tile layer on mapType change ───────────────────────────────────
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !tileLayerRef.current) return;
    tileLayerRef.current.setUrl(resolvedProvider.url);
  }, [resolvedProvider.url, isMapReady]);

  // ── Sync camera position ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;
    mapRef.current.setView(
      [currentCamera.center.lat, currentCamera.center.lng],
      currentCamera.zoom,
      { animate: true, duration: 0.3 },
    );
  }, [currentCamera.center.lat, currentCamera.center.lng, currentCamera.zoom, isMapReady]);

  // ── Render markers ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isMapReady || !markersGroupRef.current) return;
    markersGroupRef.current.clearLayers();

    for (const marker of propMarkers) {
      const icon = marker.icon
        ? L.divIcon({
            className: 'openmap-custom-icon',
            html: marker.icon,
            iconSize: [40, 52],
            iconAnchor: [20, 52],
          })
        : createDefaultIcon();

      const leafletMarker = L.marker(
        [marker.position.lat, marker.position.lng],
        { icon, zIndexOffset: 100 },
      );

      if (marker.title || marker.subtitle) {
        const popupHtml = `
          <div style="padding:4px;max-width:200px;">
            ${marker.title ? `<strong>${marker.title}</strong>` : ''}
            ${marker.subtitle ? `<div style="color:#666;font-size:12px;margin-top:2px;">${marker.subtitle}</div>` : ''}
          </div>
        `;
        leafletMarker.bindPopup(popupHtml, { closeButton: false, offset: [0, -30] });
        leafletMarker.on('mouseover', () => leafletMarker.openPopup());
      }

      leafletMarker.on('click', () => {
        marker.onPress?.();
        onMarkerPress?.(marker);
      });

      leafletMarker.addTo(markersGroupRef.current!);
    }
  }, [propMarkers, isMapReady, onMarkerPress]);

  // ── Render route polyline ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isMapReady || !mapRef.current) return;

    // Remove old route
    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    if (!propRoute || propRoute.points.length < 2) return;

    const latlngs = propRoute.points.map(p => [p.lat, p.lng] as L.LatLngTuple);
    const polyline = L.polyline(latlngs, {
      color: propRoute.color || '#3B82F6',
      weight: propRoute.width || 6,
      opacity: 0.9,
      lineJoin: 'round',
      lineCap: 'round',
    }).addTo(mapRef.current);

    routeLayerRef.current = polyline;

    // Fit map to route bounds with padding
    mapRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50], maxZoom: 16 });
  }, [propRoute, isMapReady]);

  // ── Render user location marker ───────────────────────────────────────────
  useEffect(() => {
    if (!isMapReady || !mapRef.current || !showsUserLocation) return;

    const location = propUserLocation ?? internalUserLocation;
    if (!location) {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (userCircleRef.current) {
        userCircleRef.current.remove();
        userCircleRef.current = null;
      }
      return;
    }

    const pos: L.LatLngExpression = [location.position.lat, location.position.lng];
    const icon = createUserIcon(location.heading);

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(pos);
      userMarkerRef.current.setIcon(icon);
    } else {
      userMarkerRef.current = L.marker(pos, { icon, zIndexOffset: 200 }).addTo(mapRef.current);
    }

    // Accuracy circle
    const accuracy = location.accuracy ?? 0;
    if (accuracy > 10) {
      if (userCircleRef.current) {
        userCircleRef.current.setLatLng(pos);
        userCircleRef.current.setRadius(accuracy);
      } else {
        userCircleRef.current = L.circle(pos, {
          radius: accuracy,
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.1,
          weight: 1,
          opacity: 0.3,
        }).addTo(mapRef.current);
      }
    } else if (userCircleRef.current) {
      userCircleRef.current.remove();
      userCircleRef.current = null;
    }

    // Auto-center when tracking
    if (isTracking) {
      mapRef.current.setView(pos, mapRef.current.getZoom(), { animate: true, duration: 0.3 });
    }
  }, [propUserLocation, internalUserLocation, isMapReady, isTracking, showsUserLocation]);

  return (
    <div
      ref={containerRef}
      className={`openmap ${className}`}
      style={{ width: '100%', height: '100%', ...style }}
    >
      {children}
    </div>
  );
}

export default OpenMap;
