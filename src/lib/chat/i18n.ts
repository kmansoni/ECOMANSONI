/**
 * Chat Internationalization Helpers
 *
 * RTL, pluralization, text direction, bounding box calculation (simplified).
 */

import { format as dateFnsFormat } from 'date-fns';
import { enUS, ru, arSA, jaJP } from 'date-fns/locale';

const localeMap: Record<string, Locale> = {
  'en-US': enUS,
  'ru-RU': ru,
  'ar-SA': arSA,
  'ja-JP': jaJP,
};

export function formatMessageTime(timestamp: number, locale: string = 'ru-RU', options?: {
  timezone?: string;
  includeYear?: boolean;
  showTimezone?: boolean;
}): string {
  const date = new Date(timestamp);
  const fmt = options?.includeYear ? 'PPpp' : 'p'; // date-fns formats
  const formatted = dateFnsFormat(date, fmt, {
    locale: localeMap[locale] || enUS,
    timeZone: options?.timezone,
  });
  if (options?.showTimezone) {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return `${formatted} (${tz})`;
  }
  return formatted;
}

export function pluralizeMessageCount(count: number, locale: string): string {
  const n = Math.abs(count);
  const lastDigit = n % 10;
  const lastTwoDigits = n % 100;

  let form = 'many'; // default
  if (locale === 'ru') {
    if (lastDigit === 1 && lastTwoDigits !== 11) form = 'one';
    else if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) form = 'few';
    else form = 'many';
  } else if (locale === 'en') {
    form = count === 1 ? 'one' : 'other';
  } else if (locale === 'ar') {
    // Arabic: 6 forms (simplified here to 3)
    if (n === 0) form = 'zero';
    else if (n === 1) form = 'one';
    else if (n === 2) form = 'two';
    else if (n >= 3 && n <= 10) form = 'few';
    else if (n >= 11 && n <= 99) form = 'many';
    else form = 'other';
  }

  const map: Record<string, Record<string, string>> = {
    ru: { one: `${count} сообщение`, few: `${count} сообщения`, many: `${count} сообщений` },
    en: { one: `${count} message`, other: `${count} messages` },
    ar: { zero: `${count} رسالة`, one: `${count} رسالة`, two: `${count} رسالتان`, few: `${count} رسائل`, many: `${count} رسالة`, other: `${count} رسالة` },
  };

  return map[locale]?.[form] || `${count}`;
}

export interface TextDirectionSegment {
  text: string;
  direction: 'ltr' | 'rtl' | 'neutral';
}

export function normalizeTextDirection(text: string, locale: string): {
  direction: 'ltr' | 'rtl';
  displayOrder: 'left-to-right' | 'right-to-left';
  segments: TextDirectionSegment[];
} {
  const isRTL = ['ar', 'he', 'ur'].includes(locale.slice(0, 2));
  const direction: 'ltr' | 'rtl' = isRTL ? 'rtl' : 'ltr';

  // Simple bidi: split by runs (very naive)
  // In production, use bidi-js or Intl.Segmenter
  const segments: TextDirectionSegment[] = [];
  let currentRun = '';
  let currentDir: 'ltr' | 'rtl' | 'neutral' = 'neutral';

  for (const char of text) {
    const charDir = getCharDirection(char);
    if (charDir === currentDir) {
      currentRun += char;
    } else {
      if (currentRun) segments.push({ text: currentRun, direction: currentDir });
      currentRun = char;
      currentDir = charDir;
    }
  }
  if (currentRun) segments.push({ text: currentRun, direction: currentDir });

  return {
    direction,
    displayOrder: direction === 'rtl' ? 'right-to-left' : 'left-to-right',
    segments,
  };
}

function getCharDirection(char: string): 'ltr' | 'rtl' | 'neutral' {
  const code = char.charCodeAt(0);
  // Hebrew: 0x0590–0x05FF, Arabic: 0x0600–0x06FF
  if (code >= 0x0590 && code <= 0x05FF) return 'rtl';
  if (code >= 0x0600 && code <= 0x06FF) return 'rtl';
  if (code >= 0xFE70 && code <= 0xFEFF) return 'rtl'; // Arabic presentation forms
  // Latin, numbers, space
  if (code >= 0x0000 && code <= 0x007F) return 'ltr';
  if (code >= 0x2000 && code <= 0x206F) return 'ltr'; // punctuation
  return 'neutral';
}

export function calculateTextBoundingBox(text: string, font: { fontSize: number; fontFamily: string }): { width: number; height: number } {
  // Approximation: monospace ~0.6 × em per char, em-size = fontSize
  const avgCharWidth = font.fontSize * 0.6;
  const width = text.length * avgCharWidth;
  const height = font.fontSize * 1.2; // line-height ~1.2em
  return { width, height };
}

export function isSameDay(ts1: number, ts2: number, timezone?: string): boolean {
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  if (timezone) {
    // toLocaleString date parts only
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timezone, day: 'numeric', month: 'numeric', year: 'numeric' });
    const p1 = fmt.format(d1);
    const p2 = fmt.format(d2);
    return p1 === p2;
  }
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}
