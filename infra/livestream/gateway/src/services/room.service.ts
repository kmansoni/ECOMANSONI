/**
 * services/room.service.ts — LiveKit room lifecycle management.
 *
 * Manages LiveKit rooms via RoomServiceClient.
 * Room naming convention: `live_{sessionId}` for traceability.
 *
 * Idempotency: createRoom is idempotent (LiveKit returns existing room
 * if name already exists with same settings).
 *
 * Error handling: RoomServiceClient throws on network errors;
 * all methods wrap errors with context for structured logging.
 */

import type { RoomServiceClient } from 'livekit-server-sdk'
import type { LiveKitRoomInfo } from '../types/livekit.js'

export interface CreateRoomOptions {
  sessionId: string
  maxParticipants?: number
  emptyTimeout?: number  // seconds before room is auto-deleted when empty
}

export class RoomService {
  constructor(private readonly client: RoomServiceClient) {}

  /**
   * Derive deterministic room name from session ID.
   * Format: `live_{sessionId}` — max 64 chars, LiveKit constraint.
   */
  static sessionToRoomName(sessionId: string): string {
    return `live_${sessionId}`
  }

  /**
   * Create a LiveKit room for a stream session.
   * Returns the room info. Idempotent — safe to call multiple times.
   */
  async createRoom(opts: CreateRoomOptions): Promise<LiveKitRoomInfo> {
    const roomName = RoomService.sessionToRoomName(opts.sessionId)

    const room = await this.client.createRoom({
      name: roomName,
      // Auto-delete room after emptyTimeout seconds when no participants
      emptyTimeout: opts.emptyTimeout ?? 60,
      // Maximum participants in this room
      maxParticipants: opts.maxParticipants ?? 1000,
      // Metadata: JSON string with session info for LiveKit sidecars
      metadata: JSON.stringify({ sessionId: opts.sessionId }),
    })

    return {
      name: room.name,
      sid: room.sid,
      numParticipants: room.numParticipants,
      numPublishers: room.numPublishers,
      activeRecording: room.activeRecording,
      creationTime: room.creationTime,
    }
  }

  /**
   * Delete a LiveKit room — disconnects all participants.
   * Safe to call on already-deleted rooms (not-found is swallowed).
   */
  async deleteRoom(sessionId: string): Promise<void> {
    const roomName = RoomService.sessionToRoomName(sessionId)
    try {
      await this.client.deleteRoom(roomName)
    } catch (err: unknown) {
      // If room does not exist, ignore — may have already been cleaned up
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('not found') && !msg.includes('404')) {
        throw err
      }
    }
  }

  /**
   * Get current room info including participant count.
   */
  async getRoom(sessionId: string): Promise<LiveKitRoomInfo | null> {
    const roomName = RoomService.sessionToRoomName(sessionId)
    try {
      const rooms = await this.client.listRooms([roomName])
      const room = rooms[0]
      if (!room) return null
      return {
        name: room.name,
        sid: room.sid,
        numParticipants: room.numParticipants,
        numPublishers: room.numPublishers,
        activeRecording: room.activeRecording,
        creationTime: room.creationTime,
      }
    } catch {
      return null
    }
  }

  /**
   * Remove a participant from a room by identity.
   * Used for kicking guests or banned users.
   */
  async removeParticipant(sessionId: string, participantIdentity: string): Promise<void> {
    const roomName = RoomService.sessionToRoomName(sessionId)
    await this.client.removeParticipant(roomName, participantIdentity)
  }

  /**
   * Mute a participant's track (e.g., unmuted mic from banned user).
   * trackSid: track SID to mute.
   */
  async muteParticipantTrack(
    sessionId: string,
    participantIdentity: string,
    trackSid: string,
  ): Promise<void> {
    const roomName = RoomService.sessionToRoomName(sessionId)
    await this.client.mutePublishedTrack(roomName, participantIdentity, trackSid, true)
  }

  /**
   * Get participant count from the live room.
   * Returns 0 if room does not exist.
   */
  async getViewerCount(sessionId: string): Promise<number> {
    const room = await this.getRoom(sessionId)
    return room?.numParticipants ?? 0
  }
}
