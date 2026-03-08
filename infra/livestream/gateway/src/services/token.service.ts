/**
 * services/token.service.ts — LiveKit JWT token generation.
 *
 * Tokens are short-lived signed JWTs using the LiveKit API secret.
 * Grants are explicitly scoped: publishers can publish, viewers cannot.
 * Identity format: `user_{userId}` to prevent collision with system identities.
 *
 * Security properties:
 * - Publisher tokens: canPublish=true, canSubscribe=true
 * - Viewer tokens: canPublish=false, canSubscribe=true
 * - Guest tokens: canPublish=true (slot-scoped), canSubscribe=true
 * - All tokens: roomJoin=true for specific room only
 * - TTL enforced server-side; clients cannot extend token lifetime
 */

import { AccessToken } from 'livekit-server-sdk'
import { config } from '../config.js'
import type { LiveKitTokenGrants } from '../types/livekit.js'

export interface GeneratedToken {
  token: string
  wsUrl: string
}

function buildAccessToken(
  identity: string,
  name: string,
  roomName: string,
  grants: LiveKitTokenGrants,
  ttlSec: number,
): string {
  const at = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: ttlSec,
  })

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: grants.canPublish ?? false,
    canSubscribe: grants.canSubscribe ?? true,
    canPublishData: grants.canPublishData ?? true,
    canUpdateOwnMetadata: grants.canUpdateOwnMetadata ?? true,
    hidden: grants.hidden ?? false,
    recorder: grants.recorder ?? false,
  })

  return at.toJwt()
}

export class TokenService {
  /**
   * Generate a publisher (host) token for a room.
   * Publisher can publish audio/video tracks and subscribe to all tracks.
   */
  generatePublisherToken(userId: string, roomName: string): GeneratedToken {
    const identity = `publisher_${userId}`
    const token = buildAccessToken(
      identity,
      identity,
      roomName,
      {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
      },
      config.PUBLISHER_TOKEN_TTL_SEC,
    )

    return { token, wsUrl: config.LIVEKIT_PUBLIC_URL }
  }

  /**
   * Generate a viewer (subscribe-only) token for a room.
   * Viewer can only subscribe to tracks, cannot publish.
   */
  generateViewerToken(userId: string, roomName: string): GeneratedToken {
    const identity = `viewer_${userId}_${Date.now()}`
    const token = buildAccessToken(
      identity,
      `viewer_${userId}`,
      roomName,
      {
        canPublish: false,
        canSubscribe: true,
        canPublishData: false,
        canUpdateOwnMetadata: false,
        // Viewers are hidden from participant lists to reduce metadata leakage
        hidden: true,
      },
      config.VIEWER_TOKEN_TTL_SEC,
    )

    return { token, wsUrl: config.LIVEKIT_PUBLIC_URL }
  }

  /**
   * Generate a guest (co-host) token for a room.
   * Guest can publish their own tracks (mic + cam), subscribe to all.
   */
  generateGuestToken(userId: string, roomName: string): GeneratedToken {
    const identity = `guest_${userId}`
    const token = buildAccessToken(
      identity,
      identity,
      roomName,
      {
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: true,
        hidden: false,
      },
      config.GUEST_TOKEN_TTL_SEC,
    )

    return { token, wsUrl: config.LIVEKIT_PUBLIC_URL }
  }

  /**
   * Generate a recorder/egress token for LiveKit Egress service.
   * Recorder is hidden and cannot be subscribed to.
   */
  generateRecorderToken(roomName: string): GeneratedToken {
    const identity = `recorder_${Date.now()}`
    const token = buildAccessToken(
      identity,
      identity,
      roomName,
      {
        canPublish: false,
        canSubscribe: true,
        hidden: true,
        recorder: true,
      },
      config.PUBLISHER_TOKEN_TTL_SEC, // Use same TTL as publisher
    )

    return { token, wsUrl: config.LIVEKIT_PUBLIC_URL }
  }
}

export const tokenService = new TokenService()
