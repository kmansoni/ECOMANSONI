/**
 * types/livekit.ts — LiveKit-specific types and enums.
 */

// ── Room ──────────────────────────────────────────────────────────────────────

export interface LiveKitRoomInfo {
  name: string
  sid: string
  numParticipants: number
  numPublishers: number
  activeRecording: boolean
  creationTime: bigint
}

// ── Participant ───────────────────────────────────────────────────────────────

export type ParticipantKind = 'standard' | 'ingress' | 'egress' | 'sip' | 'agent'

export interface LiveKitParticipant {
  identity: string
  name: string
  sid: string
  state: 'joining' | 'joined' | 'active' | 'disconnected'
  tracks: LiveKitTrackInfo[]
  joinedAt?: bigint
  kind: ParticipantKind
}

export interface LiveKitTrackInfo {
  sid: string
  type: 'audio' | 'video' | 'data'
  name: string
  muted: boolean
}

// ── Ingress ───────────────────────────────────────────────────────────────────

export type IngressInput = 'rtmp' | 'whip' | 'url'

export interface LiveKitIngressInfo {
  ingressId: string
  name: string
  streamKey: string
  url: string
  inputType: IngressInput
  roomName: string
  participantIdentity: string
  participantName: string
  reusable: boolean
  state?: LiveKitIngressState
}

export interface LiveKitIngressState {
  status: 'idle' | 'buffering' | 'active' | 'inactive' | 'error'
  error: string
  roomId: string
  startedAt: bigint
  endedAt: bigint
  updatedAt: bigint
}

// ── Egress ────────────────────────────────────────────────────────────────────

export type EgressStatus =
  | 'starting'
  | 'active'
  | 'ending'
  | 'complete'
  | 'failed'
  | 'aborted'

export interface LiveKitEgressInfo {
  egressId: string
  roomId: string
  roomName: string
  status: EgressStatus
  startedAt: bigint
  endedAt: bigint
  error: string
  fileResults?: EgressFileResult[]
  hlsManifest?: string
}

export interface EgressFileResult {
  filename: string
  startedAt: bigint
  endedAt: bigint
  duration: bigint
  size: bigint
  location: string
}

// ── Webhook events ────────────────────────────────────────────────────────────

export type LiveKitWebhookEventType =
  | 'room_started'
  | 'room_finished'
  | 'participant_joined'
  | 'participant_left'
  | 'track_published'
  | 'track_unpublished'
  | 'egress_started'
  | 'egress_updated'
  | 'egress_ended'
  | 'ingress_started'
  | 'ingress_ended'

export interface LiveKitWebhookEvent {
  event: LiveKitWebhookEventType
  room?: LiveKitRoomInfo
  participant?: LiveKitParticipant
  egressInfo?: LiveKitEgressInfo
  ingressInfo?: LiveKitIngressInfo
  id: string
  createdAt: bigint
  numDropped: number
}

// ── Token grants ──────────────────────────────────────────────────────────────

export interface LiveKitTokenGrants {
  roomCreate?: boolean
  roomJoin?: boolean
  roomAdmin?: boolean
  roomRecord?: boolean
  roomList?: boolean
  ingressAdmin?: boolean
  canPublish?: boolean
  canSubscribe?: boolean
  canPublishData?: boolean
  canUpdateOwnMetadata?: boolean
  hidden?: boolean
  recorder?: boolean
  agent?: boolean
}
