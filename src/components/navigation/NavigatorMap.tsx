import { useEffect, useMemo, useState, memo } from 'react';
import { Crosshair, ZoomIn, ZoomOut, Compass, Navigation2, Box, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/types/taxi';
import type { RouteSegment, SpeedCamera, NavRoute, Maneuver, ManeuverType, NavigationLaneGuidance, LaneTurn } from '@/types/navigation';
import { MapLibre3D } from './MapLibre3D';
import { GreenWaveOverlay } from './GreenWaveOverlay';
import { useNavigatorSettings } from '@/stores/navigatorSettingsStore';

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
  // Navigation-specific overlays
  isNavigating?: boolean;
  speed?: number;
  speedLimit?: number | null;
  nearbyCamera?: SpeedCamera | null;
  nextManeuver?: Maneuver | null;
  laneGuidance?: NavigationLaneGuidance | null;
  distanceToNextTurn?: number;
  remainingDistance?: number;
  totalDistance?: number;
  roadName?: string;
  route?: NavRoute | null;
  onCenterOnUser?: () => void;
  onToggleOrientation?: () => void;
  onMapClick?: (latlng: LatLng) => void;
  className?: string;
}

// ─── Lane guidance arrows ───────────────────────────────────────────────────
const MANEUVER_ARROWS: Partial<Record<ManeuverType, string[]>> = {
  'straight':       ['↑', '↑', '↑', '↑'],
  'turn-left':      ['↰', '↑', '↑', '↑'],
  'turn-right':     ['↑', '↑', '↑', '↱'],
  'turn-slight-left':  ['↖', '↑', '↑', '↑'],
  'turn-slight-right': ['↑', '↑', '↑', '↗'],
  'turn-sharp-left':   ['↰', '↑', '↑', '↑'],
  'turn-sharp-right':  ['↑', '↑', '↑', '↱'],
  'fork-left':      ['↖', '↑', '↑'],
  'fork-right':     ['↑', '↑', '↗'],
  'keep-left':      ['↖', '↑', '↑', '↑'],
  'keep-right':     ['↑', '↑', '↑', '↗'],
  'merge-left':     ['↖', '↑', '↑'],
  'merge-right':    ['↑', '↑', '↗'],
  'ramp-left':      ['↰', '↑', '↑'],
  'ramp-right':     ['↑', '↑', '↱'],
  'uturn':          ['↶', '↑', '↑', '↑'],
};

function getLaneArrows(type?: ManeuverType): string[] {
  if (!type) return ['↑', '↑', '↑', '↑'];
  return MANEUVER_ARROWS[type] ?? ['↑', '↑', '↑', '↑'];
}

function getHighlightedLane(type?: ManeuverType): number {
  if (!type) return -1;
  if (type.includes('left') || type === 'uturn') return 0;
  if (type.includes('right')) return getLaneArrows(type).length - 1;
  return -1;
}

function laneTurnToGlyph(turn: LaneTurn): string {
  switch (turn) {
    case 'left':
      return '↰';
    case 'slight_left':
    case 'merge_to_left':
      return '↖';
    case 'sharp_left':
      return '↶';
    case 'right':
      return '↱';
    case 'slight_right':
    case 'merge_to_right':
      return '↗';
    case 'sharp_right':
      return '↷';
    case 'reverse':
      return '⟲';
    case 'none':
      return '•';
    default:
      return '↑';
  }
}

// ─── Speedometer ────────────────────────────────────────────────────────────
function SpeedometerOverlay({ speed, speedLimit }: { speed: number; speedLimit: number | null }) {
  const isOver = speedLimit != null && speed > speedLimit;
  return (
    <div className="absolute top-20 left-3 z-[1000] flex flex-col items-center gap-2">
      {/* Speed */}
      <div className={cn(
        'w-16 h-16 rounded-2xl flex flex-col items-center justify-center',
        'bg-gray-900/85 backdrop-blur-md border border-white/10',
        'shadow-lg shadow-black/30',
        isOver && 'border-red-500/60 bg-red-950/60'
      )}>
        <span className={cn(
          'text-2xl font-black leading-none',
          isOver ? 'text-red-400' : 'text-white'
        )}>
          {Math.round(speed)}
        </span>
        <span className="text-[10px] text-gray-400 mt-0.5">km/h</span>
      </div>

      {/* Speed limit sign */}
      {speedLimit != null && (
        <div className="w-12 h-12 rounded-full border-[3px] border-red-500 bg-white flex items-center justify-center shadow-lg">
          <span className="text-base font-black text-gray-900 leading-none">{speedLimit}</span>
        </div>
      )}
    </div>
  );
}

