import { useState, useEffect, useRef } from 'react';
import { X, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Maneuver, SpeedCamera } from '@/types/navigation';
import { SpeedDisplay } from './SpeedDisplay';
import { TurnInstruction } from './TurnInstruction';
import { formatDistance, formatDuration, formatETA } from '@/lib/navigation/turnInstructions';
import { getCameraDistance } from '@/lib/navigation/speedCameras';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';

interface NavigationPanelProps {
  speed: number;
  speedLimit: number | null;
  nextInstruction: Maneuver | null;
  followingInstruction: Maneuver | null;
  distanceToNextTurn: number;
  remainingDistance: number;
  remainingTime: number;
  eta: string;
  nearbyCamera: SpeedCamera | null;
  currentPosition: { lat: number; lng: number } | null;
  onStop: () => void;
}

export function NavigationPanel({
  speed,
  speedLimit,
  nextInstruction,
  followingInstruction,
  distanceToNextTurn,
  remainingDistance,
  remainingTime,
  eta,
  nearbyCamera,
  currentPosition,
  onStop,
}: NavigationPanelProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const [isMinimized, setIsMinimized] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const touchTimerRef = useRef<number>(0);

  // Компактный режим через 30 сек при движении > 5 км/ч
  useEffect(() => {
    clearTimeout(idleTimerRef.current);
    if (speed > 5) {
      idleTimerRef.current = setTimeout(() => setIsMinimized(true), 30_000);
    } else {
      setIsMinimized(false);
    }
    return () => clearTimeout(idleTimerRef.current);
  }, [speed]);

  const handleTouch = () => {
    setIsMinimized(false);
    touchTimerRef.current = Date.now();
    clearTimeout(idleTimerRef.current);
    if (speed > 5) {
      idleTimerRef.current = setTimeout(() => setIsMinimized(true), 30_000);
    }
  };

  const cameraDist = nearbyCamera && currentPosition
    ? getCameraDistance(currentPosition, nearbyCamera)
    : null;

  return (
    <div onClick={handleTouch}>
      {/* Speed camera warning */}
      {nearbyCamera && cameraDist != null && (
        <div className={cn(
          'absolute top-20 left-3 right-3 z-[950]',
          'bg-red-500/90 backdrop-blur-sm rounded-xl',
          'py-3 px-4 flex items-center gap-3',
          'shadow-lg shadow-red-500/30',
          'animate-pulse'
        )}>
          <Camera className="w-6 h-6 text-white shrink-0" />
          <div className="flex-1">
            <p className="text-white font-bold text-sm">{navText('Камера через', 'Camera ahead in', languageCode)} {formatDistance(cameraDist)}</p>
            <p className="text-red-100 text-xs">{navText('Ограничение', 'Limit', languageCode)} {nearbyCamera.speedLimit} {navText('км/ч', 'km/h', languageCode)}</p>
          </div>
          <div className="w-10 h-10 rounded-full border-[2.5px] border-white bg-white flex items-center justify-center">
            <span className="text-sm font-bold text-red-600">{nearbyCamera.speedLimit}</span>
          </div>
        </div>
      )}

      {/* Bottom panel */}
      <div className={cn(
        'absolute bottom-0 left-0 right-0 z-[900]',
        'bg-gray-950/95 backdrop-blur-xl',
        'rounded-t-2xl border-t border-white/10',
        'shadow-[0_-8px_40px_rgba(0,0,0,0.5)]',
        'pb-safe transition-all duration-300 ease-out',
        isMinimized ? 'h-20' : ''
      )}>
        {/* Minimized view */}
        {isMinimized ? (
          <div className="h-full flex items-center px-4 gap-3">
            {nextInstruction && (
              <TurnInstruction
                type={nextInstruction.type}
                distanceMeters={distanceToNextTurn}
                streetName={nextInstruction.streetName}
                size="sm"
              />
            )}
            <div className="ml-auto flex items-center gap-3">
              <div className="text-right">
                <span className="text-sm font-semibold text-white tabular-nums">{formatDistance(remainingDistance)}</span>
                <span className="text-xs text-gray-500 ml-1">{eta}</span>
              </div>
              <SpeedDisplay speed={speed} speedLimit={speedLimit} className="scale-75 origin-right" />
            </div>
          </div>
        ) : (
          <>
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-4 pb-4">
              {/* Row 1: Next turn instruction */}
              {nextInstruction && (
                <div className="mb-3">
                  <TurnInstruction
                    type={nextInstruction.type}
                    distanceMeters={distanceToNextTurn}
                    streetName={nextInstruction.streetName}
                    size="lg"
                  />
                </div>
              )}

              {/* Row 2: Following maneuver preview */}
              {followingInstruction && (
                <div className="mb-3 pl-1 border-l-2 border-white/10 ml-6">
                  <div className="pl-3">
                    <TurnInstruction
                      type={followingInstruction.type}
                      distanceMeters={followingInstruction.distanceMeters}
                      streetName={followingInstruction.streetName}
                      size="sm"
                    />
                  </div>
                </div>
              )}

              {/* Row 3: Speed / Distance-Time / ETA */}
              <div className="flex items-center justify-between bg-gray-800/60 rounded-xl p-3">
                {/* Speed */}
                <SpeedDisplay speed={speed} speedLimit={speedLimit} />

                {/* Remaining */}
                <div className="text-center">
                  <div className="text-lg font-semibold text-white tabular-nums">
                    {formatDistance(remainingDistance)}
                  </div>
                  <div className="text-sm text-gray-400">
                    {formatDuration(remainingTime)}
                  </div>
                </div>

                {/* ETA */}
                <div className="text-right">
                  <div className="text-2xl font-bold text-white tabular-nums">{eta}</div>
                  <div className="text-xs text-gray-500">{navText('прибытие', 'arrival', languageCode)}</div>
                </div>
              </div>

              {/* Stop button */}
              <button
                onClick={onStop}
                className={cn(
                  'w-full h-11 mt-3 rounded-xl',
                  'bg-red-500/20 border border-red-500/30',
                  'text-red-400 font-medium text-sm',
                  'flex items-center justify-center gap-2',
                  'transition-all active:scale-[0.98] hover:bg-red-500/30'
                )}
              >
                <X className="w-4 h-4" />
                {navText('Завершить маршрут', 'End route', languageCode)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
