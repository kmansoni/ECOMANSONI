import { getCurrentLanguageCode, resolveLocaleFromLanguageCode } from '@/lib/localization/appLocale';

export { getCurrentLanguageCode } from '@/lib/localization/appLocale';

export function isRussianNavigationUi(languageCode?: string | null): boolean {
  return getCurrentLanguageCode(languageCode) === 'ru';
}

export function getNavigationLocale(languageCode?: string | null): string {
  return isRussianNavigationUi(languageCode) ? 'ru-RU' : 'en-US';
}

export function getNavigationSpeechLocale(languageCode?: string | null): string {
  return resolveLocaleFromLanguageCode(languageCode);
}

export function navText(ru: string, en: string, languageCode?: string | null): string {
  return isRussianNavigationUi(languageCode) ? ru : en;
}

export function formatNavigationDistance(meters: number, languageCode?: string | null): string {
  if (meters < 1000) {
    const rounded = Math.round(meters / 10) * 10;
    return isRussianNavigationUi(languageCode) ? `${rounded} м` : `${rounded} m`;
  }

  const km = meters / 1000;
  const value = km < 10 ? km.toFixed(1) : String(Math.round(km));
  return isRussianNavigationUi(languageCode) ? `${value} км` : `${value} km`;
}

export function formatNavigationDuration(seconds: number, languageCode?: string | null): string {
  if (seconds < 60) {
    return navText('< 1 мин', '< 1 min', languageCode);
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return isRussianNavigationUi(languageCode) ? `${minutes} мин` : `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (isRussianNavigationUi(languageCode)) {
    return mins > 0 ? `${hours} ч ${mins} мин` : `${hours} ч`;
  }

  return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
}

export function formatNavigationEta(seconds: number, languageCode?: string | null): string {
  const date = new Date();
  date.setSeconds(date.getSeconds() + seconds);
  return date.toLocaleTimeString(getNavigationLocale(languageCode), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNavigationTripDate(iso: string, languageCode?: string | null): string {
  return new Date(iso).toLocaleDateString(getNavigationLocale(languageCode), {
    day: 'numeric',
    month: 'short',
  });
}

export function formatNavigationSpeedUnit(languageCode?: string | null): string {
  return navText('км/ч', 'km/h', languageCode);
}

export function formatRouteVariants(count: number, languageCode?: string | null): string {
  return isRussianNavigationUi(languageCode)
    ? `${count} вариант${count > 1 ? 'а' : ''}`
    : `${count} route${count === 1 ? '' : 's'}`;
}

export function formatTransfers(count: number, languageCode?: string | null): string {
  if (!isRussianNavigationUi(languageCode)) {
    return `${count} transfer${count === 1 ? '' : 's'}`;
  }

  return `${count} пересад${count === 1 ? 'ка' : count < 5 ? 'ки' : 'ок'}`;
}

export function formatTransitLines(count: number, languageCode?: string | null): string {
  return isRussianNavigationUi(languageCode)
    ? `${count} линий ОТ`
    : `${count} transit line${count === 1 ? '' : 's'}`;
}

export function formatCheckedVariants(count: number, languageCode?: string | null): string {
  return isRussianNavigationUi(languageCode)
    ? `Проверено ${count} вариантов запроса`
    : `Checked ${count} query variants`;
}