import type { ManeuverType } from '@/types/navigation';

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

const MANEUVER_TEXT: Record<ManeuverType, string> = {
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

const MANEUVER_VOICE: Record<ManeuverType, string> = {
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

export function getManeuverIconName(type: ManeuverType): string {
  return MANEUVER_ICONS[type] ?? 'ArrowUp';
}

export function getManeuverText(type: ManeuverType): string {
  return MANEUVER_TEXT[type] ?? 'Продолжайте движение';
}

export function getManeuverInstruction(type: ManeuverType, streetName?: string): string {
  const base = MANEUVER_TEXT[type] ?? 'Продолжайте движение';
  if (streetName) {
    if (type === 'arrive') return `${base}: ${streetName}`;
    return `${base} на ${streetName}`;
  }
  return base;
}

export function getVoiceInstruction(type: ManeuverType, distanceMeters: number, streetName?: string): string {
  const base = MANEUVER_VOICE[type] ?? 'Продолжайте движение';
  const distText = formatVoiceDistance(distanceMeters);
  const street = streetName ? ` на ${streetName}` : '';

  if (type === 'depart') return base;
  if (type === 'arrive') return base;
  return `Через ${distText} ${base.toLowerCase()}${street}`;
}

function formatVoiceDistance(meters: number): string {
  if (meters < 100) return `${Math.round(meters / 10) * 10} метров`;
  if (meters < 1000) return `${Math.round(meters / 50) * 50} метров`;
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)} километра`;
  return `${Math.round(km)} километров`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters / 10) * 10} м`;
  }
  const km = meters / 1000;
  if (km < 10) return `${km.toFixed(1)} км`;
  return `${Math.round(km)} км`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return '< 1 мин';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} мин`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`;
}

export function formatETA(seconds: number): string {
  const now = new Date();
  now.setSeconds(now.getSeconds() + seconds);
  return now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
