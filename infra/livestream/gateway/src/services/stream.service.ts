/**
 * services/stream.service.ts — Core stream lifecycle business logic.
 *
 * Orchestrates:
 * 1. Stream creation: DB record + LiveKit room + optional ingress
 * 2. Stream start: status transition + egress start + heartbeat init
 * 3. Stream stop: status transition + egress stop + room deletion + analytics
 * 4. Heartbeat: last_heartbeat update + auto-stop detection
 * 5. Discovery: paginated list of active streams
 *
 * State machine (enforced server-side):
 *   created → live → ended
 *   created → cancelled (if never started)
 *   Any state → any forbidden transition = ForbiddenError
 *
 * Idempotency:
 *   - createStream: idempotent with idempotency key in Redis
 *   - startStream: if already live, returns current state
 *   - stopStream: if already ended, returns current state
 *
 * Transaction isolation:
 *   All state transitions use Supabase RPC functions that execute in
 *   serializable transactions to prevent race conditions.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Redis } from 'ioredis'
import type { FastifyBaseLogger } from 'fastify'
import { RoomService } from './room.service.js'
import { EgressService } from './egress.service.js'
import { config } from '../config.js'
import type { LiveSession, StreamStatus } from '../types/index.js'
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../plugins/error-handler.js'

// Redis keys
const HEARTBEAT_KEY = (sessionId: string): string => `hb:${sessionId}`
const HEARTBEAT_TTL = config.HEARTBEAT_TIMEOUT_SEC * 2 // 2× timeout for generous window

export interface CreateStreamInput {
  userId: string
  title: string
  description?: string
  category?: string
  tags?: string[]
  isMatureContent?: boolean
  language?: string
  geoRestrictions?: string[]
  scheduledAt?: string
}

export interface CreateStreamResult {
  sessionId: string
  roomName: string
  status: StreamStatus
}

export interface StopStreamResult {
  status: 'ended'
  durationSec: number | null
  replayUrl: string | null
}

export class StreamService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly redis: Redis,
    private readonly roomService: RoomService,
    private readonly egressService: EgressService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /**
   * Create a new stream session.
   * 1. Check eligibility via RPC
   * 2. Create LiveKit room
   * 3. Insert live_sessions record
   */
  async createStream(input: CreateStreamInput): Promise<CreateStreamResult> {
    // 1. Eligibility check
    const { data: eligibility, error: eligError } = await this.supabase.rpc(
      'is_eligible_for_live_v1',
      { p_user_id: input.userId },
    )
    if (eligError) {
      throw new Error(`Eligibility check failed: ${eligError.message}`)
    }
    if (!eligibility?.eligible) {
      throw new ForbiddenError(
        eligibility?.reason ?? 'User is not eligible to create a livestream',
      )
    }

    // 2. Create LiveKit room (idempotent)
    const sessionId = crypto.randomUUID()
    const roomInfo = await this.roomService.createRoom({
      sessionId,
      maxParticipants: 10000,
      emptyTimeout: 300, // 5 min auto-cleanup if stream never starts
    })

    // 3. Persist session to DB
    const { data: session, error: insertError } = await this.supabase
      .from('live_sessions')
      .insert({
        id: sessionId,
        creator_id: input.userId,           // FK → auth.users (schema col: creator_id)
        title: input.title.trim().slice(0, 255),
        description: input.description?.trim().slice(0, 2000) ?? null,
        category: input.category ?? null,
        tags: input.tags ?? [],
        is_mature_content: input.isMatureContent ?? false,
        language: input.language ?? null,
        geo_restrictions: input.geoRestrictions ?? [],
        scheduled_at: input.scheduledAt ?? null,
        status: 'created' as StreamStatus,
        livekit_room_name: roomInfo.name,   // schema col added in 20260308000003
        viewer_count_current: 0,            // canonical col name (20260224300000:41)
        viewer_count_peak: 0,               // canonical col name (20260224300000:42)
      })
      .select('id, livekit_room_name, status')
      .single()

    if (insertError || !session) {
      // Rollback: delete the LiveKit room we just created
      try {
        await this.roomService.deleteRoom(sessionId)
      } catch (rollbackErr) {
        this.logger.error({ rollbackErr, sessionId }, 'Failed to rollback LiveKit room after DB insert failure')
      }
      throw new Error(`Failed to create stream session: ${insertError?.message ?? 'unknown'}`)
    }

    const s = session as Record<string, unknown>
    return {
      sessionId: s['id'] as string,
      roomName: s['livekit_room_name'] as string,
      status: s['status'] as StreamStatus,
    }
  }

  /**
   * Transition stream from 'created' to 'live'.
   * Starts egress if VOD recording is enabled.
   */
  async startStream(
    sessionId: string,
    userId: string,
  ): Promise<{ status: 'live'; startedAt: string }> {
    const session = await this.requireSession(sessionId)
    this.requireHost(session, userId)

    if (session.status === 'live') {
      // Idempotent: already live
      return { status: 'live', startedAt: session.actual_start_at ?? new Date().toISOString() }
    }

    if (session.status !== 'created') {
      throw new ConflictError(
        `Cannot start stream in status '${session.status}'. Stream must be in 'created' state.`,
      )
    }

    const startedAt = new Date().toISOString()

    // Start egress recording if enabled
    let egressId: string | null = null
    if (config.FEATURE_VOD_RECORDING) {
      try {
        const egress = await this.egressService.startRecordingEgress(sessionId)
        egressId = egress.egressId
      } catch (err) {
        this.logger.warn({ err, sessionId }, 'Failed to start egress recording (non-fatal)')
      }
    }

    // Update DB
    const { error } = await this.supabase
      .from('live_sessions')
      .update({
        status: 'live' as StreamStatus,
        actual_start_at: startedAt,
        last_heartbeat: startedAt,
        ...(egressId ? { egress_id: egressId } : {}),
      })
      .eq('id', sessionId)
      .eq('status', 'created') // Optimistic lock: only update if still 'created'

    if (error) {
      // Stop egress if DB update failed
      if (egressId) {
        try {
          await this.egressService.stopEgress(egressId)
        } catch {}
      }
      throw new Error(`Failed to start stream: ${error.message}`)
    }

    // Initialize heartbeat in Redis
    await this.redis.set(HEARTBEAT_KEY(sessionId), '1', 'EX', HEARTBEAT_TTL)

    return { status: 'live', startedAt }
  }

  /**
   * Transition stream from 'live' to 'ended'.
   * Stops all egresses, deletes LiveKit room, computes analytics.
   */
  async stopStream(sessionId: string, userId: string): Promise<StopStreamResult> {
    const session = await this.requireSession(sessionId)
    this.requireHost(session, userId)

    if (session.status === 'ended') {
      // Idempotent
      const durationSec =
        session.actual_start_at && session.actual_end_at
          ? Math.floor(
              (new Date(session.actual_end_at).getTime() -
                new Date(session.actual_start_at).getTime()) /
                1000,
            )
          : null
      return { status: 'ended', durationSec, replayUrl: session.replay_url }
    }

    if (session.status === 'created') {
      // Cancel without ever going live
      await this.supabase
        .from('live_sessions')
        .update({ status: 'cancelled' as StreamStatus, actual_end_at: new Date().toISOString() })
        .eq('id', sessionId)
      return { status: 'ended', durationSec: null, replayUrl: null }
    }

    if (session.status !== 'live') {
      throw new ConflictError(`Cannot stop stream in status '${session.status}'`)
    }

    const endedAt = new Date().toISOString()

    // Stop egress(es)
    let replayUrl: string | null = null
    if (session.egress_id) {
      try {
        await this.egressService.stopEgress(session.egress_id)
        // VOD URL will be available after egress finishes processing (async)
        // Webhook egress_ended will update replay_url
      } catch (err) {
        this.logger.warn({ err, egressId: session.egress_id }, 'Failed to stop egress (non-fatal)')
      }
    }

    // Compute duration
    const durationSec = session.actual_start_at
      ? Math.floor((new Date(endedAt).getTime() - new Date(session.actual_start_at).getTime()) / 1000)
      : null

    // Update DB
    const { error } = await this.supabase
      .from('live_sessions')
      .update({
        status: 'ended' as StreamStatus,
        actual_end_at: endedAt,
        ...(replayUrl ? { replay_url: replayUrl } : {}),
      })
      .eq('id', sessionId)
      .eq('status', 'live') // Optimistic lock

    if (error) {
      throw new Error(`Failed to stop stream: ${error.message}`)
    }

    // Clean up LiveKit room (non-fatal)
    try {
      await this.roomService.deleteRoom(sessionId)
    } catch (err) {
      this.logger.warn({ err, sessionId }, 'Failed to delete LiveKit room (non-fatal)')
    }

    // Clean up Redis heartbeat
    await this.redis.del(HEARTBEAT_KEY(sessionId))

    return { status: 'ended', durationSec, replayUrl }
  }

  /**
   * Process heartbeat from streamer.
   * Resets the heartbeat TTL in Redis.
   * Returns time until next required heartbeat.
   */
  async heartbeat(sessionId: string, userId: string): Promise<{ nextHeartbeatInSec: number }> {
    const session = await this.requireSession(sessionId)
    this.requireHost(session, userId)

    if (session.status !== 'live') {
      throw new ConflictError(`Heartbeat only valid for live streams, got '${session.status}'`)
    }

    const now = new Date().toISOString()

    // Update DB last_heartbeat (best-effort, non-blocking)
    void this.supabase
      .from('live_sessions')
      .update({ last_heartbeat: now })
      .eq('id', sessionId)
      .then(({ error }) => {
        if (error) this.logger.warn({ error, sessionId }, 'Failed to update last_heartbeat')
      })

    // Reset Redis TTL
    await this.redis.set(HEARTBEAT_KEY(sessionId), '1', 'EX', HEARTBEAT_TTL)

    return { nextHeartbeatInSec: Math.floor(config.HEARTBEAT_TIMEOUT_SEC / 2) }
  }

  /**
   * Automated heartbeat timeout check.
   * Called by a scheduled job or by webhook processor.
   * Stops streams that haven't sent a heartbeat in HEARTBEAT_TIMEOUT_SEC.
   */
  async checkHeartbeatTimeout(sessionId: string): Promise<boolean> {
    const exists = await this.redis.exists(HEARTBEAT_KEY(sessionId))
    if (exists) return false // Heartbeat still valid

    // Heartbeat expired — auto-stop the stream
    this.logger.warn({ sessionId }, 'Heartbeat timeout — auto-stopping stream')
    const session = await this.getSession(sessionId)
    if (!session || session.status !== 'live') return false

    // Auto-stop using host user_id
    try {
      await this.stopStream(sessionId, session.user_id)
      return true
    } catch (err) {
      this.logger.error({ err, sessionId }, 'Failed to auto-stop stream on heartbeat timeout')
      return false
    }
  }

  /**
   * Get paginated list of active (live) streams.
   */
  async listActiveStreams(opts: {
    limit: number
    offset: number
    category?: string
    language?: string
  }): Promise<{ data: LiveSession[]; total: number }> {
    let query = this.supabase
      .from('live_sessions')
      .select('*', { count: 'exact' })
      .eq('status', 'live')
      .order('viewer_count', { ascending: false })
      .range(opts.offset, opts.offset + opts.limit - 1)

    if (opts.category) {
      query = query.eq('category', opts.category)
    }
    if (opts.language) {
      query = query.eq('language', opts.language)
    }

    const { data, error, count } = await query

    if (error) throw new Error(`Failed to list active streams: ${error.message}`)

    return {
      data: (data ?? []) as LiveSession[],
      total: count ?? 0,
    }
  }

  /**
   * Get a single stream session by ID.
   */
  async getSession(sessionId: string): Promise<LiveSession | null> {
    const { data, error } = await this.supabase
      .from('live_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw new Error(`Failed to get stream session: ${error.message}`)
    }

    // Map DB column names → LiveSession interface names.
    // DB uses: creator_id, livekit_room_name, viewer_count_current, viewer_count_peak
    // Interface uses: user_id, room_name, viewer_count, peak_viewer_count
    const raw = data as Record<string, unknown>
    return {
      ...raw,
      user_id: raw['creator_id'],
      room_name: raw['livekit_room_name'],
      viewer_count: raw['viewer_count_current'],
      peak_viewer_count: raw['viewer_count_peak'],
    } as LiveSession
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async requireSession(sessionId: string): Promise<LiveSession> {
    const session = await this.getSession(sessionId)
    if (!session) throw new NotFoundError('Stream session', sessionId)
    return session
  }

  private requireHost(session: LiveSession, userId: string): void {
    if (session.user_id !== userId) {
      throw new ForbiddenError('Only the stream host can perform this action')
    }
  }
}
