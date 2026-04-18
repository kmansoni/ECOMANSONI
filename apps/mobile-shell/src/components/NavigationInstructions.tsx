import { useMemo } from 'react';
import type { NavigationInstruction } from '../types/navigation';
import type { ManeuverType } from '../../../src/types/navigation';

interface NavigationInstructionsProps {
  current: NavigationInstruction | null;
  next: NavigationInstruction | null;
  distance: number;
}

const maneuverIcons: Record<string, string> = {
  'turn-left': '↰',
  'turn-right': '↱',
  'turn-slight-left': '↖',
  'turn-slight-right': '↗',
  'turn-sharp-left': '⇐',
  'turn-sharp-right': '⇒',
  'uturn': '↺',
  'straight': '↑',
  'depart': '↑',
  'arrive': '🏁',
  'roundabout': '🔄',
  'exit-roundabout': 'exit',
  'merge-left': '←',
  'merge-right': '→',
  'fork-left': '↙',
  'fork-right': '↘',
  'ramp-left': '↩',
  'ramp-right': '↪',
  'keep-left': '↰',
  'keep-right': '↱',
};

function getManeuverIcon(type: ManeuverType | string): string {
  return maneuverIcons[type] || '→';
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} м`;
  }
  return `${(meters / 1000).toFixed(1)} км`;
}

function parseManeuverType(type: ManeuverType | string): { icon: string; color: string } {
  const icon = getManeuverIcon(type);
  let color = '#3B82F6';
  
  if (type === 'arrive') color = '#22C55E';
  else if (type === 'uturn') color = '#EF4444';
  else if (type.includes('left')) color = '#F59E0B';
  else if (type.includes('right')) color = '#8B5CF6';
  
  return { icon, color };
}

function TurnArrow({ type, modifier }: { type: string; modifier?: string }) {
  const { icon, color } = parseManeuverType(type);
  const rotation = getRotation(type, modifier);
  
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" style={{ transform: `rotate(${rotation}deg)` }}>
      <circle cx="24" cy="24" r="22" fill={color} />
      <path d="M14 24 L34 24 M34 24 L26 18 M34 24 L26 30" 
            stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" 
            fill="none" />
    </svg>
  );
}

function getRotation(type: string, modifier?: string): number {
  if (type === 'straight' || type === 'depart') return 0;
  if (type === 'arrive') return 0;
  if (type === 'uturn') return 180;
  if (type === 'turn-left' || type === 'turn-sharp-left' || type === 'turn-slight-left') return -90;
  if (type === 'turn-right' || type === 'turn-sharp-right' || type === 'turn-slight-right') return 90;
  if (type === 'merge-left' || type === 'keep-left' || type === 'fork-left') return -45;
  if (type === 'merge-right' || type === 'keep-right' || type === 'fork-right') return 45;
  return 0;
}

export function NavigationInstructions({ current, next, distance }: NavigationInstructionsProps) {
  const maneuverInfo = useMemo(() => {
    if (!current) return null;
    return parseManeuverType(current.type);
  }, [current]);
  
  return (
    <div className="flex flex-col gap-3 p-4 bg-white rounded-xl shadow-lg">
      {current && (
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">
            <TurnArrow type={current.type} modifier={current.modifier} />
          </div>
          <div className="flex-1">
            <div className="text-sm text-gray-500">
              {formatDistance(distance)}
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {current.text}
            </div>
            {current.streetName && (
              <div className="text-sm text-gray-600">
                {current.streetName}
              </div>
            )}
          </div>
        </div>
      )}
      
      {next && (
        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
          <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full">
            <span className="text-sm">{getManeuverIcon(next.type)}</span>
          </div>
          <div className="flex-1 text-sm text-gray-600">
            После: {next.text}
          </div>
          <div className="text-sm text-gray-400">
            {formatDistance(next.distance)}
          </div>
        </div>
      )}
    </div>
  );
}

export default NavigationInstructions;