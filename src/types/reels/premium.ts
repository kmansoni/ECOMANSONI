/**
 * @file src/types/reels/premium.ts
 * @description Расширенные типы для премиум-функционала Reels:
 * реакции, музыка, эффекты, прогресс воспроизведения, упоминания, плейлисты.
 */

import type { ReelFeedItem } from '../reels';

// ---------------------------------------------------------------------------
// Reel Reaction (эмодзи-реакция на Reel)
// ---------------------------------------------------------------------------

/** Типы реакций для категоризации */
export type ReactionCategory = 'emoji' | 'quick_action' | 'expression';

export interface ReelReaction {
  /** UUID реакции */
  id: string;
  /** UUID Reel */
  reel_id: string;
  /** UUID пользователя, оставившего реакцию */
  user_id: string;
  /** Эмодзи-символ (Unicode) */
  emoji: string;
  /** Дата создания */
  created_at: string;
}

/** Агрегированный подсчёт реакций по эмодзи для одного Reel */
export interface ReactionCount {
  emoji: string;
  count: number;
  /** true если текущий пользователь поставил эту реакцию */
  has_reacted: boolean;
}

/** Мапа реакций: emoji → count */
export type ReactionsMap = Record<string, number>;

// ---------------------------------------------------------------------------
// Music Track (трек из музыкальной библиотеки)
// ---------------------------------------------------------------------------

export interface ReelMusicTrack {
  id: string;
  title: string;
  artist: string;
  /** Полный URL аудиофайла */
  audio_url: string;
  /** Длительность в секундах */
  duration_sec: number;
  /** Жанр (опционально) */
  genre?: string;
  /** URL обложки */
  thumbnail_url: string | null;
  /** Контент для взрослых */
  is_explicit: boolean;
  /** Активен ли трек (можно ли использовать) */
  is_active: boolean;
  /** Сколько раз использовался */
  play_count: number;
  created_at: string;
}

/** Минимальные данные трека для отображения в карточке */
export interface MusicTrackBrief {
  id: string;
  title: string;
  artist: string;
  duration_sec: number;
  thumbnail_url: string | null;
  is_explicit: boolean;
  is_active: boolean;
}

/** Категории / жанры музыки для каталога */
export interface MusicGenre {
  name: string;
  display_name: string;
  icon?: string;
}

// ---------------------------------------------------------------------------
// Reel Effect (применённый фильтр / эффект к Reel)
// ---------------------------------------------------------------------------

export type EffectType = 'filter' | 'speed' | 'transition' | 'text_overlay' | 'sticker' | 'beauty' | 'ar';

export interface ReelEffect {
  id: string;
  reel_id: string;
  effect_type: EffectType;
  effect_name: string;
  effect_config: Record<string, unknown>;
  /** Порядок в цепочке эффектов */
  position: number;
  created_at: string;
}

/** Пресет эффектов для быстрого применения */
export interface EffectPreset {
  name: string;
  display_name: string;
  effects: ReelEffect[];
  thumbnail_url?: string;
}

// ---------------------------------------------------------------------------
// Playback State (состояние воспроизведения для пользователя)
// ---------------------------------------------------------------------------

export interface ReelPlaybackState {
  reel_id: string;
  /** Последняя позиция воспроизведения в секундах */
  last_position_sec: number;
  /** Процент просмотра (0–1) */
  completion_rate: number;
  /** Сколько раз просмотрено */
  watch_count: number;
  /** Просмотрено до конца */
  completed: boolean;
  /** Когда последний раз смотрел */
  last_watched_at: string;
}

/** Состояние прогресса для UI прогресс-бара */
export interface PlaybackProgress {
  current_time: number;
  duration: number;
  percentage: number;
  buffered_percent: number;
  /** Список моментов, где пользователь ставил лайк/реакцию */
  reaction_markers: number[];
}

// ---------------------------------------------------------------------------
// Reel Mention (@username упоминание в описании)
// ---------------------------------------------------------------------------

export interface ReelMention {
  id: string;
  reel_id: string;
  mentioned_user_id: string;
  /** Символная позиция в описании */
  position: number;
  created_at: string;
  /** Данные упомянутого пользователя (денормализовано) */
  user?: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    verified: boolean;
  };
}

// ---------------------------------------------------------------------------
// Playlist / Коллекция Reels
// ---------------------------------------------------------------------------

export interface ReelPlaylist {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  /** Публичный ли плейлист */
  is_public: boolean;
  /** Количество Reel в плейлисте */
  reel_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReelPlaylistItem {
  id: string;
  playlist_id: string;
  reel_id: string;
  position: number;
  added_at: string;
  reel?: ReelFeedItem;
}

/** Создание / обновление плейлиста */
export interface PlaylistCreateInput {
  title: string;
  description?: string;
  cover_url?: string;
  is_public?: boolean;
}

// ---------------------------------------------------------------------------
// Сpeed Rate (скорость воспроизведения)
// ---------------------------------------------------------------------------

export type PlaybackSpeed = 0.25 | 0.5 | 0.75 | 1.0 | 1.25 | 1.5 | 1.75 | 2.0;

export const PLAYBACK_SPEEDS: Array<{ value: PlaybackSpeed; label: string }> = [
  { value: 0.25, label: '0.25×' },
  { value: 0.5, label: '0.5×' },
  { value: 0.75, label: '0.75×' },
  { value: 1.0, label: '1×' },
  { value: 1.25, label: '1.25×' },
  { value: 1.5, label: '1.5×' },
  { value: 1.75, label: '1.75×' },
  { value: 2.0, label: '2×' },
];

/** Доступные эмодзи-реакции (порядок = приоритет показа) */
export const DEFAULT_REACTION_EMOJIS = ['❤️', '🔥', '😂', '😮', '😢', '👏', '💯', '🙏', '🎉', '🤔'];

/** Контракт: данные из `get_reels_feed_v3` */
export interface ReelFeedItemV3 extends ReelFeedItem {
  music_artist?: string;
  music_id?: string;
  reactions?: ReactionsMap;
}