/**
 * services/egress.service.ts — LiveKit Egress management.
 *
 * Handles:
 * - HLS egress: creates HLS stream from a room for CDN delivery
 * - File recording: records the stream to MP4 for VOD replay
 *
 * HLS segments are written to MinIO bucket `livestream-hls`.
 * Recordings are written to `livestream-recordings`.
 *
 * Egress IDs are stored in live_sessions.egress_id for lifecycle tracking.
 * On stream stop, all active egresses are terminated.
 */

import type { EgressClient } from 'livekit-server-sdk'
import {
  EncodingOptionsPreset,
  SegmentedFileOutput,
  SegmentedFileSuffix,
  DirectFileOutput,
} from 'livekit-server-sdk'
import { config } from '../config.js'
import { RoomService } from './room.service.js'
import type { LiveKitEgressInfo } from '../types/livekit.js'

export interface EgressStartResult {
  egressId: string
  hlsManifestPath?: string
  recordingPath?: string
}

export class EgressService {
  constructor(private readonly client: EgressClient) {}

  /**
   * Start HLS egress for a room.
   * Writes HLS segments to S3 (MinIO) at path: hls/{roomName}/playlist.m3u8
   *
   * Segment duration: 2s (low latency HLS)
   * Encoding: 720p 3Mbps video + 128kbps audio (auto-scaled by LiveKit)
   */
  async startHlsEgress(sessionId: string): Promise<EgressStartResult> {
    const roomName = RoomService.sessionToRoomName(sessionId)
    const s3Path = `hls/${roomName}/playlist.m3u8`

    const output = new SegmentedFileOutput({
      filenamePrefix: `hls/${roomName}/segment`,
      playlistName: 'playlist.m3u8',
      livePlaylistName: 'live.m3u8',
      segmentDuration: 2, // 2-second segments for 6s latency
      suffix: SegmentedFileSuffix.TIMESTAMP,
      s3: {
        accessKey: config.S3_ACCESS_KEY,
        secret: config.S3_SECRET_KEY,
        bucket: config.S3_BUCKET_HLS,
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT,
        forcePathStyle: true,
      },
    })

    const egress = await this.client.startRoomCompositeEgress(roomName, output, {
      encodingOptions: EncodingOptionsPreset.H264_720P_3,
      layout: 'speaker',
    })

    return {
      egressId: egress.egressId,
      hlsManifestPath: s3Path,
    }
  }

  /**
   * Start MP4 recording egress for VOD.
   * Writes to S3 (MinIO) at path: recordings/{roomName}/recording_{timestamp}.mp4
   */
  async startRecordingEgress(sessionId: string): Promise<EgressStartResult> {
    const roomName = RoomService.sessionToRoomName(sessionId)
    const timestamp = Date.now()
    const s3Path = `recordings/${roomName}/recording_${timestamp}.mp4`

    const output = new DirectFileOutput({
      filepath: s3Path,
      s3: {
        accessKey: config.S3_ACCESS_KEY,
        secret: config.S3_SECRET_KEY,
        bucket: config.S3_BUCKET_RECORDINGS,
        region: config.S3_REGION,
        endpoint: config.S3_ENDPOINT,
        forcePathStyle: true,
      },
    })

    const egress = await this.client.startRoomCompositeEgress(roomName, output, {
      encodingOptions: EncodingOptionsPreset.H264_720P_3,
      layout: 'speaker',
    })

    return {
      egressId: egress.egressId,
      recordingPath: s3Path,
    }
  }

  /**
   * Stop an active egress by its ID.
   * Safe to call on already-stopped egress (not-found is swallowed).
   */
  async stopEgress(egressId: string): Promise<LiveKitEgressInfo | null> {
    try {
      const egress = await this.client.stopEgress(egressId)
      return {
        egressId: egress.egressId,
        roomId: egress.roomId,
        roomName: egress.roomName,
        status: mapEgressStatus(egress.status),
        startedAt: egress.startedAt,
        endedAt: egress.endedAt,
        error: egress.error,
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('not found') || msg.includes('404')) {
        return null
      }
      throw err
    }
  }

  /**
   * List all active egresses for a room.
   */
  async listEgresses(sessionId: string): Promise<LiveKitEgressInfo[]> {
    const roomName = RoomService.sessionToRoomName(sessionId)
    const egresses = await this.client.listEgress({ roomName })
    return egresses.map((e) => ({
      egressId: e.egressId,
      roomId: e.roomId,
      roomName: e.roomName,
      status: mapEgressStatus(e.status),
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      error: e.error,
    }))
  }
}

function mapEgressStatus(
  status: number,
): 'starting' | 'active' | 'ending' | 'complete' | 'failed' | 'aborted' {
  // LiveKit EgressStatus enum values:
  // 0=EGRESS_STARTING, 1=EGRESS_ACTIVE, 2=EGRESS_ENDING
  // 3=EGRESS_COMPLETE, 4=EGRESS_FAILED, 5=EGRESS_ABORTED
  const map: Record<
    number,
    'starting' | 'active' | 'ending' | 'complete' | 'failed' | 'aborted'
  > = {
    0: 'starting',
    1: 'active',
    2: 'ending',
    3: 'complete',
    4: 'failed',
    5: 'aborted',
  }
  return map[status] ?? 'failed'
}
