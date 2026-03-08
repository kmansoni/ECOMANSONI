/**
 * services/ingress.service.ts — LiveKit Ingress management.
 *
 * Manages RTMP and WHIP ingress endpoints for broadcasters.
 * RTMP: used by OBS, Streamlabs, etc.
 * WHIP: used by browser WebRTC direct publish (no SDK required).
 *
 * Each session gets exactly one ingress. The stream key is stored
 * in the live_stream_keys table and cached in Redis for O(1) lookup
 * during RTMP auth validation.
 *
 * Redis key: `ingress:key:{streamKey}` → `{sessionId}:{userId}` (TTL=24h)
 */

import type { IngressClient } from 'livekit-server-sdk'
import { IngressInput } from 'livekit-server-sdk'
import type { Redis } from 'ioredis'
import { RoomService } from './room.service.js'
import type { LiveKitIngressInfo } from '../types/livekit.js'

const STREAM_KEY_REDIS_PREFIX = 'ingress:key:'
const STREAM_KEY_TTL_SEC = 86400 // 24h — longer than any stream

export class IngressService {
  constructor(
    private readonly client: IngressClient,
    private readonly redis: Redis,
  ) {}

  /**
   * Create an RTMP ingress for a session.
   * Returns the ingress info including stream key and RTMP URL.
   * Caches the stream key → sessionId mapping in Redis.
   */
  async createRtmpIngress(
    sessionId: string,
    userId: string,
    streamKey: string,
  ): Promise<LiveKitIngressInfo> {
    const roomName = RoomService.sessionToRoomName(sessionId)

    const ingress = await this.client.createIngress(IngressInput.RTMP_INPUT, {
      name: `rtmp_${sessionId}`,
      roomName,
      participantIdentity: `ingress_${userId}`,
      participantName: `RTMP Broadcaster`,
      // Reusable: same ingress/stream key works across reconnects
      // (streamer can disconnect and reconnect without creating new ingress)
      reusable: true,
      // URL format: rtmp://host/app — stream key goes in the URL path
      // streamKey is our generated key, not LiveKit's — we override
    })

    // Cache stream key → (sessionId, userId) for fast webhook validation
    const cacheValue = JSON.stringify({ sessionId, userId })
    await this.redis.set(
      `${STREAM_KEY_REDIS_PREFIX}${streamKey}`,
      cacheValue,
      'EX',
      STREAM_KEY_TTL_SEC,
    )

    return {
      ingressId: ingress.ingressId,
      name: ingress.name,
      streamKey: streamKey, // Return OUR key, not LiveKit's internal key
      url: ingress.url,
      inputType: 'rtmp',
      roomName: ingress.roomName,
      participantIdentity: ingress.participantIdentity,
      participantName: ingress.participantName,
      reusable: ingress.reusable,
    }
  }

  /**
   * Delete an ingress endpoint.
   * Safe to call on already-deleted ingress (not-found is swallowed).
   */
  async deleteIngress(ingressId: string, streamKey: string): Promise<void> {
    try {
      await this.client.deleteIngress(ingressId)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('not found') && !msg.includes('404')) {
        throw err
      }
    }

    // Clean up Redis cache
    await this.redis.del(`${STREAM_KEY_REDIS_PREFIX}${streamKey}`)
  }

  /**
   * Resolve a stream key to its sessionId and userId via Redis cache.
   * Returns null if key is not found or expired.
   */
  async resolveStreamKey(
    streamKey: string,
  ): Promise<{ sessionId: string; userId: string } | null> {
    const raw = await this.redis.get(`${STREAM_KEY_REDIS_PREFIX}${streamKey}`)
    if (!raw) return null

    try {
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'sessionId' in parsed &&
        'userId' in parsed
      ) {
        return parsed as { sessionId: string; userId: string }
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Extend the Redis TTL for an active stream key (called on heartbeat).
   */
  async touchStreamKey(streamKey: string): Promise<void> {
    await this.redis.expire(`${STREAM_KEY_REDIS_PREFIX}${streamKey}`, STREAM_KEY_TTL_SEC)
  }
}
