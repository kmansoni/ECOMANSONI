import type { Locale } from '@/lib/localization/addressLocalizer';

export type AppLanguageCode = 'ru' | 'en' | 'uk' | 'kk' | 'uz' | 'de' | 'fr' | 'zh' | 'ja' | 'ar' | 'tr' | 'es';

const DEFAULT_LANGUAGE: AppLanguageCode = 'ru';

const SUPPORTED_LANGUAGE_CODES = new Set<AppLanguageCode>([
  'ru', 'en', 'uk', 'kk', 'uz', 'de', 'fr', 'zh', 'ja', 'ar', 'tr', 'es',
]);

export function normalizeLanguageCode(input?: string | null): AppLanguageCode {
  const normalized = String(input ?? '')
    .trim()
    .toLowerCase()
    .replace('_', '-')
    .split('-')[0] as AppLanguageCode;

  return SUPPORTED_LANGUAGE_CODES.has(normalized) ? normalized : DEFAULT_LANGUAGE;
}

export function getSystemLanguageCode(): AppLanguageCode {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  return normalizeLanguageCode(navigator.language);
}

export function getCurrentLanguageCode(explicit?: string | null): AppLanguageCode {
  if (explicit) {
    return normalizeLanguageCode(explicit);
  }

  if (typeof document !== 'undefined' && document.documentElement.lang) {
    return normalizeLanguageCode(document.documentElement.lang);
  }

  return getSystemLanguageCode();
}

export function resolveLocaleFromLanguageCode(languageCode?: string | null): Locale {
  switch (getCurrentLanguageCode(languageCode)) {
    case 'en': return 'en-US';
    case 'uk': return 'uk-UA';
    case 'kk': return 'kk-KZ';
    case 'uz': return 'uz-Latn-UZ';
    case 'de': return 'de-DE';
    case 'fr': return 'fr-FR';
    case 'zh': return 'zh-CN';
    case 'ja': return 'ja-JP';
    case 'ar': return 'ar-SA';
    case 'tr': return 'tr-TR';
    case 'es': return 'es-ES';
    case 'ru':
    default:
      return 'ru-RU';
  }
}

export function getMapLabelTextFieldExpression(languageCode?: string | null): unknown[] {
  const lang = getCurrentLanguageCode(languageCode);

  switch (lang) {
    case 'en':
      return ['coalesce', ['get', 'name:en'], ['get', 'int_name'], ['get', 'name:latin'], ['get', 'name']];
    case 'uk':
      return ['coalesce', ['get', 'name:uk'], ['get', 'name:ru'], ['get', 'name']];
    case 'kk':
      return ['coalesce', ['get', 'name:kk'], ['get', 'name:ru'], ['get', 'name']];
    case 'uz':
      return ['coalesce', ['get', 'name:uz'], ['get', 'int_name'], ['get', 'name']];
    case 'de':
      return ['coalesce', ['get', 'name:de'], ['get', 'int_name'], ['get', 'name']];
    case 'fr':
      return ['coalesce', ['get', 'name:fr'], ['get', 'int_name'], ['get', 'name']];
    case 'zh':
      return ['coalesce', ['get', 'name:zh'], ['get', 'name'], ['get', 'int_name']];
    case 'ja':
      return ['coalesce', ['get', 'name:ja'], ['get', 'name'], ['get', 'int_name']];
    case 'ar':
      return ['coalesce', ['get', 'name:ar'], ['get', 'name'], ['get', 'int_name']];
    case 'tr':
      return ['coalesce', ['get', 'name:tr'], ['get', 'int_name'], ['get', 'name']];
    case 'es':
      return ['coalesce', ['get', 'name:es'], ['get', 'int_name'], ['get', 'name']];
    case 'ru':
    default:
      return ['coalesce', ['get', 'name:ru'], ['get', 'name'], ['get', 'int_name']];
  }
}

export function getRequestLanguageHeader(languageCode?: string | null): string {
  return getCurrentLanguageCode(languageCode);
}