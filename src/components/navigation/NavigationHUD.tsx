/**
 * NavigationHUD — Amap-style heads-up display overlay.
 *
 * Features:
 * - Speed limit circle (current limit from matched road)
 * - Current speed (color-coded: green/yellow/red)
 * - Route progress bar (vertical, right side)
 * - Camera countdown (distance + speed limit)
 * - Next turn instruction (top bar)
 * - ETA / distance / arrival time (bottom bar)
 * - Lane guidance arrows
 */

import { memo, useMemo, type FC } from 'react';
import type { LaneRecommendation } from '@/lib/navigation/laneGraph';
import type { SpeedCamera, Maneuver, NavigationState, RouteSegment, TrafficLevel } from '@/types/navigation';
import type { MatchedPosition } from '@/lib/navigation/mapMatcher';

// ── Types ────────────────────────────────────────────────────────────────────

export interface NavigationHUDProps {
  state: NavigationState;
  matchedPosition: MatchedPosition | null;
  laneRecommendation: LaneRecommendation | null;
  routeSegments: RouteSegment[];
  className?: string;
}

// ── Sub-components ───────────────────────────────────────────────────────────

/** Speed limit circle (like the red circle in Amap screenshots). */
const SpeedLimitBadge: FC<{
  speedLimit: number | null;
  currentSpeed: number;
}> = memo(({ speedLimit, currentSpeed }) => {
  if (!speedLimit) return null;

  const isOver = currentSpeed > speedLimit;
  const isWarning = currentSpeed > speedLimit * 0.9;

  return (
    <div className="flex items-center gap-2">
      {/* Speed limit sign */}
      <div
        className={`
          w-12 h-12 rounded-full border-[3px] flex items-center justify-center
          font-bold text-lg
          ${isOver ? 'border-red-500 bg-red-500/20 text-red-400 animate-pulse' : 'border-red-500 bg-white/10 text-white'}
        `}
      >
        {speedLimit}
      </div>
    </div>
  );
});
SpeedLimitBadge.displayName = 'SpeedLimitBadge';

/** Current speed display (large number, left side). */
const SpeedIndicator: FC<{
  speed: number;
  speedLimit: number | null;
}> = memo(({ speed, speedLimit }) => {
  const displaySpeed = Math.round(speed);

  let colorClass = 'text-white';
  if (speedLimit) {
    if (speed > speedLimit) colorClass = 'text-red-400';
    else if (speed > speedLimit * 0.9) colorClass = 'text-yellow-400';
    else colorClass = 'text-white';
  }

  return (
    <div className="flex flex-col items-center">
      <span className={`text-4xl font-bold tabular-nums ${colorClass}`}>
        {displaySpeed}
      </span>
      <span className="text-xs text-white/60 -mt-1">km/h</span>
    </div>
  );
});
SpeedIndicator.displayName = 'SpeedIndicator';