// ─── Camera warning ─────────────────────────────────────────────────────────
function CameraWarningOverlay({ camera, userPosition }: { camera: SpeedCamera; userPosition: LatLng | null }) {
  const dist = userPosition
    ? Math.round(Math.sqrt(
        Math.pow((camera.location.lat - userPosition.lat) * 111320, 2) +
        Math.pow((camera.location.lng - userPosition.lng) * 111320 * Math.cos(userPosition.lat * Math.PI / 180), 2)
      ))
    : null;

  return (
    <div className="absolute top-20 right-16 z-[1000] flex items-center gap-2">
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-xl',
        'bg-red-950/80 backdrop-blur-md border border-red-500/40',
        'shadow-lg shadow-red-500/20',
        'animate-pulse'
      )}>
        {dist != null && (
          <span className="text-white font-bold text-sm">{dist}м</span>
        )}
        <div className="w-8 h-8 rounded-full border-2 border-red-500 bg-white flex items-center justify-center">
          <span className="text-xs font-black text-red-600">{camera.speedLimit}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Route progress bar (right side, like Amap) ────────────────────────────
function RouteProgressBar({ remaining, total }: { remaining: number; total: number }) {
  const progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 0;

  return (
    <div className="absolute top-20 right-2.5 bottom-36 z-[999] w-2 flex flex-col items-center">
      <div className="relative w-full h-full rounded-full bg-gray-800/60 overflow-hidden border border-white/5">
        {/* Filled portion (bottom-up) */}
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-1000"
          style={{
            height: `${progress * 100}%`,
            background: 'linear-gradient(to top, #00E676, #42A5F5, #42A5F5)',
          }}
        />
        {/* Current position dot */}
        <div
          className="absolute left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-blue-400 border-2 border-white shadow-lg transition-all duration-1000"
          style={{ bottom: `calc(${progress * 100}% - 6px)` }}
        />
      </div>
    </div>
  );
}

