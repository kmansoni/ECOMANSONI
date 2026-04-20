import { cn } from '@/lib/utils';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { formatNavigationSpeedUnit } from '@/lib/navigation/navigationUi';

interface SpeedDisplayProps {
  speed: number;
  speedLimit: number | null;
  className?: string;
}

export function SpeedDisplay({ speed, speedLimit, className }: SpeedDisplayProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const displaySpeed = Math.round(speed);
  const isOverspeed = speedLimit != null && speed > speedLimit + 5; // 5 km/h tolerance for GPS noise

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      {/* Speed limit sign */}
      {speedLimit != null && (
        <div className="w-9 h-9 rounded-full border-[2.5px] border-red-500 bg-white flex items-center justify-center shadow-md">
          <span className="text-[13px] font-bold text-black leading-none">{speedLimit}</span>
        </div>
      )}

      {/* Speed number */}
      <div
        className={cn(
          'text-4xl font-bold tabular-nums leading-none transition-colors',
          isOverspeed ? 'text-red-500 animate-pulse' : 'text-green-400'
        )}
        style={isOverspeed ? { filter: 'drop-shadow(0 0 8px rgba(239,68,68,0.5))' } : undefined}
      >
        {displaySpeed}
      </div>

      {/* Unit */}
      <span className="text-[10px] text-gray-400 font-medium -mt-0.5">{formatNavigationSpeedUnit(languageCode)}</span>
    </div>
  );
}
