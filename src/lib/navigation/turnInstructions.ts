import type { ManeuverType } from '@/types/navigation';
import { formatNavigationDistance, formatNavigationDuration, formatNavigationEta, getCurrentLanguageCode } from '@/lib/navigation/navigationUi';

const MANEUVER_ICONS: Record<ManeuverType, string> = {
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

const MANEUVER_TEXT_RU: Record<ManeuverType, string> = {
  'depart': 'Начните движение',
  'arrive': 'Вы прибыли',
  'turn-left': 'Поверните налево',
  'turn-right': 'Поверните направо',
  'turn-slight-left': 'Плавно налево',
  'turn-slight-right': 'Плавно направо',
  'turn-sharp-left': 'Резко налево',
  'turn-sharp-right': 'Резко направо',
  'uturn': 'Развернитесь',
  'merge-left': 'Перестройтесь левее',
  'merge-right': 'Перестройтесь правее',
  'fork-left': 'Держитесь левее',
  'fork-right': 'Держитесь правее',
  'roundabout': 'На кольце',
  'exit-roundabout': 'Съезд с кольца',
  'straight': 'Прямо',
  'ramp-left': 'Съезд налево',
  'ramp-right': 'Съезд направо',
  'keep-left': 'Держитесь левее',
  'keep-right': 'Держитесь правее',
};

const MANEUVER_TEXT_EN: Record<ManeuverType, string> = {
  'depart': 'Start driving',
  'arrive': 'You have arrived',
  'turn-left': 'Turn left',
  'turn-right': 'Turn right',
  'turn-slight-left': 'Keep slightly left',
  'turn-slight-right': 'Keep slightly right',
  'turn-sharp-left': 'Take a sharp left',
  'turn-sharp-right': 'Take a sharp right',
  'uturn': 'Make a U-turn',
  'merge-left': 'Merge left',
  'merge-right': 'Merge right',
  'fork-left': 'Keep left',
  'fork-right': 'Keep right',
  'roundabout': 'At the roundabout',
  'exit-roundabout': 'Exit the roundabout',
  'straight': 'Go straight',
  'ramp-left': 'Take the left ramp',
  'ramp-right': 'Take the right ramp',
  'keep-left': 'Keep left',
  'keep-right': 'Keep right',
};

const MANEUVER_VOICE_RU: Record<ManeuverType, string> = {
  'depart': 'Начните движение',
  'arrive': 'Вы прибыли в пункт назначения',
  'turn-left': 'Поверните налево',
  'turn-right': 'Поверните направо',
  'turn-slight-left': 'Плавно налево',
  'turn-slight-right': 'Плавно направо',
  'turn-sharp-left': 'Резко поверните налево',
  'turn-sharp-right': 'Резко поверните направо',
  'uturn': 'Выполните разворот',
  'merge-left': 'Перестройтесь левее',
  'merge-right': 'Перестройтесь правее',
  'fork-left': 'На развилке держитесь левее',
  'fork-right': 'На развилке держитесь правее',
  'roundabout': 'На кольце',
  'exit-roundabout': 'Съезд с кольца',
  'straight': 'Продолжайте движение прямо',
  'ramp-left': 'Съезд налево',
  'ramp-right': 'Съезд направо',
  'keep-left': 'Держитесь левее',
  'keep-right': 'Держитесь правее',
};

const MANEUVER_VOICE_EN: Record<ManeuverType, string> = {
  'depart': 'Start driving',
  'arrive': 'You have arrived at your destination',
  'turn-left': 'Turn left',
  'turn-right': 'Turn right',
  'turn-slight-left': 'Keep slightly left',
  'turn-slight-right': 'Keep slightly right',
  'turn-sharp-left': 'Take a sharp left',
  'turn-sharp-right': 'Take a sharp right',
  'uturn': 'Make a U-turn',
  'merge-left': 'Merge left',
  'merge-right': 'Merge right',
  'fork-left': 'Keep left at the fork',
  'fork-right': 'Keep right at the fork',
  'roundabout': 'At the roundabout',
  'exit-roundabout': 'Exit the roundabout',
  'straight': 'Continue straight',
  'ramp-left': 'Take the left ramp',
  'ramp-right': 'Take the right ramp',
  'keep-left': 'Keep left',
  'keep-right': 'Keep right',
};

function isRu(): boolean {
  return getCurrentLanguageCode() === 'ru';
}

export function getManeuverIconName(type: ManeuverType): string {
  return MANEUVER_ICONS[type] ?? 'ArrowUp';
}

export function getManeuverText(type: ManeuverType): string {
  const table = isRu() ? MANEUVER_TEXT_RU : MANEUVER_TEXT_EN;
  return table[type] ?? (isRu() ? 'Продолжайте движение' : 'Continue');
}

export function getManeuverInstruction(type: ManeuverType, streetName?: string): string {
  const base = getManeuverText(type);
  if (streetName) {
    if (type === 'arrive') return `${base}: ${streetName}`;
    return isRu() ? `${base} на ${streetName}` : `${base} onto ${streetName}`;
  }
  return base;
}

export function getVoiceInstruction(type: ManeuverType, distanceMeters: number, streetName?: string): string {
  const table = isRu() ? MANEUVER_VOICE_RU : MANEUVER_VOICE_EN;
  const base = table[type] ?? (isRu() ? 'Продолжайте движение' : 'Continue');
  const distText = formatVoiceDistance(distanceMeters);
  const street = streetName ? (isRu() ? ` на ${streetName}` : ` onto ${streetName}`) : '';

  if (type === 'depart') return base;
  if (type === 'arrive') return base;
  return isRu()
    ? `Через ${distText} ${base.toLowerCase()}${street}`
    : `In ${distText} ${base.toLowerCase()}${street}`;
}

function formatVoiceDistance(meters: number): string {
  if (isRu()) {
    if (meters < 100) return `${Math.round(meters / 10) * 10} метров`;
    if (meters < 1000) return `${Math.round(meters / 50) * 50} метров`;
    const km = meters / 1000;
    if (km < 10) return `${km.toFixed(1)} километра`;
    return `${Math.round(km)} километров`;
  }

  if (meters < 100) return `${Math.round(meters / 10) * 10} meters`;
  if (meters < 1000) return `${Math.round(meters / 50) * 50} meters`;
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)} kilometers`;
  return `${Math.round(km)} kilometers`;
}

export function formatDistance(meters: number): string {
  return formatNavigationDistance(meters, getCurrentLanguageCode());
}

export function formatDuration(seconds: number): string {
  return formatNavigationDuration(seconds, getCurrentLanguageCode());
}

export function formatETA(seconds: number): string {
  return formatNavigationEta(seconds, getCurrentLanguageCode());
}
