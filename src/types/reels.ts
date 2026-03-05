/**
 * @file src/types/reels.ts
 * @description Типы данных для модуля Reels.
 *
 * Источники правды:
 *  - `src/integrations/supabase/types.ts` — таблица `reels`
 *  - `docs/contracts/schemas/reels-feed-page.v1.schema.json` — контракт фида
 *  - `docs/contracts/schemas/create-reel-intent.v1.schema.json` — контракт создания
 *  - `src/hooks/useReels.tsx` — структура данных фида (`get_reels_feed_v2`)
 */

import type { Database } from '@/integrations/supabase/types';

// ---------------------------------------------------------------------------
// Базовый тип из Supabase (raw DB row)
// ---------------------------------------------------------------------------

/**
 * Строка таблицы `reels` из базы данных Supabase.
 * Используется для low-level операций и маппинга данных.
 */
export type ReelRow = Database['public']['Tables']['reels']['Row'];

// ---------------------------------------------------------------------------
// Автор
// ---------------------------------------------------------------------------

/**
 * Профиль автора Reel для отображения в overlay карточки.
 * Не содержит приватных полей; только публичные данные + состояние подписки.
 */
export interface ReelAuthor {
  /** UUID пользователя */
  id: string;
  /** Уникальный логин (@username) */
  username: string;
  /** Отображаемое имя */
  display_name: string;
  /** URL аватара или null */
  avatar_url: string | null;
  /** Верифицированный аккаунт */
  is_verified: boolean;
  /** true если текущий аутентифицированный пользователь подписан на автора */
  is_following: boolean;
}

// ---------------------------------------------------------------------------
// Метрики
// ---------------------------------------------------------------------------

/**
 * Счётчики взаимодействий с Reel.
 * Все поля — неотрицательные целые числа (0 по умолчанию cuando null в БД).
 */
export interface ReelMetrics {
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saves_count: number;
  views_count: number;
  reposts_count: number;
}

// ---------------------------------------------------------------------------
// Элемент фида
// ---------------------------------------------------------------------------

/**
 * Reel в контексте фида: объединяет данные таблицы `reels`,
 * денормализованные данные автора, метрики и состояние взаимодействия
 * текущего пользователя.
 *
 * Соответствует контракту `mansoni://contracts/reels-feed-page.v1`.
 */
export interface ReelFeedItem {
  /** UUID Reel */
  id: string;
  /** Абсолютный URL на видео (нормализован через `normalizeReelMediaUrl`) */
  video_url: string;
  /** Превью-кадр или null */
  thumbnail_url: string | null;
  /** Описание/подпись к Reel */
  description: string | null;
  /** Название трека */
  music_title: string | null;
  /** Исполнитель трека */
  music_artist: string | null;
  /** Длительность видео в секундах */
  duration_seconds: number;
  /** Автор Reel (денормализовано для отображения без JOIN в клиенте) */
  author: ReelAuthor;
  /** Счётчики взаимодействий */
  metrics: ReelMetrics;
  /** Массив хэш-тегов без символа `#` */
  hashtags: string[];
  /** ISO 8601 timestamp создания */
  created_at: string;

  // -- Состояние взаимодействия текущего пользователя --

  /** Текущий пользователь поставил лайк */
  is_liked: boolean;
  /** Текущий пользователь сохранил в закладки */
  is_saved: boolean;
  /** Текущий пользователь сделал репост */
  is_reposted: boolean;

  // -- Ранжирование (аналитика и объяснимость алгоритма) --

  /** Позиция в фиде начиная с 0 (для аналитики показов) */
  feed_position: number;
  /**
   * Человекочитаемая причина рекомендации
   * (напр. "trending_in_your_area", "followed_author").
   */
  recommendation_reason?: string;
  /** Итоговый скор ранжирования из движка рекомендаций */
  final_score?: number;
}

// ---------------------------------------------------------------------------
// Страница фида (пагинация курсором)
// ---------------------------------------------------------------------------

/**
 * Режим работы алгоритма фида.
 * - `feed.page_ok` — штатный персонализированный фид
 * - `fallback_recency` — резервный режим по дате публикации
 * - `fallback_no_freqcap` — без ограничения частоты показа
 */
export type ReelFeedMode =
  | 'feed.page_ok'
  | 'fallback_recency'
  | 'fallback_no_freqcap';

/**
 * Одна страница фида Reels.
 * Соответствует контракту `mansoni://contracts/reels-feed-page.v1`.
 */
export interface ReelFeedPage {
  /** Элементы страницы */
  items: ReelFeedItem[];
  /** Курсор следующей страницы или null если данных больше нет */
  next_cursor: string | null;
  /** Есть ли следующая страница */
  has_more: boolean;
  /** Идентификатор запроса для трассировки */
  request_id: string;
  /** Версия алгоритма ранжирования */
  algorithm_version: string;
  /** Режим алгоритма фида */
  mode: ReelFeedMode;
}

// ---------------------------------------------------------------------------
// UI-утилитарные типы
// ---------------------------------------------------------------------------

/**
 * Координаты тапа на экране относительно контейнера видео.
 * Используется для анимации «летящего сердца» при двойном тапе.
 */
export interface TapPosition {
  /** Горизонтальная координата в пикселях */
  x: number;
  /** Вертикальная координата в пикселях */
  y: number;
}

/**
 * Состояние буферизации HTML5 видео-элемента.
 * Используется для отображения spinner и прогресс-буферизации.
 */
export interface BufferState {
  /** Идёт ли буферизация в данный момент */
  isBuffering: boolean;
  /** Процент загруженного буфера [0, 100] */
  bufferedPercent: number;
  /** Текущая позиция воспроизведения в секундах */
  currentTime: number;
  /** Общая длительность видео в секундах */
  duration: number;
}

/**
 * Уровень видимости Reel.
 * - `public` — виден всем
 * - `followers` — виден только подписчикам
 * - `private` — виден только автору
 *
 * Примечание: контракт `create-reel-intent.v1` допускает только `"public"` при публикации.
 */
export type ReelVisibility = 'public' | 'followers' | 'private';

/**
 * Цель шаринга Reel в личном сообщении или группе.
 */
export interface ShareTarget {
  /** Тип получателя */
  type: 'user' | 'group' | 'channel';
  /** UUID получателя */
  id: string;
  /** Отображаемое имя */
  name: string;
  /** URL аватара или null */
  avatar_url: string | null;
}