/** Camera countdown (distance to next camera + its speed limit). */
const CameraCountdown: FC<{
  camera: SpeedCamera | null;
  distanceMeters: number;
}> = memo(({ camera, distanceMeters }) => {
  if (!camera || distanceMeters > 2000) return null;

  const distText =
    distanceMeters >= 1000
      ? `${(distanceMeters / 1000).toFixed(1)}km`
      : `${Math.round(distanceMeters)}m`;

  const isClose = distanceMeters < 500;

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-full
        ${isClose ? 'bg-red-500/30 border border-red-500/50' : 'bg-black/50'}
      `}
    >
      <div className="w-8 h-8 rounded-full border-2 border-red-500 flex items-center justify-center">
        <span className="text-xs font-bold text-red-400">
          {camera.speedLimit}
        </span>
      </div>
      <span className={`text-sm font-mono ${isClose ? 'text-red-400 font-bold' : 'text-white/80'}`}>
        {distText}
      </span>
    </div>
  );
});
CameraCountdown.displayName = 'CameraCountdown';

/** Route progress bar (vertical, right side — like Amap's green/red bar). */
const RouteProgressBar: FC<{
  segments: RouteSegment[];
  remainingDistance: number;
  totalDistance: number;
}> = memo(({ segments, remainingDistance, totalDistance }) => {
  if (totalDistance <= 0) return null;

  const progress = 1 - remainingDistance / totalDistance;

  // Build segment colors from traffic
  const segmentColors: Array<{ fraction: number; color: string }> = [];
  let cumDist = 0;

  const TRAFFIC_COLORS_MAP: Record<TrafficLevel, string> = {
    free: '#00E676',
    moderate: '#FFB300',
    slow: '#FF6D00',
    congested: '#F44336',
    unknown: '#42A5F5',
  };

  for (const seg of segments) {
    let segDist = 0;
    for (let i = 1; i < seg.points.length; i++) {
      const dlat = (seg.points[i].lat - seg.points[i - 1].lat) * 111320;
      const dlng = (seg.points[i].lng - seg.points[i - 1].lng) * 111320 * Math.cos((seg.points[i].lat * Math.PI) / 180);
      segDist += Math.sqrt(dlat * dlat + dlng * dlng);
    }
    segmentColors.push({
      fraction: segDist / totalDistance,
      color: TRAFFIC_COLORS_MAP[seg.traffic] || '#42A5F5',
    });
    cumDist += segDist;
  }

  return (
    <div className="fixed right-2 top-24 bottom-24 w-2.5 z-50 flex flex-col-reverse rounded-full overflow-hidden bg-black/40">
      {segmentColors.map((seg, i) => (
        <div
          key={i}
          style={{
            height: `${seg.fraction * 100}%`,
            backgroundColor: seg.color,
            opacity: 0.8,
          }}
        />
      ))}

      {/* Progress indicator (white dot) */}
      <div
        className="absolute w-4 h-4 -left-[3px] bg-white rounded-full border-2 border-blue-500 shadow-lg"
        style={{ bottom: `${progress * 100}%`, transform: 'translateY(50%)' }}
      />
    </div>
  );
});
RouteProgressBar.displayName = 'RouteProgressBar';

/** Lane guidance arrows (bottom of turn instruction). */
const LaneArrows: FC<{
  recommendation: LaneRecommendation | null;
}> = memo(({ recommendation }) => {
  if (!recommendation || recommendation.totalLanes <= 1) return null;

  const ARROW_MAP: Record<string, string> = {
    left: '↰',
    slight_left: '↖',
    sharp_left: '⬉',
    through: '↑',
    right: '↱',
    slight_right: '↗',
    sharp_right: '⬈',
    merge_to_left: '⇐',
    merge_to_right: '⇒',
    reverse: '↻',
    none: '·',
  };

  return (
    <div className="flex items-center gap-0.5 mt-1">
      {recommendation.lanes.map((lane, i) => {
        const arrows = lane.directions.map(d => ARROW_MAP[d] || '↑').join('');
        return (
          <div
            key={i}
            className={`
              flex items-center justify-center px-2 py-1 text-lg font-bold rounded
              ${lane.isRecommended
                ? 'bg-green-500/30 text-green-400 border border-green-500/50'
                : 'bg-white/10 text-white/40'}
              ${lane.isCurrent ? 'ring-2 ring-blue-400' : ''}
            `}
          >
            {arrows}
          </div>
        );
      })}
    </div>
  );
});
LaneArrows.displayName = 'LaneArrows';

/** Turn instruction bar (top of screen). */
const TurnInstructionBar: FC<{
  nextManeuver: Maneuver | null;
  distanceToTurn: number;
  roadName: string;
  laneRecommendation: LaneRecommendation | null;
}> = memo(({ nextManeuver, distanceToTurn, roadName, laneRecommendation }) => {
  if (!nextManeuver) return null;

  const MANEUVER_ICONS: Record<string, string> = {
    'turn-left': '↰',
    'turn-right': '↱',
    'slight-left': '↖',
    'slight-right': '↗',
    'sharp-left': '⬉',
    'sharp-right': '⬈',
    'straight': '↑',
    'u-turn': '↻',
    'fork-left': '⑂',
    'fork-right': '⑂',
    'ramp-left': '↰',
    'ramp-right': '↱',
    'merge-left': '⇐',
    'merge-right': '⇒',
    'roundabout': '↺',
    'arrive': '⬤',
  };

  const icon = MANEUVER_ICONS[nextManeuver.type] || '↑';
  const distText =
    distanceToTurn >= 1000
      ? `${(distanceToTurn / 1000).toFixed(1)} km`
      : `${Math.round(distanceToTurn)} m`;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 to-transparent px-4 pt-2 pb-6 safe-area-top">
      <div className="flex items-start gap-3">
        {/* Maneuver icon + distance */}
        <div className="flex flex-col items-center min-w-[60px]">
          <span className="text-3xl">{icon}</span>
          <span className="text-lg font-bold text-white tabular-nums">{distText}</span>
        </div>

        {/* Road name + lane arrows */}
        <div className="flex-1 min-w-0">
          <div className="text-white font-medium text-base truncate">
            {roadName || nextManeuver.streetName}
          </div>
          <LaneArrows recommendation={laneRecommendation} />
        </div>
      </div>
    </div>
  );
});
TurnInstructionBar.displayName = 'TurnInstructionBar';

/** Bottom info bar (ETA, distance, arrival time). */
const BottomInfoBar: FC<{
  remainingDistance: number;
  remainingTime: number;
  eta: string;
  roadName: string;
}> = memo(({ remainingDistance, remainingTime, eta, roadName }) => {
  const distText =
    remainingDistance >= 1000
      ? `${(remainingDistance / 1000).toFixed(1)}km`
      : `${Math.round(remainingDistance)}m`;

  const timeText = useMemo(() => {
    const mins = Math.ceil(remainingTime / 60);
    if (mins >= 60) {
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}ч.${m.toString().padStart(2, '0')}мин`;
    }
    return `${mins}мин`;
  }, [remainingTime]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-t from-black/90 to-transparent safe-area-bottom">
      <div className="px-4 pb-3 pt-6">
        {/* Road name */}
        <div className="text-white/70 text-sm truncate mb-1">{roadName}</div>

        {/* Time / Distance / ETA */}
        <div className="flex items-baseline gap-4">
          <span className="text-2xl font-bold text-white tabular-nums">{timeText}</span>
          <span className="text-lg text-white/70 tabular-nums">{distText}</span>
          <span className="text-lg text-white/60 ml-auto tabular-nums">
            {eta} Прибытие
          </span>
        </div>
      </div>
    </div>
  );
});
BottomInfoBar.displayName = 'BottomInfoBar';