// ─── Lane guidance (top arrows like Amap) ───────────────────────────────────
function LaneGuidance({ guidance, maneuverType, distance }: { guidance?: NavigationLaneGuidance | null; maneuverType?: ManeuverType; distance?: number }) {
  if (guidance && guidance.lanes.length > 0) {
    const urgencyClasses = guidance.urgency === 'critical'
      ? 'bg-red-950/80 border-red-400/40'
      : guidance.urgency === 'warn'
        ? 'bg-amber-950/70 border-amber-400/35'
        : 'bg-gray-950/75 border-white/10';

    return (
      <div className={cn(
        'absolute top-2 left-1/2 -translate-x-1/2 z-[1000] rounded-2xl px-3 py-2.5',
        'backdrop-blur-md border shadow-2xl shadow-black/30',
        urgencyClasses
      )}>
        <div className="flex items-center justify-center gap-1.5">
          {guidance.lanes.map((lane) => (
            <div
              key={lane.index}
              className={cn(
                'min-w-11 h-12 rounded-xl px-1.5 flex flex-col items-center justify-center border',
                lane.isRecommended
                  ? 'bg-green-500/85 border-green-300/60 text-white shadow-lg shadow-green-500/30'
                  : 'bg-gray-900/70 border-white/10 text-gray-200'
              )}
            >
              <div className="flex items-center gap-0.5 text-lg leading-none">
                {(() => {
                  const laneTurns: LaneTurn[] = lane.turns.length > 0 ? lane.turns : ['through'];
                  return laneTurns.slice(0, 2).map((turn, index) => (
                    <span key={`${lane.index}-${turn}-${index}`}>{laneTurnToGlyph(turn)}</span>
                  ));
                })()}
              </div>
              {lane.destination && (
                <span className="mt-0.5 max-w-14 truncate text-[9px] font-medium opacity-90">{lane.destination}</span>
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/85">
          <span className="font-medium">{guidance.message}</span>
          <span className="whitespace-nowrap opacity-80">{guidance.source === 'osm' ? 'OSM lanes' : 'Fallback'}{distance != null ? ` • ${Math.round(distance)} м` : ''}</span>
        </div>
      </div>
    );
  }

  const arrows = getLaneArrows(maneuverType);
  const highlighted = getHighlightedLane(maneuverType);

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1">
      {arrows.map((arrow, i) => (
        <div
          key={i}
          className={cn(
            'w-9 h-10 rounded-lg flex items-center justify-center text-xl',
            'backdrop-blur-md border',
            i === highlighted
              ? 'bg-green-500/80 border-green-400/60 text-white shadow-lg shadow-green-500/30'
              : 'bg-gray-900/70 border-white/10 text-gray-300'
          )}
        >
          {arrow}
        </div>
      ))}
    </div>
  );
}

// ─── Compass overlay ────────────────────────────────────────────────────────
function CompassRose({ heading }: { heading: number }) {
  return (
    <div className="relative w-16 h-16">
      <div
        className="w-full h-full transition-transform duration-300"
        style={{ transform: `rotate(${-heading}deg)` }}
      >
        <svg viewBox="0 0 64 64" className="w-full h-full">
          <circle cx="32" cy="32" r="24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
          <text x="32" y="16" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#EF4444">N</text>
          <text x="32" y="56" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">S</text>
          <text x="52" y="36" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">E</text>
          <text x="12" y="36" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.4)">W</text>
        </svg>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
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
  isNavigating = false,
  speed = 0,
  speedLimit,
  nearbyCamera,
  nextManeuver,
  laneGuidance,
  distanceToNextTurn,
  remainingDistance,
  totalDistance,
  roadName,
  route,
  onCenterOnUser,
  onToggleOrientation,
  onMapClick,
  className,
}: NavigatorMapProps) {
  const [cameraState, setCameraState] = useState({ center, zoom });
  const [is3D, setIs3D] = useState(true);
  const navSettings = useNavigatorSettings();

  useEffect(() => {
    setCameraState({ center, zoom });
  }, [center, zoom]);

  const handleZoomIn = () => {
    setCameraState((prev) => ({ ...prev, zoom: Math.min(prev.zoom + 1, 19) }));
  };

  const handleZoomOut = () => {
    setCameraState((prev) => ({ ...prev, zoom: Math.max(prev.zoom - 1, 3) }));
  };

  const glassBtn = cn(
    'w-11 h-11 rounded-xl',
    'bg-gray-900/80 backdrop-blur-md border border-white/10',
    'flex items-center justify-center',
    'transition-all active:scale-95 hover:bg-gray-800/90',
    'shadow-lg shadow-black/30'
  );

  return (
    <div className={cn('relative w-full h-full', className)}>
      {/* 3D Map */}
      <MapLibre3D
        center={cameraState.center}
        zoom={cameraState.zoom}
        heading={heading}
        pitch={is3D ? (isNavigating ? 60 : 45) : 0}
        isNorthUp={isNorthUp}
        isNavigating={isNavigating}
        userPosition={userPosition}
        routeSegments={routeSegments}
        route={route}
        speedCameras={speedCameras}
        destinationMarker={destinationMarker}
        nextManeuver={nextManeuver ?? null}
        onMapClick={onMapClick}
        className="w-full h-full"
      />

      {/* ── Navigation overlays (only during active navigation) ── */}
      {isNavigating && (
        <>
          {/* Lane guidance arrows */}
          {navSettings.showLanes && (
            <LaneGuidance
              guidance={laneGuidance}
              maneuverType={nextManeuver?.type}
              distance={distanceToNextTurn}
            />
          )}

          {/* Green wave speed recommendation */}
          <GreenWaveOverlay
            userPosition={userPosition}
            currentSpeed={speed ?? 0}
            route={route ?? null}
            isNavigating={isNavigating ?? false}
          />

          {/* Speedometer */}
          <SpeedometerOverlay speed={speed} speedLimit={speedLimit ?? null} />

          {/* Speed camera warning */}
          {nearbyCamera && (
            <CameraWarningOverlay camera={nearbyCamera} userPosition={userPosition} />
          )}

          {/* Route progress bar */}
          {totalDistance != null && remainingDistance != null && (
            <RouteProgressBar remaining={remainingDistance} total={totalDistance} />
          )}

          {/* Compass rose (bottom-center) */}
          <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-[999]">
            <CompassRose heading={heading} />
          </div>

          {/* Road name bar */}
          {roadName && (
            <div className={cn(
              'absolute bottom-32 left-3 right-14 z-[999]',
              'bg-gray-900/80 backdrop-blur-md rounded-xl px-4 py-2',
              'border border-white/10'
            )}>
              <div className="flex items-center gap-2">
                <Navigation2 className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-sm text-white font-medium truncate">{roadName}</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Right controls */}
      <div className={cn(
        'absolute right-3 z-[1000] flex flex-col gap-2',
        isNavigating ? 'bottom-52' : 'bottom-36'
      )}>
        {onToggleOrientation && (
          <button onClick={onToggleOrientation} className={glassBtn} aria-label="Ориентация">
            <Compass className={cn('h-5 w-5', isNorthUp ? 'text-gray-400' : 'text-blue-400')} />
          </button>
        )}
        {/* 2D / 3D Toggle */}
        <button
          onClick={() => setIs3D(v => !v)}
          className={glassBtn}
          aria-label={is3D ? 'Переключить на 2D' : 'Переключить на 3D'}
        >
          {is3D
            ? <Box className="h-5 w-5 text-blue-400" />
            : <Square className="h-5 w-5 text-gray-400" />
          }
        </button>
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
    </div>
  );
});
