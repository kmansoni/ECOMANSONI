/**
 * Livestream domain types.
 *
 * Covers all entities for the LiveKit-based streaming subsystem:
 * sessions, guests, chat, donations, analytics, stream keys,
 * reactions, and viewer presence.
 *
 * All identifiers follow the Gateway API schema:
 *  - session IDs → number (PostgreSQL bigserial)
 *  - user / guest / key IDs → string (UUID)
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/** Lifecycle states of a live session. */
export type LivestreamStatus =
  | 'created'
  | 'scheduled'
  | 'live'
  | 'paused'
  | 'ended'
  | 'cancelled';

/** Ingest transport protocol. */
export type IngestProtocol = 'whip' | 'rtmp';

/** State machine for a guest slot in a co-streaming session. */
export type GuestStatus =
  | 'invited'
  | 'accepted'
  | 'declined'
  | 'joined'
  | 'left'
  | 'kicked';

/** Semantic type of a chat message. */
export type ChatMessageType =
  | 'text'
  | 'system'
  | 'pinned'
  | 'gift'
  | 'question';

/** Virtual gift asset types. */
export type GiftType =
  | 'heart'
  | 'star'
  | 'diamond'
  | 'rocket'
  | 'crown'
  | 'fire';

/** Emoji reaction types broadcasted via Supabase Realtime. */
export type ReactionType = '❤️' | '🔥' | '👏' | '😂' | '😮' | '🎉';

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

/** Minimal streamer profile embedded in session / guest records. */
export interface StreamerInfo {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  is_verified: boolean;
  followers_count: number;
}

/**
 * Full live session record as returned by the Gateway API.
 * Numeric `id` maps to PostgreSQL bigserial; all timestamps are ISO-8601.
 */
export interface LiveSession {
  id: number;
  user_id: string;
  title: string;
  description?: string;
  status: LivestreamStatus;
  category?: string;
  tags: string[];
  language: string;
  is_mature_content: boolean;
  max_viewers: number;
  current_viewers: number;
  total_viewers: number;
  scheduled_at?: string;
  actual_start_at?: string;
  actual_end_at?: string;
  replay_url?: string;
  replay_thumbnail_url?: string;
  is_replay_available: boolean;
  ingest_protocol: IngestProtocol;
  geo_restrictions: string[];
  livekit_room_name?: string;
  created_at: string;
  /** Populated via JOIN when fetching stream details. */
  streamer?: StreamerInfo;
}

/** A single guest slot in a co-streaming session. */
export interface LiveGuest {
  id: string;
  session_id: number;
  user_id: string;
  status: GuestStatus;
  slot_position?: number;
  invited_at: string;
  joined_at?: string;
  user?: StreamerInfo;
}

/** Chat message record. */
export interface LiveChatMessage {
  id: number;
  session_id: number;
  user_id: string;
  message: string;
  type: ChatMessageType;
  is_pinned: boolean;
  reply_to_id?: number;
  metadata?: Record<string, unknown>;
  created_at: string;
  user?: {
    username: string;
    display_name: string;
    avatar_url?: string;
  };
}

/** Virtual donation / gift sent by a viewer. */
export interface LiveDonation {
  id: string;
  session_id: number;
  user_id: string;
  amount: number;
  currency: string;
  gift_type: GiftType;
  message?: string;
  created_at: string;
  user?: { username: string; avatar_url?: string };
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

/** Post-stream and real-time analytics snapshot. */
export interface StreamAnalytics {
  peak_viewers: number;
  total_unique_viewers: number;
  total_chat_messages: number;
  total_reactions: number;
  total_donations_amount: number;
  total_donations_count: number;
  avg_watch_duration_sec: number;
  viewer_retention_curve: { minute: number; viewers: number }[];
  chat_activity_curve: { minute: number; messages: number }[];
  top_chatters: { user_id: string; username: string; count: number }[];
  device_breakdown: Record<string, number>;
  geo_breakdown: Record<string, number>;
  new_followers_during_stream: number;
  shares_count: number;
}

/** Lightweight real-time metrics polled during an active stream. */
export interface RealtimeAnalytics {
  viewers: number;
  chat_rate: number;
  reactions_rate: number;
}

// ---------------------------------------------------------------------------
// Stream keys
// ---------------------------------------------------------------------------

/**
 * RTMP/WHIP ingest key.
 * `stream_key` is masked (e.g. `sk_live_••••••••••••xxxx`) in list responses;
 * full value is only present on create / rotate responses.
 */
export interface StreamKey {
  id: string;
  name: string;
  stream_key: string;
  is_active: boolean;
  last_used_at?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// API payloads
// ---------------------------------------------------------------------------

/** Request body for POST /api/v1/streams. */
export interface CreateStreamPayload {
  title: string;
  description?: string;
  category?: string;
  tags?: string[];
  is_mature_content?: boolean;
  language?: string;
  geo_restrictions?: string[];
  scheduled_at?: string;
}

// ---------------------------------------------------------------------------
// Realtime / broadcast types
// ---------------------------------------------------------------------------

/** Ephemeral reaction event transmitted via Supabase Realtime Broadcast. */
export interface LiveReaction {
  /** Client-generated UUIDv4 for deduplication. */
  id: string;
  user_id: string;
  type: ReactionType;
  /** Unix timestamp in milliseconds. */
  timestamp: number;
}

/** Viewer presence record tracked via Supabase Presence. */
export interface ViewerPresence {
  user_id: string;
  username: string;
  avatar_url?: string;
  joined_at: string;
}

// ---------------------------------------------------------------------------
// Token responses
// ---------------------------------------------------------------------------

/** LiveKit connection token returned by the Gateway API. */
export interface LiveKitTokenResponse {
  token: string;
  ws_url: string;
}

/** LiveKit guest token includes slot assignment. */
export interface LiveKitGuestTokenResponse extends LiveKitTokenResponse {
  slot_position: number;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Generic paginated list response from the Gateway API. */
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

/** Query parameters for listing active streams. */
export interface ActiveStreamsParams {
  limit?: number;
  offset?: number;
  category?: string;
}
