/**
 * types.ts — TypeScript interfaces for all DB entities + Zod validation schemas.
 */

import { z } from 'zod';

// ── DB Entity Interfaces ───────────────────────────────────────────────────

export interface EditorProject {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'rendering' | 'completed' | 'error';
  aspect_ratio: '9:16' | '16:9' | '1:1' | '4:5' | '21:9';
  resolution_width: number;
  resolution_height: number;
  fps: number;
  duration_ms: number;
  settings: Record<string, unknown>;
  thumbnail_url: string | null;
  output_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface EditorTrack {
  id: string;
  project_id: string;
  type: 'video' | 'audio' | 'text' | 'sticker' | 'effect';
  name: string;
  sort_order: number;
  is_locked: boolean;
  is_visible: boolean;
  volume: number;
  opacity: number;
  blend_mode: string;
  created_at: string;
  updated_at: string;
}

export interface EditorClip {
  id: string;
  track_id: string;
  project_id: string;
  type: 'video' | 'audio' | 'image' | 'text' | 'sticker' | 'color';
  name: string;
  start_ms: number;
  duration_ms: number;
  source_url: string | null;
  source_start_ms: number;
  source_end_ms: number | null;
  volume: number;
  speed: number;
  speed_ramp: unknown | null;
  transform: Record<string, unknown>;
  crop: Record<string, unknown>;
  filters: unknown[];
  transition_in: Record<string, unknown> | null;
  transition_out: Record<string, unknown> | null;
  text_content: string | null;
  text_style: Record<string, unknown> | null;
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
  type: string;
  name: string;
  params: Record<string, unknown>;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface EditorKeyframe {
  id: string;
  clip_id: string;
  project_id: string;
  property: string;
  time_ms: number;
  value: unknown;
  easing: string;
  bezier_points: number[] | null;
  created_at: string;
  updated_at: string;
}

export interface EditorTemplate {
  id: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  thumbnail_url: string | null;
  preview_url: string | null;
  aspect_ratio: string;
  duration_ms: number;
  project_data: Record<string, unknown>;
  is_premium: boolean;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  album: string | null;
  genre: string | null;
  mood: string | null;
  bpm: number | null;
  duration_ms: number;
  url: string;
  waveform_url: string | null;
  thumbnail_url: string | null;
  is_premium: boolean;
  tags: string[];
  created_at: string;
}

export interface StickerPack {
  id: string;
  name: string;
  description: string | null;
  thumbnail_url: string | null;
  category: string;
  is_premium: boolean;
  item_count: number;
  created_at: string;
}

export interface StickerItem {
  id: string;
  pack_id: string;
  name: string;
  url: string;
  thumbnail_url: string | null;
  type: 'static' | 'animated';
  tags: string[];
  created_at: string;
}

export interface EditorAsset {
  id: string;
  user_id: string;
  project_id: string | null;
  type: 'video' | 'audio' | 'image' | 'font';
  name: string;
  url: string;
  thumbnail_url: string | null;
  size_bytes: number;
  duration_ms: number | null;
  width: number | null;
  height: number | null;
  mime_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RenderJob {
  id: string;
  project_id: string;
  user_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  output_url: string | null;
  error_message: string | null;
  settings: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RenderJobLog {
  id: string;
  job_id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data: Record<string, unknown> | null;
  created_at: string;
}

// ── Zod Validation Schemas ─────────────────────────────────────────────────

export const CreateProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  aspect_ratio: z.enum(['9:16', '16:9', '1:1', '4:5', '21:9']).optional().default('16:9'),
  resolution_width: z.number().int().min(320).max(7680).optional().default(1920),
  resolution_height: z.number().int().min(240).max(4320).optional().default(1080),
  fps: z.number().int().min(15).max(120).optional().default(30),
  settings: z.record(z.unknown()).optional().default({}),
});

export const UpdateProjectSchema = CreateProjectSchema.partial();

export const CreateTrackSchema = z.object({
  type: z.enum(['video', 'audio', 'text', 'sticker', 'effect']),
  name: z.string().min(1).max(100),
  sort_order: z.number().int().min(0).optional(),
  is_locked: z.boolean().optional().default(false),
  is_visible: z.boolean().optional().default(true),
  volume: z.number().min(0).max(2).optional().default(1),
  opacity: z.number().min(0).max(1).optional().default(1),
  blend_mode: z.string().max(50).optional().default('normal'),
});

export const UpdateTrackSchema = CreateTrackSchema.partial();

export const ReorderTracksSchema = z.array(
  z.object({
    id: z.string().uuid(),
    sort_order: z.number().int().min(0),
  }),
);

export const CreateClipSchema = z.object({
  track_id: z.string().uuid(),
  type: z.enum(['video', 'audio', 'image', 'text', 'sticker', 'color']),
  name: z.string().min(1).max(200).optional(),
  start_ms: z.number().int().min(0),
  duration_ms: z.number().int().min(1),
  source_url: z.string().url().optional().nullable(),
  source_start_ms: z.number().int().min(0).optional().default(0),
  source_end_ms: z.number().int().min(0).optional().nullable(),
  volume: z.number().min(0).max(2).optional().default(1),
  speed: z.number().min(0.1).max(10).optional().default(1),
  speed_ramp: z.unknown().optional().nullable(),
  transform: z.record(z.unknown()).optional().default({}),
  crop: z.record(z.unknown()).optional().default({}),
  filters: z.array(z.unknown()).optional().default([]),
  transition_in: z.record(z.unknown()).optional().nullable(),
  transition_out: z.record(z.unknown()).optional().nullable(),
  text_content: z.string().optional().nullable(),
  text_style: z.record(z.unknown()).optional().nullable(),
  sticker_id: z.string().uuid().optional().nullable(),
  sort_order: z.number().int().min(0).optional().default(0),
  is_reversed: z.boolean().optional().default(false),
});

export const UpdateClipSchema = CreateClipSchema.omit({ track_id: true }).partial();

export const SplitClipSchema = z.object({
  split_at_ms: z.number().int().min(1),
});

export const CreateEffectSchema = z.object({
  clip_id: z.string().uuid(),
  type: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
  params: z.record(z.unknown()).optional().default({}),
  sort_order: z.number().int().min(0).optional().default(0),
  enabled: z.boolean().optional().default(true),
});

export const UpdateEffectSchema = CreateEffectSchema.omit({ clip_id: true }).partial();

export const KeyframeItemSchema = z.object({
  id: z.string().uuid().optional(),
  clip_id: z.string().uuid(),
  property: z.string().min(1).max(100),
  time_ms: z.number().int().min(0),
  value: z.unknown(),
  easing: z.string().max(50).optional().default('linear'),
  bezier_points: z.array(z.number()).length(4).optional().nullable(),
});

export const BatchUpsertKeyframesSchema = z.object({
  keyframes: z.array(KeyframeItemSchema).min(1).max(500),
});

export const CreateRenderJobSchema = z.object({
  settings: z.object({
    format: z.enum(['mp4', 'webm', 'gif']).optional().default('mp4'),
    quality: z.enum(['low', 'medium', 'high', 'ultra']).optional().default('high'),
    resolution: z.enum(['720p', '1080p', '4k']).optional().default('1080p'),
  }).optional().default({}),
});

export const RegisterAssetSchema = z.object({
  project_id: z.string().uuid().optional().nullable(),
  type: z.enum(['video', 'audio', 'image', 'font']),
  name: z.string().min(1).max(200),
  url: z.string().url(),
  thumbnail_url: z.string().url().optional().nullable(),
  size_bytes: z.number().int().min(0),
  duration_ms: z.number().int().min(0).optional().nullable(),
  width: z.number().int().min(1).optional().nullable(),
  height: z.number().int().min(1).optional().nullable(),
  mime_type: z.string().min(1).max(100),
  metadata: z.record(z.unknown()).optional().default({}),
});

// ── Augmented types with nested results ───────────────────────────────────

export interface ClipWithEffectsAndKeyframes extends EditorClip {
  effects: EditorEffect[];
  keyframes: EditorKeyframe[];
}

export interface TrackWithClips extends EditorTrack {
  clips: ClipWithEffectsAndKeyframes[];
}

export interface ProjectTree {
  project: EditorProject;
  tracks: TrackWithClips[];
}

// ── Declare user on FastifyRequest ────────────────────────────────────────

import type { AuthPayload } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthPayload;
  }
}
