/**
 * types/index.ts — Shared TypeScript types for the gateway.
 */

import type { FastifyRequest } from 'fastify'

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Decoded Supabase JWT payload (subset relevant to the gateway) */
export interface SupabaseJwtPayload {
  sub: string          // user UUID
  email?: string
  role: string         // 'authenticated' | 'anon' | 'service_role'
  aud: string          // 'authenticated'
  exp: number          // Unix timestamp
  iat: number
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
}

/** Authenticated user attached to request after JWT validation */
export interface AuthUser {
  id: string           // UUID
  email?: string
  role: string
}

// FastifyRequest augmentation — set by auth plugin
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser
    correlationId: string
  }
}

// ── Stream ────────────────────────────────────────────────────────────────────

export type StreamStatus = 'created' | 'live' | 'ended' | 'cancelled'

export interface LiveSession {
  id: string
  user_id: string
  title: string
  description: string | null
  category: string | null
  tags: string[]
  is_mature_content: boolean
  language: string | null
  geo_restrictions: string[]
  status: StreamStatus
  room_name: string
  scheduled_at: string | null
  actual_start_at: string | null
  actual_end_at: string | null
  last_heartbeat: string | null
  viewer_count: number
  peak_viewer_count: number
  replay_url: string | null
  hls_url: string | null
  thumbnail_url: string | null
  egress_id: string | null
  ingress_id: string | null
  created_at: string
  updated_at: string
}

export interface LiveViewer {
  id: string
  session_id: string
  user_id: string
  joined_at: string
  left_at: string | null
  duration_sec: number | null
}

// ── Guests ────────────────────────────────────────────────────────────────────

export type GuestStatus = 'invited' | 'accepted' | 'declined' | 'kicked' | 'left'

export interface LiveGuest {
  id: string
  session_id: string
  host_user_id: string
  guest_user_id: string
  status: GuestStatus
  slot_position: number | null
  invited_at: string
  accepted_at: string | null
  left_at: string | null
}

// ── Stream Keys ───────────────────────────────────────────────────────────────

export interface StreamKey {
  id: string
  user_id: string
  key_value: string    // never exposed in list responses — only on create/rotate
  label: string | null
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

// ── Moderation ────────────────────────────────────────────────────────────────

export type ModeratorPermission = 'ban_user' | 'delete_message' | 'pin_message' | 'all'

export interface ChatBan {
  id: string
  session_id: string
  banned_user_id: string
  banned_by: string
  reason: string | null
  expires_at: string | null
  created_at: string
}

export interface ChatModerator {
  id: string
  session_id: string
  user_id: string
  assigned_by: string
  permissions: ModeratorPermission[]
  created_at: string
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface StreamAnalytics {
  session_id: string
  total_viewers: number
  unique_viewers: number
  peak_concurrent_viewers: number
  average_watch_time_sec: number
  total_watch_time_sec: number
  total_chat_messages: number
  total_reactions: number
  total_donations: number
  duration_sec: number | null
}

export interface RealtimeMetrics {
  session_id: string
  current_viewers: number
  chat_messages_per_minute: number
  reactions_per_minute: number
  is_live: boolean
  started_at: string | null
  elapsed_sec: number
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginationQuery {
  limit?: number
  offset?: number
}

// ── RFC 7807 Problem Details ──────────────────────────────────────────────────

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  instance?: string
  correlationId?: string
}

// ── Request helpers ───────────────────────────────────────────────────────────

/** Typed FastifyRequest for authenticated endpoints */
export type AuthenticatedRequest<
  TBody = unknown,
  TParams = unknown,
  TQuerystring = unknown,
> = FastifyRequest<{
  Body: TBody
  Params: TParams
  Querystring: TQuerystring
}> & { user: AuthUser }
