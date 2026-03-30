import { useEffect, useRef, memo } from 'react';
import { Crosshair, ZoomIn, ZoomOut, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/types/taxi';
import type { RouteSegment, SpeedCamera, NavRoute } from '@/types/navigation';

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const DARK_TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const TRAFFIC_COLORS: Record<string, string> = {
  free: '#4ADE80',
  moderate: '#FBBF24',
  slow: '#FB923C',
  congested: '#F43F5E',
  unknown: '#60A5FA',
};

interface NavigatorMapProps {
  center: LatLng;
  zoom: number;
  heading: number;
  isNorthUp: boolean;
  userPosition: LatLng | null;
  routeSegments: RouteSegment[];
  alternativeRoutes: NavRoute[];
  speedCameras: SpeedCamera[];
  destinationMarker: LatLng | null;
  onCenterOnUser?: () => void;
  onToggleOrientation?: () => void;
  onMapClick?: (latlng: LatLng) => void;
  className?: string;
}

function createUserArrowIcon(heading: number): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="width:48px;height:48px;position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="
          position:absolute;inset:-6px;
          border-radius:50%;
          background:radial-gradient(circle,rgba(59,130,246,0.35) 0%,transparent 70%);
          animation:nav-pulse 2s ease-in-out infinite;
        "></div>
        <div style="
          width:24px;height:24px;
          transform:rotate(${heading}deg);
        ">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L4 20l8-4 8 4L12 2z" fill="#3B82F6" stroke="#93C5FD" stroke-width="1"/>
          </svg>
        </div>
        <div style="
          position:absolute;width:10px;height:10px;
          background:#3B82F6;border:2px solid white;
          border-radius:50%;
          box-shadow:0 0 0 4px rgba(59,130,246,0.2);
        "></div>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    className: '',
  });
}

function createDestIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="position:relative;width:40px;height:52px;">
        <svg width="40" height="52" viewBox="0 0 40 52" fill="none">
          <path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="#F43F5E"/>
          <circle cx="20" cy="20" r="12" fill="#fff"/>
          <circle cx="20" cy="20" r="6" fill="#ef4444"/>
        </svg>
        <div style="position:absolute;top:12px;left:0;width:40px;text-align:center;font-size:11px;font-weight:700;color:#991b1b;">B</div>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 52],
    className: '',
  });
}

function createCameraIcon(): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="
        width:28px;height:28px;
        background:#EF4444;
        border:2px solid #FCA5A5;
        border-radius:6px;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 12px rgba(239,68,68,0.5);
        animation:camera-blink 1.5s ease-in-out infinite;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    className: '',
  });
}

