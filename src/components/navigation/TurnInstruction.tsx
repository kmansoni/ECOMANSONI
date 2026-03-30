import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerDownLeft,
  CornerDownRight,
  CornerLeftDown,
  CornerRightDown,
  Flag,
  GitBranch,
  GitMerge,
  LogOut,
  Navigation,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import type { ManeuverType } from '@/types/navigation';
import { formatDistance } from '@/lib/navigation/turnInstructions';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ElementType> = {
  Navigation, Flag, CornerDownLeft, CornerDownRight,
  CornerLeftDown, CornerRightDown, RotateCcw, RotateCw,
  GitMerge, GitBranch, LogOut, ArrowUp, ArrowUpLeft, ArrowUpRight,
  TrendingDown: CornerDownLeft, TrendingUp: CornerDownRight,
};

const ICON_MAP: Record<ManeuverType, string> = {
  'depart': 'Navigation',
  'arrive': 'Flag',
  'turn-left': 'CornerDownLeft',
  'turn-right': 'CornerDownRight',
  'turn-slight-left': 'TrendingDown',
  'turn-slight-right': 'TrendingUp',
  'turn-sharp-left': 'CornerLeftDown',
  'turn-sharp-right': 'CornerRightDown',
  'uturn': 'RotateCcw',
  'merge-left': 'GitMerge',
  'merge-right': 'GitMerge',
  'fork-left': 'GitBranch',
  'fork-right': 'GitBranch',
  'roundabout': 'RotateCw',
  'exit-roundabout': 'LogOut',
  'straight': 'ArrowUp',
  'ramp-left': 'CornerDownLeft',
  'ramp-right': 'CornerDownRight',
  'keep-left': 'ArrowUpLeft',
  'keep-right': 'ArrowUpRight',
};

interface TurnInstructionProps {
  type: ManeuverType;
  distanceMeters: number;
  streetName: string;
  size?: 'lg' | 'sm';
}

export function TurnInstruction({ type, distanceMeters, streetName, size = 'lg' }: TurnInstructionProps) {
  const iconName = ICON_MAP[type] ?? 'ArrowUp';
  const Icon = ICONS[iconName] ?? ArrowUp;
  const isLarge = size === 'lg';

  return (
    <div className={cn('flex items-center gap-3', isLarge ? 'gap-4' : 'gap-2')}>
      {/* Maneuver icon */}
      <div className={cn(
        'shrink-0 rounded-xl flex items-center justify-center',
        isLarge
          ? 'w-14 h-14 bg-green-500/20'
          : 'w-8 h-8 bg-white/5'
      )}>
        <Icon className={cn(
          'text-white',
          isLarge ? 'w-8 h-8' : 'w-4 h-4'
        )} />
      </div>

      {/* Text */}
      <div className="min-w-0 flex-1">
        <div className={cn(
          'font-bold text-white',
          isLarge ? 'text-2xl' : 'text-sm'
        )}>
          {formatDistance(distanceMeters)}
        </div>
        {streetName && (
          <div className={cn(
            'truncate',
            isLarge ? 'text-sm text-gray-400 mt-0.5' : 'text-xs text-gray-500'
          )}>
            {streetName}
          </div>
        )}
      </div>
    </div>
  );
}
