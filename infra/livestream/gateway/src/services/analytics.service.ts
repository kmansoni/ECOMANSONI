/**
 * services/analytics.service.ts — Stream analytics computation.
 *
 * Analytics are computed from:
 * - live_viewers table: unique viewers, watch time
 * - live_chat_messages: chat volume
 * - live_sessions: peak viewers, duration
 * - Redis: real-time viewer count
 *
 * Two modes:
 *  1. Historical analytics: post-stream computed stats (for ended streams)
 *  2. Real-time metrics: live viewer count, chat rate (for live streams)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Redis } from 'ioredis'
import type { StreamAnalytics, RealtimeMetrics } from '../types/index.js'
import { NotFoundError, ForbiddenError } from '../plugins/error-handler.js'

// Redis key for chat message rate tracking (sliding window counter)
const CHAT_RATE_KEY = (sessionId: string): string => `chat_rate:${sessionId}`
// Redis key for reaction rate tracking
const REACTION_RATE_KEY = (sessionId: string): string => `reaction_rate:${sessionId}`

export class AnalyticsService {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly redis: Redis,
  ) {}

  /**
   * Get full analytics for a session.
   * Only the host can access analytics (business data, not public).
   */
  async getStreamAnalytics(
    sessionId: string,
    requestingUserId: string,
  ): Promise<StreamAnalytics> {
    // Verify host
    const { data: session, error: sessionErr } = await this.supabase
      .from('live_sessions')
      .select('user_id, actual_start_at, actual_end_at, peak_viewer_count')
      .eq('id', sessionId)
      .single()

    if (sessionErr || !session) throw new NotFoundError('Stream session', sessionId)
    if (session.user_id !== requestingUserId) {
      throw new ForbiddenError('Only the stream host can view analytics')
    }

    // Unique viewers count
    const { count: uniqueViewers } = await this.supabase
      .from('live_viewers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)

    // Total watch time
    const { data: viewerRows } = await this.supabase
      .from('live_viewers')
      .select('duration_sec')
      .eq('session_id', sessionId)
      .not('duration_sec', 'is', null)

    const totalWatchTimeSec = (viewerRows ?? []).reduce(
      (sum, row) => sum + (row.duration_sec as number),
      0,
    )
    const avgWatchTimeSec =
      (uniqueViewers ?? 0) > 0 ? Math.floor(totalWatchTimeSec / (uniqueViewers ?? 1)) : 0

    // Chat message count
    const { count: totalChatMessages } = await this.supabase
      .from('live_chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .is('deleted_at', null)

    // Donations total (in stars)
    const { data: donations } = await this.supabase
      .from('live_donations')
      .select('amount')
      .eq('session_id', sessionId)

    const totalDonations = (donations ?? []).reduce(
      (sum, d) => sum + (d.amount as number),
      0,
    )

    // Duration
    const durationSec =
      session.actual_start_at && session.actual_end_at
        ? Math.floor(
            (new Date(session.actual_end_at as string).getTime() -
              new Date(session.actual_start_at as string).getTime()) /
              1000,
          )
        : null

    return {
      session_id: sessionId,
      total_viewers: uniqueViewers ?? 0,
      unique_viewers: uniqueViewers ?? 0,
      peak_concurrent_viewers: (session.peak_viewer_count as number) ?? 0,
      average_watch_time_sec: avgWatchTimeSec,
      total_watch_time_sec: totalWatchTimeSec,
      total_chat_messages: totalChatMessages ?? 0,
      total_reactions: 0, // hearts/reactions tracked via separate table
      total_donations: totalDonations,
      duration_sec: durationSec,
    }
  }

  /**
   * Get real-time metrics for a live session.
   * Uses Redis counters for low-latency access.
   */
  async getRealtimeMetrics(
    sessionId: string,
    requestingUserId: string,
  ): Promise<RealtimeMetrics> {
    const { data: session, error: sessionErr } = await this.supabase
      .from('live_sessions')
      .select('user_id, status, actual_start_at, viewer_count')
      .eq('id', sessionId)
      .single()

    if (sessionErr || !session) throw new NotFoundError('Stream session', sessionId)
    if (session.user_id !== requestingUserId) {
      throw new ForbiddenError('Only the stream host can view realtime metrics')
    }

    // Get current viewer count from DB (updated by LiveKit webhook)
    const currentViewers = (session.viewer_count as number) ?? 0

    // Chat messages in the last 60 seconds (sliding window)
    const chatRate = await this.getChatRate(sessionId)
    const reactionRate = await this.getReactionRate(sessionId)

    const startedAt = session.actual_start_at as string | null
    const elapsedSec = startedAt
      ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
      : 0

    return {
      session_id: sessionId,
      current_viewers: currentViewers,
      chat_messages_per_minute: chatRate,
      reactions_per_minute: reactionRate,
      is_live: session.status === 'live',
      started_at: startedAt,
      elapsed_sec: elapsedSec,
    }
  }

  /**
   * Increment the chat rate counter (called when a new chat message arrives).
   * Uses a 60-second sliding window in Redis.
   */
  async incrementChatRate(sessionId: string): Promise<void> {
    const key = CHAT_RATE_KEY(sessionId)
    const pipeline = this.redis.pipeline()
    pipeline.incr(key)
    pipeline.expire(key, 60)
    await pipeline.exec()
  }

  /**
   * Increment the reaction rate counter.
   */
  async incrementReactionRate(sessionId: string): Promise<void> {
    const key = REACTION_RATE_KEY(sessionId)
    const pipeline = this.redis.pipeline()
    pipeline.incr(key)
    pipeline.expire(key, 60)
    await pipeline.exec()
  }

  private async getChatRate(sessionId: string): Promise<number> {
    const val = await this.redis.get(CHAT_RATE_KEY(sessionId))
    return parseInt(val ?? '0', 10)
  }

  private async getReactionRate(sessionId: string): Promise<number> {
    const val = await this.redis.get(REACTION_RATE_KEY(sessionId))
    return parseInt(val ?? '0', 10)
  }
}
