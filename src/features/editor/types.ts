/**
 * types.ts — Все TypeScript типы для видеоредактора.
 *
 * Зеркало серверных типов (editor-api/src/types.ts) с клиентскими расширениями.
 * Клиентские типы используют строго типизированные union-литералы вместо `string`,
 * а вложенные структуры (transform, crop, filters и т.д.) полностью описаны,
 * чтобы исключить `Record<string, unknown>` в runtime.
 */

// ── Enums / Union Types ────────────────────────────────────────────────────

export type ProjectStatus = 'draft' | 'rendering' | 'rendered' | 'published' | 'archived';
export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5' | '21:9';
export type TrackType = 'video' | 'audio' | 'text' | 'sticker' | 'effect';
export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'sticker' | 'transition' | 'effect';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
export type EffectType =
  | 'filter'
  | 'color_adjust'
  | 'blur'
  | 'chroma_key'
  | 'voice_effect'
  | 'noise_reduce'
  | 'speed_ramp'
  | 'stabilize'
  | 'ai_enhance';
export type EasingType = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 'bezier';

export type TemplateCategory =
  | 'trending'
  | 'business'
  | 'social'
  | 'education'
  | 'lifestyle'
  | 'music'
  | 'gaming'
  | 'holiday'
  | 'custom';

export type MusicGenre =
  | 'pop'
  | 'rock'
  | 'electronic'
  | 'hip_hop'
  | 'jazz'
  | 'classical'
  | 'ambient'
  | 'cinematic'
  | 'lofi'
  | 'other';

export type MusicMood =
  | 'happy'
  | 'sad'
  | 'energetic'
  | 'calm'
  | 'dramatic'
  | 'romantic'
  | 'dark'
  | 'neutral';

export type RenderStatus =
  | 'queued'
  | 'processing'
  | 'compositing'
  | 'encoding'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AssetType = 'video' | 'audio' | 'image' | 'font';
export type StickerFormat = 'static' | 'animated';

// ── Nested Value Objects ───────────────────────────────────────────────────

export interface ProjectSettings {
  background_color?: string;
  watermark_enabled?: boolean;
  [key: string]: unknown;
}

export interface ClipTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  anchor_x: number;
  anchor_y: number;
}

export interface ClipCrop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ClipFilter {
  type: string;
  params: Record<string, number | string | boolean>;
}

export interface TransitionConfig {
  type: string;
  duration_ms: number;
  params?: Record<string, number | string>;
}

export interface SpeedRampPoint {
  time_ms: number;
  speed: number;
}

export interface TextStyle {
  font_family: string;
  font_size: number;
  font_weight: number;
  color: string;
  background_color?: string;
  alignment: 'left' | 'center' | 'right';
  line_height: number;
  letter_spacing: number;
  shadow?: { x: number; y: number; blur: number; color: string };
  outline?: { width: number; color: string };
}

// ── DB Entity Interfaces (mirroring editor-api/src/types.ts) ──────────────

