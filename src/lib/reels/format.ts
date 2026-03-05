/**
 * @file src/lib/reels/format.ts
 * @description Утилиты форматирования для UI модуля Reels.
 *
 * Все функции — чистые (pure), детерминированные, без побочных эффектов.
 * Не зависят от контекста React или Supabase.
 */

// ---------------------------------------------------------------------------
// Константы
// ---------------------------------------------------------------------------

/** Максимальная длина описания перед усечением (по умолчанию) */
const DEFAULT_MAX_DESCRIPTION_LENGTH = 125;

/**
 * SVG data-URI placeholder используемый как thumbnail до загрузки реального.
 * Градиент от серого к тёмному, нейтральный для любой темы.
 */
const PLACEHOLDER_THUMBNAIL_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='360' height='640' viewBox='0 0 360 640'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop offset='0%25' stop-color='%23111'/%3E%3Cstop offset='100%25' stop-color='%23333'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='360' height='640' fill='url(%23g)'/%3E%3C/svg%3E";

// ---------------------------------------------------------------------------
// formatCount
// ---------------------------------------------------------------------------

/**
 * Форматирует целое число для отображения в UI счётчиков (лайки, просмотры...).
 *
 * Правила:
 * - `< 1 000` → выводится как есть (`"999"`)
 * - `>= 1 000` и `< 1 000 000` → один десятичный знак + суффикс K (`"1.2K"`)
 * - `>= 1 000 000` → один десятичный знак + суффикс M (`"1.2M"`)
 * - Незначащий нуль после точки убирается (`"1.0K"` → `"1K"`)
 * - Отрицательные значения и NaN → `"0"`
 *
 * @param count - Число для форматирования
 * @returns Строка для отображения в UI
 *
 * @example
 * formatCount(0)        // "0"
 * formatCount(999)      // "999"
 * formatCount(1000)     // "1K"
 * formatCount(1234)     // "1.2K"
 * formatCount(1234567)  // "1.2M"
 */
export function formatCount(count: number): string {
  if (!Number.isFinite(count) || count < 0) return '0';

  if (count < 1_000) {
    return String(Math.floor(count));
  }

  if (count < 1_000_000) {
    const value = count / 1_000;
    const formatted = value.toFixed(1);
    // Убираем незначащий нуль: "1.0" → "1"
    return (formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted) + 'K';
  }

  const value = count / 1_000_000;
  const formatted = value.toFixed(1);
  return (formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted) + 'M';
}

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

/**
 * Форматирует длительность видео в секундах в строку `MM:SS` или `H:MM:SS`.
 *
 * Правила:
 * - `< 3600` → `"M:SS"` (однозначные минуты без ведущего нуля, секунды — всегда двузначные)
 * - `>= 3600` → `"H:MM:SS"`
 * - Отрицательные значения и NaN → `"0:00"`
 *
 * @param seconds - Длительность в секундах (целое или дробное)
 * @returns Строка длительности для отображения в UI
 *
 * @example
 * formatDuration(0)     // "0:00"
 * formatDuration(59)    // "0:59"
 * formatDuration(65)    // "1:05"
 * formatDuration(3600)  // "1:00:00"
 * formatDuration(3661)  // "1:01:01"
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3_600);
  const m = Math.floor((totalSeconds % 3_600) / 60);
  const s = totalSeconds % 60;

  const ss = String(s).padStart(2, '0');

  if (h > 0) {
    const mm = String(m).padStart(2, '0');
    return `${h}:${mm}:${ss}`;
  }

  return `${m}:${ss}`;
}

// ---------------------------------------------------------------------------
// truncateDescription
// ---------------------------------------------------------------------------

/**
 * Результат усечения текста описания.
 */
export interface TruncateResult {
  /** Текст (усечённый или полный) */
  text: string;
  /** `true` если текст был усечён и показана кнопка "ещё" */
  isTruncated: boolean;
}

/**
 * Усекает текст описания Reel для collapsed-режима overlay.
 *
 * Алгоритм:
 * 1. Если `text.length <= maxLength` — возвращает исходный текст без изменений.
 * 2. Иначе усекает по границе слова (не разрывает слова посередине) и добавляет `"…"`.
 * 3. Если разрыв не найден (одно очень длинное слово) — жёсткое усечение по `maxLength`.
 *
 * @param text - Исходный текст описания
 * @param maxLength - Максимальное число символов до усечения (по умолчанию 125)
 * @returns `{ text, isTruncated }`
 *
 * @example
 * truncateDescription("Hello world", 5)
 * // { text: "Hello…", isTruncated: true }
 *
 * truncateDescription("Short", 100)
 * // { text: "Short", isTruncated: false }
 */
export function truncateDescription(
  text: string,
  maxLength: number = DEFAULT_MAX_DESCRIPTION_LENGTH,
): TruncateResult {
  if (typeof text !== 'string') {
    return { text: '', isTruncated: false };
  }

  if (text.length <= maxLength) {
    return { text, isTruncated: false };
  }

  // Ищем последний пробел перед maxLength чтобы не резать слово
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');

  const truncated = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;

  return {
    text: truncated + '…',
    isTruncated: true,
  };
}

// ---------------------------------------------------------------------------
// getPlaceholderThumbnail
// ---------------------------------------------------------------------------

/**
 * Возвращает data-URI SVG-заглушки для thumbnail Reel.
 *
 * Используется как `src` для `<img>` пока реальный thumbnail не загружен,
 * а также как fallback при ошибке загрузки.
 *
 * Возвращает строку-константу — новый объект не создаётся при каждом вызове.
 *
 * @returns data-URI строка SVG-placeholder
 */
export function getPlaceholderThumbnail(): string {
  return PLACEHOLDER_THUMBNAIL_DATA_URI;
}

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------

/**
 * Форматирует ISO-дату в относительное время для отображения в комментариях.
 *
 * Правила:
 * - `< 1 минуты` → `"сейчас"`
 * - `< 60 минут` → `"Xм"`
 * - `< 24 часов` → `"Xч"`
 * - `< 7 дней` → `"Xд"`
 * - `< 30 дней` → `"Xн"` (недели)
 * - `>= 30 дней` → локализованная дата (`"5 мар"`)
 *
 * Чистая функция: детерминирована при фиксированном `Date.now()`.
 * Отрицательный diff (будущие даты) → `"сейчас"`.
 *
 * @param dateString - ISO 8601 строка даты
 * @returns Строка относительного времени для UI
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 30000).toISOString()) // "сейчас"
 * formatRelativeTime(new Date(Date.now() - 120000).toISOString()) // "2м"
 * formatRelativeTime(new Date(Date.now() - 7200000).toISOString()) // "2ч"
 */
export function formatRelativeTime(dateString: string): string {
  const now = Date.now();
  const date = new Date(dateString).getTime();
  const diff = now - date;

  if (diff < 0) return 'сейчас';

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return 'сейчас';
  if (minutes < 60) return `${minutes}м`;
  if (hours < 24) return `${hours}ч`;
  if (days < 7) return `${days}д`;
  if (days < 30) return `${Math.floor(days / 7)}н`;

  return new Date(dateString).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}
