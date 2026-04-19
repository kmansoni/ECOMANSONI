import { useEffect, useMemo, useState, memo } from 'react';
import { Crosshair, ZoomIn, ZoomOut, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/types/taxi';
import type { RouteSegment, SpeedCamera, NavRoute } from '@/types/navigation';
import AmapMap from '../../../apps/mobile-shell/src/components/AmapMap';
import type { MapMarker } from '../../../apps/mobile-shell/src/types';

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

function createDestinationIcon(): string {
  return `
    <div style="position:relative;width:40px;height:52px;">
      <svg width="40" height="52" viewBox="0 0 40 52" fill="none">
        <path d="M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z" fill="#F43F5E"/>
        <circle cx="20" cy="20" r="12" fill="#fff"/>
        <circle cx="20" cy="20" r="6" fill="#ef4444"/>
      </svg>
      <div style="position:absolute;top:12px;left:0;width:40px;text-align:center;font-size:11px;font-weight:700;color:#991b1b;">B</div>
    </div>
  `;
}

function createCameraIcon(): string {
  return `
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
  `;
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
  const [cameraState, setCameraState] = useState({ center, zoom });

  useEffect(() => {
    setCameraState({ center, zoom });
  }, [center, zoom]);

  const handleZoomIn = () => {
    setCameraState((prev) => ({ ...prev, zoom: Math.min(prev.zoom + 1, 19) }));
  };

  const handleZoomOut = () => {
    setCameraState((prev) => ({ ...prev, zoom: Math.max(prev.zoom - 1, 3) }));
  };

  const markers = useMemo<MapMarker[]>(() => {
    const items: MapMarker[] = speedCameras.map((cam) => ({
      id: `camera-${cam.id}`,
      position: cam.location,
      title: `Камера ${cam.speedLimit} км/ч`,
      subtitle: cam.type === 'mobile' ? 'Мобильная камера' : 'Контроль скорости',
      icon: createCameraIcon(),
    }));

    if (destinationMarker) {
      items.push({
        id: 'destination',
        position: destinationMarker,
        title: 'Точка назначения',
        icon: createDestinationIcon(),
      });
    }

    return items;
  }, [destinationMarker, speedCameras]);

  const primaryRoute = useMemo(() => {
    const points = routeSegments.flatMap((segment) => segment.points);
    if (points.length < 2) {
      return null;
    }

    return {
      id: 'amap-primary-route',
      points,
      color: '#3B82F6',
      width: 6,
    };
  }, [routeSegments]);

  const visibleMarkers = useMemo(() => {
    if (alternativeRoutes.length === 0) {
      return markers;
    }

    return [
      ...markers,
      {
        id: 'alt-routes-indicator',
        position: alternativeRoutes[0].geometry[Math.floor(alternativeRoutes[0].geometry.length / 2)] ?? center,
        title: `${alternativeRoutes.length} альтернативных маршрута`,
        subtitle: 'Доступны в панели маршрутов',
      },
    ];
  }, [alternativeRoutes, center, markers]);

  const glassBtn = cn(
    'w-11 h-11 rounded-xl',
    'bg-gray-900/80 backdrop-blur-md border border-white/10',
    'flex items-center justify-center',
    'transition-all active:scale-95 hover:bg-gray-800/90',
    'shadow-lg shadow-black/30'
  );

  return (
    <div className={cn('relative w-full h-full', className)}>
      <AmapMap
        camera={{ center: cameraState.center, zoom: cameraState.zoom, heading: isNorthUp ? 0 : heading }}
        userLocation={userPosition ? {
          position: userPosition,
          heading,
          timestamp: Date.now(),
        } : null}
        isTracking={Boolean(userPosition)}
        markers={visibleMarkers}
        route={primaryRoute}
        showsUserLocation
        showsCompass={false}
        showsScale
        mapType="navigation"
        onMapClick={onMapClick}
        className="w-full h-full"
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
        @keyframes camera-blink {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.08); }
        }
      `}</style>
    </div>
  );
});