export const NavigatorMap = memo(function NavigatorMap({
  center,
  zoom,
  heading,
  isNorthUp,
  userPosition,
  routeSegments,
  alternativeRoutes,
  speedCameras,
  destinationMarker,
  onCenterOnUser,
  onToggleOrientation,
  onMapClick,
  className,
}: NavigatorMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const destMarkerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const altRouteLayerRef = useRef<L.LayerGroup | null>(null);
  const cameraLayerRef = useRef<L.LayerGroup | null>(null);

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    L.tileLayer(DARK_TILE_URL, {
      attribution: DARK_TILE_ATTR,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

    if (onMapClick) {
      map.on('click', (e: L.LeafletMouseEvent) => {
        onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng });
      });
    }

    mapRef.current = map;
    routeLayerRef.current = L.layerGroup().addTo(map);
    altRouteLayerRef.current = L.layerGroup().addTo(map);
    cameraLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update center
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView([center.lat, center.lng], zoom, { animate: true });
  }, [center, zoom]);

  // Rotate map (heading-up mode)
  useEffect(() => {
    if (!containerRef.current) return;
    if (isNorthUp) {
      containerRef.current.style.transform = '';
    } else {
      containerRef.current.style.transform = `rotate(${-heading}deg)`;
    }
  }, [heading, isNorthUp]);

  // User position marker
  useEffect(() => {
    if (!mapRef.current) return;
    if (userPosition) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng([userPosition.lat, userPosition.lng]);
        userMarkerRef.current.setIcon(createUserArrowIcon(isNorthUp ? heading : 0));
      } else {
        userMarkerRef.current = L.marker([userPosition.lat, userPosition.lng], {
          icon: createUserArrowIcon(isNorthUp ? heading : 0),
          zIndexOffset: 1000,
        }).addTo(mapRef.current);
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userPosition, heading, isNorthUp]);

  // Destination marker
  useEffect(() => {
    if (!mapRef.current) return;
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }
    if (destinationMarker) {
      destMarkerRef.current = L.marker([destinationMarker.lat, destinationMarker.lng], {
        icon: createDestIcon(),
      }).addTo(mapRef.current);
    }
  }, [destinationMarker]);

  // Route segments (traffic-colored)
  useEffect(() => {
    if (!mapRef.current || !routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();

    for (const seg of routeSegments) {
      if (seg.points.length < 2) continue;
      const latlngs = seg.points.map((p) => [p.lat, p.lng] as [number, number]);
      const color = TRAFFIC_COLORS[seg.traffic] ?? TRAFFIC_COLORS.unknown;

      // Shadow
      L.polyline(latlngs, {
        color: '#000',
        weight: 10,
        opacity: 0.12,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayerRef.current!);

      // Main line
      L.polyline(latlngs, {
        color,
        weight: 6,
        opacity: 0.95,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(routeLayerRef.current!);
    }

    // Fit bounds
    if (routeSegments.length > 0) {
      const allPoints = routeSegments.flatMap((s) => s.points);
      if (allPoints.length >= 2) {
        const bounds = L.latLngBounds(allPoints.map((p) => [p.lat, p.lng] as [number, number]));
        mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
      }
    }
  }, [routeSegments]);

  // Alternative routes
  useEffect(() => {
    if (!mapRef.current || !altRouteLayerRef.current) return;
    altRouteLayerRef.current.clearLayers();

    for (const alt of alternativeRoutes) {
      const latlngs = alt.geometry.map((p) => [p.lat, p.lng] as [number, number]);
      L.polyline(latlngs, {
        color: '#6B7280',
        weight: 5,
        opacity: 0.4,
        smoothFactor: 2,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: '8 6',
      }).addTo(altRouteLayerRef.current!);
    }
  }, [alternativeRoutes]);

  // Speed cameras
  useEffect(() => {
    if (!mapRef.current || !cameraLayerRef.current) return;
    cameraLayerRef.current.clearLayers();

    for (const cam of speedCameras) {
      L.marker([cam.location.lat, cam.location.lng], {
        icon: createCameraIcon(),
        zIndexOffset: 500,
      }).addTo(cameraLayerRef.current!);
    }
  }, [speedCameras]);

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  const glassBtn = cn(
    'w-11 h-11 rounded-xl',
    'bg-gray-900/80 backdrop-blur-md border border-white/10',
    'flex items-center justify-center',
    'transition-all active:scale-95 hover:bg-gray-800/90',
    'shadow-lg shadow-black/30'
  );

  return (
    <div className={cn('relative w-full h-full', className)}>
      <div
        ref={containerRef}
        className="w-full h-full will-change-transform"
        style={{ transformOrigin: 'center center' }}
      />

      {/* Right controls */}
      <div className="absolute bottom-36 right-3 z-[1000] flex flex-col gap-2">
        {onToggleOrientation && (
          <button onClick={onToggleOrientation} className={glassBtn} aria-label="Ориентация">
            <Compass className={cn('h-5 w-5', isNorthUp ? 'text-gray-400' : 'text-blue-400')} />
          </button>
        )}
        <button onClick={handleZoomIn} className={glassBtn} aria-label="Приблизить">
          <ZoomIn className="h-5 w-5 text-white" />
        </button>
        <button onClick={handleZoomOut} className={glassBtn} aria-label="Отдалить">
          <ZoomOut className="h-5 w-5 text-white" />
        </button>
        {onCenterOnUser && (
          <button onClick={onCenterOnUser} className={glassBtn} aria-label="Моё местоположение">
            <Crosshair className="h-5 w-5 text-blue-400" />
          </button>
        )}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes nav-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.4); opacity: 0.1; }
        }
        @keyframes camera-blink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
});