// ── Main HUD component ──────────────────────────────────────────────────────

export const NavigationHUD: FC<NavigationHUDProps> = memo(({
  state,
  matchedPosition,
  laneRecommendation,
  routeSegments,
}) => {
  if (state.phase !== 'navigating') return null;

  const speedLimit = matchedPosition?.speedLimit ?? state.speedLimit;
  const roadName = matchedPosition?.roadName ?? state.nextInstruction?.streetName ?? '';

  // Calculate distance to nearest camera
  const cameraDistance = state.nearbyCamera
    ? haversineM(
        state.currentPosition?.lat ?? 0,
        state.currentPosition?.lng ?? 0,
        state.nearbyCamera.location.lat,
        state.nearbyCamera.location.lng,
      )
    : Infinity;

  return (
    <div className="pointer-events-none">
      {/* Top: Turn instruction + lane arrows */}
      <TurnInstructionBar
        nextManeuver={state.nextInstruction}
        distanceToTurn={state.distanceToNextTurn}
        roadName={roadName}
        laneRecommendation={laneRecommendation}
      />

      {/* Left side: Speed + Speed limit */}
      <div className="fixed left-4 top-24 z-50 flex flex-col items-center gap-3">
        <SpeedIndicator speed={state.currentSpeed} speedLimit={speedLimit} />
        <SpeedLimitBadge speedLimit={speedLimit} currentSpeed={state.currentSpeed} />
      </div>

      {/* Camera countdown (top center-right) */}
      <div className="fixed top-20 right-16 z-50">
        <CameraCountdown camera={state.nearbyCamera} distanceMeters={cameraDistance} />
      </div>

      {/* Right side: Route progress bar */}
      <RouteProgressBar
        segments={routeSegments}
        remainingDistance={state.remainingDistance}
        totalDistance={state.route?.totalDistanceMeters ?? 0}
      />

      {/* Bottom: ETA / distance / arrival */}
      <BottomInfoBar
        remainingDistance={state.remainingDistance}
        remainingTime={state.remainingTime}
        eta={state.eta}
        roadName={roadName}
      />
    </div>
  );
});
NavigationHUD.displayName = 'NavigationHUD';

// ── Helpers ──────────────────────────────────────────────────────────────────

function haversineM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const a =
    sinLat * sinLat +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * sinLng * sinLng;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default NavigationHUD;