export interface EditorProject {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  aspect_ratio: AspectRatio;
  resolution_width: number;
  resolution_height: number;
  fps: number;
  duration_ms: number;
  settings: ProjectSettings;
  thumbnail_url: string | null;
  output_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EditorTrack {
  id: string;
  project_id: string;
  type: TrackType;
  name: string;
  sort_order: number;
  is_locked: boolean;
  is_visible: boolean;
  volume: number;
  opacity: number;
  blend_mode: BlendMode;
  created_at: string;
  updated_at: string;
}

export interface EditorClip {
  id: string;
  track_id: string;
  project_id: string;
  type: ClipType;
  name: string;
  start_ms: number;
  duration_ms: number;
  source_url: string | null;
  source_start_ms: number;
  source_end_ms: number | null;
  volume: number;
  speed: number;
  speed_ramp: SpeedRampPoint[] | null;
  transform: ClipTransform;
  crop: ClipCrop | null;
  filters: ClipFilter[];
  transition_in: TransitionConfig | null;
  transition_out: TransitionConfig | null;
  text_content: string | null;
  text_style: TextStyle | null;
  sticker_id: string | null;
  sort_order: number;
  is_reversed: boolean;
  created_at: string;
  updated_at: string;
}

export interface EditorEffect {
  id: string;
  clip_id: string;
  project_id: string;
  type: EffectType;
  name: string;
  params: Record<string, number | string | boolean>;
  enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EditorKeyframe {
  id: string;
  clip_id: string;
  project_id: string;
  property: string;
  time_ms: number;
  value: number;
  easing: EasingType;
  bezier_points: [number, number, number, number] | null;
  created_at: string;
  updated_at: string;
}

export interface EditorTemplate {
  id: string;
  title: string;
  description: string | null;
  category: TemplateCategory;
  thumbnail_url: string | null;
  preview_url: string | null;
  project_data: Record<string, unknown>;
  tags: string[];
  aspect_ratio: AspectRatio;
  duration_ms: number;
  use_count: number;
  is_premium: boolean;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  genre: MusicGenre | null;
  mood: MusicMood | null;
  bpm: number | null;
  duration_ms: number;
  file_url: string;
  waveform_url: string | null;
  preview_url: string | null;
  cover_url: string | null;
  license_type: string | null;
  is_premium: boolean;
  use_count: number;
  tags: string[];
  created_at: string;
}

export interface StickerPack {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  category: string;
  is_premium: boolean;
  item_count: number;
  created_at: string;
}

export interface StickerItem {
  id: string;
  pack_id: string;
  name: string;
  file_url: string;
  thumbnail_url: string | null;
  format: StickerFormat;
  width: number;
  height: number;
  duration_ms: number | null;
  tags: string[];
  sort_order: number;
}

export interface EditorAsset {
  id: string;
  user_id: string;
  project_id: string | null;
  type: AssetType;
  name: string;
  file_url: string;
  thumbnail_url: string | null;
  mime_type: string;
  file_size: number;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  waveform_data: number[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RenderJob {
  id: string;
  project_id: string;
  user_id: string;
  status: RenderStatus;
  priority: number;
  progress: number;
  output_format: string | null;
  output_codec: string | null;
  output_resolution: string | null;
  output_fps: number | null;
  output_bitrate: string | null;
  output_url: string | null;
  output_size: number | null;
  error_message: string | null;
  worker_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_duration_s: number | null;
  created_at: string;
  updated_at: string;
}

export interface RenderLogEvent {
  id: number;
  job_id: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// ── Client-Side Augmented Types (nested tree) ─────────────────────────────

export interface ClipWithDetails extends EditorClip {
  effects: EditorEffect[];
  keyframes: EditorKeyframe[];
}

export interface TrackWithClips extends EditorTrack {
  clips: ClipWithDetails[];
}

export interface ProjectTree extends EditorProject {
  tracks: TrackWithClips[];
}

// ── Input DTOs (create / update) ──────────────────────────────────────────

export interface CreateProjectInput {
  title: string;
  aspect_ratio?: AspectRatio;
  fps?: number;
  description?: string;
  resolution_width?: number;
  resolution_height?: number;
  settings?: ProjectSettings;
}

export interface UpdateProjectInput {
  title?: string;
  description?: string;
  aspect_ratio?: AspectRatio;
  fps?: number;
  resolution_width?: number;
  resolution_height?: number;
  settings?: ProjectSettings;
}

export interface CreateTrackInput {
  type: TrackType;
  name?: string;
  sort_order?: number;
}

export interface UpdateTrackInput {
  name?: string;
  is_locked?: boolean;
  is_visible?: boolean;
  volume?: number;
  opacity?: number;
  blend_mode?: BlendMode;
  sort_order?: number;
}

export interface CreateClipInput {
  track_id: string;
  type: ClipType;
  start_ms: number;
  duration_ms: number;
  source_url?: string;
  source_start_ms?: number;
  source_end_ms?: number;
  text_content?: string;
  text_style?: TextStyle;
  sticker_id?: string;
  name?: string;
}

export interface UpdateClipInput {
  start_ms?: number;
  duration_ms?: number;
  volume?: number;
  speed?: number;
  speed_ramp?: SpeedRampPoint[];
  transform?: Partial<ClipTransform>;
  crop?: ClipCrop;
  filters?: ClipFilter[];
  transition_in?: TransitionConfig | null;
  transition_out?: TransitionConfig | null;
  text_content?: string;
  text_style?: Partial<TextStyle>;
  is_reversed?: boolean;
  name?: string;
}

export interface CreateEffectInput {
  clip_id: string;
  type: EffectType;
  name?: string;
  params?: Record<string, number | string | boolean>;
}

export interface UpdateEffectInput {
  params?: Record<string, number | string | boolean>;
  enabled?: boolean;
  sort_order?: number;
  name?: string;
}

export interface KeyframeUpsertInput {
  id?: string;
  clip_id: string;
  property: string;
  time_ms: number;
  value: number;
  easing?: EasingType;
  bezier_points?: [number, number, number, number];
}

export interface StartRenderInput {
  output_format?: 'mp4' | 'webm' | 'mov' | 'gif';
  output_codec?: string;
  output_resolution?: string;
  output_fps?: number;
  output_bitrate?: string;
  priority?: number;
}

export interface RegisterAssetInput {
  type: AssetType;
  name: string;
  file_url: string;
  thumbnail_url?: string;
  mime_type: string;
  file_size: number;
  duration_ms?: number;
  width?: number;
  height?: number;
  project_id?: string;
  metadata?: Record<string, unknown>;
}

// ── Pagination ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// ── Reorder DTO ───────────────────────────────────────────────────────────

export interface ReorderItem {
  id: string;
  sort_order: number;
}

// ── API Error ─────────────────────────────────────────────────────────────

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
