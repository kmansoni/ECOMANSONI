/* ============================================
 * Calls V2 WebSocket Protocol Types
 * ============================================ */

// ----------- Envelope -----------
export interface WsEnvelopeV1<P = unknown> {
  v: 1;
  type: string;
  msgId: string;
  ts: number;
  seq?: number;
  ack?: {
    ackOfMsgId: string;
    ok?: boolean;
    error?: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
    };
  };
  /** @deprecated object form { traceId, spanId } replaced by opaque string trace ID */
  trace?: string | { traceId?: string; spanId?: string };
  payload: P;
}

// ----------- Config -----------
export interface CallsWsConfig {
  endpoints?: string[];          // WSS URLs (multi-region failover)
  // Legacy aliases kept for backward compatibility:
  url?: string;                  // single endpoint
  urls?: string[];               // multi-region failover endpoints
  token?: string;                // JWT auth token
  heartbeatMs?: number;          // default 10000
  reconnectBaseMs?: number;      // default 500
  reconnectMaxMs?: number;       // default 10000
  maxReconnectAttempts?: number; // default 12
  ackRetryMs?: number;           // default 2000
  ackMaxRetries?: number;        // default 3
  dedupWindowSize?: number;      // default 10000
  requireWss?: boolean;          // default true — enforce wss://
  // Legacy reconnect/ackRetry sub-objects:
  reconnect?: {
    enabled?: boolean;
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  };
  ackRetry?: {
    maxRetries?: number;
    retryDelayMs?: number;
  };
}

// ----------- Auth (legacy) -----------
export type CallsWsAuth = {
  accessToken: string;
};

// ----------- Server Events -----------
export type CallsWsEvent =
  | 'HELLO_ACK'
  | 'WELCOME'
  | 'AUTH_OK'
  | 'AUTH_FAIL'
  | 'ROOM_CREATED'
  | 'ROOM_JOIN_SECRET'
  | 'ROOM_JOINED'
  | 'ROOM_JOIN_OK'
  | 'ROOM_SNAPSHOT'
  | 'ROOM_LEFT'
  | 'PEER_JOINED'
  | 'PEER_LEFT'
  | 'OFFER'
  | 'ANSWER'
  | 'ICE_CANDIDATE'
  | 'ICE_RESTART_OK'
  | 'TRANSPORT_CREATED'
  | 'TRANSPORT_CONNECTED'
  | 'PRODUCED'
  | 'PRODUCER_ADDED'
  | 'CONSUMED'
  | 'CONSUMER_ADDED'
  | 'CONSUMER_RESUMED'
  | 'ERROR'
  | 'PONG'
  // E2EE events
  | 'E2EE_POLICY'
  | 'REKEY_BEGIN'
  | 'REKEY_COMMIT'
  | 'KEY_PACKAGE'
  | 'KEY_ACK'
  | 'E2EE_READY_ACK'
  | 'ROUTER_RTP_CAPABILITIES';

// ----------- Payload types для клиентских сообщений -----------

export interface HelloPayload {
  client: {
    platform?: string;
    appVersion?: string;
    deviceId: string;
  };
}

export interface AuthPayload {
  accessToken: string;
}

export interface RoomCreatePayload {
  roomId?: string;
  callId?: string;
  preferredRegion?: string;
  maxPeers?: number;
  e2eeRequired?: boolean;
  allowedUserIds?: string[];
}

export interface RoomJoinPayload {
  roomId: string;
  callId?: string;
  joinToken?: string;
  deviceId?: string;
  preferredRegion?: string;
}

export interface RoomLeavePayload {
  roomId: string;
  reason?: string;
}

// ----------- Mediasoup typed structures -----------

/** DTLS parameters для TRANSPORT_CONNECT */
export interface DtlsParameters {
  role?: 'auto' | 'client' | 'server';
  fingerprints: Array<{
    algorithm: string;
    value: string;
  }>;
}

/** ICE parameters из TRANSPORT_CREATED */
export interface IceParameters {
  usernameFragment: string;
  password: string;
  iceLite?: boolean;
}

/** ICE candidate из TRANSPORT_CREATED */
export interface IceCandidate {
  foundation: string;
  priority: number;
  ip: string;
  protocol: 'udp' | 'tcp';
  port: number;
  type: 'host' | 'srflx' | 'prflx' | 'relay';
  tcpType?: 'active' | 'passive' | 'so';
}

/** RTP parameters для PRODUCE */
export interface RtpParameters {
  mid?: string;
  codecs: Array<{
    mimeType: string;
    payloadType: number;
    clockRate: number;
    channels?: number;
    parameters?: Record<string, unknown>;
    rtcpFeedback?: Array<{ type: string; parameter?: string }>;
  }>;
  headerExtensions?: Array<{
    uri: string;
    id: number;
    encrypt?: boolean;
    parameters?: Record<string, unknown>;
  }>;
  encodings?: Array<Record<string, unknown>>;
  rtcp?: {
    cname?: string;
    reducedSize?: boolean;
  };
}

/** RTP capabilities для CONSUME и Device */
export interface RtpCapabilities {
  codecs?: Array<{
    mimeType: string;
    kind: 'audio' | 'video';
    preferredPayloadType?: number;
    clockRate: number;
    channels?: number;
    parameters?: Record<string, unknown>;
    rtcpFeedback?: Array<{ type: string; parameter?: string }>;
  }>;
  headerExtensions?: Array<{
    uri: string;
    kind: 'audio' | 'video' | '';
    preferredId: number;
    preferredEncrypt?: boolean;
    direction?: string;
  }>;
}

// ----------- SFU Transport payloads -----------

export interface TransportCreatePayload {
  roomId: string;
  direction: 'send' | 'recv';
}

export interface TransportConnectPayload {
  roomId: string;
  transportId: string;
  dtlsParameters: DtlsParameters;
}

export interface ProducePayload {
  roomId: string;
  transportId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
  appData?: Record<string, unknown>;
}

export interface ConsumePayload {
  roomId: string;
  producerId: string;
  rtpCapabilities: RtpCapabilities;
}

export interface ConsumerResumePayload {
  roomId: string;
  consumerId: string;
}

export interface IceRestartPayload {
  roomId: string;
  transportId: string;
}

// ----------- P2P Signaling payloads -----------

export interface OfferPayload {
  roomId: string;
  targetDeviceId: string;
  sdp: string;
}

export interface AnswerPayload {
  roomId: string;
  targetDeviceId: string;
  sdp: string;
}

export interface IceCandidatePayload {
  roomId: string;
  targetDeviceId?: string;
  candidate: RTCIceCandidateInit;
}

// ----------- E2EE payloads -----------

export interface E2EECapsPayload {
  roomId?: string;
  insertableStreams: boolean;
  sframe?: boolean;
  doubleRatchet?: boolean;
  supportedCipherSuites?: string[];
}

export interface E2EEReadyPayload {
  roomId: string;
  epoch: number;
}

export interface RekeyBeginPayload {
  roomId: string;
  epoch: number;
  reason?: 'periodic' | 'peer_left' | 'manual';
}

export interface RekeyCommitPayload {
  roomId: string;
  epoch: number;
}

export interface KeyPackagePayload {
  roomId: string;
  targetDeviceId: string;
  epoch: number;
  ciphertext: string;           // encrypted key material (base64)
  sig: string;                  // signature (base64)
  senderPublicKey?: string;     // sender's public key for ECDH (base64)
  salt?: string;                // base64 random 32-byte HKDF salt (H-1)
  senderIdentity: {             // C-2: required for ECDSA sig verification in processKeyPackage
    userId: string;
    deviceId: string;
    sessionId: string;
  };
}

export interface KeyAckPayload {
  roomId: string;
  epoch: number;
  fromDeviceId: string;
  refId?: string;
}

// ----------- Server response payloads -----------

export interface HelloAckPayload {
  serverVersion: string;
  features: string[];
}

export interface AuthOkPayload {
  userId: string;
  deviceId: string;
  sessionId: string;
}

export interface AuthFailPayload {
  reason: string;
  code?: number;
}

export interface RoomCreatedPayload {
  roomId: string;
  joinToken?: string;
  e2eeRequired: boolean;
}

export interface RoomJoinedPayload {
  roomId: string;
  peers: Array<{
    deviceId: string;
    userId: string;
    e2eeReady?: boolean;
  }>;
  routerRtpCapabilities?: RtpCapabilities;
}

export interface PeerJoinedPayload {
  roomId: string;
  deviceId: string;
  userId: string;
}

export interface PeerLeftPayload {
  roomId: string;
  deviceId: string;
  userId: string;
  reason?: string;
}

export interface TransportCreatedPayload {
  roomId: string;
  transportId: string;
  direction?: 'send' | 'recv';
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
}

export interface ProducedPayload {
  roomId: string;
  producerId: string;
}

export interface ConsumedPayload {
  roomId: string;
  consumerId: string;
  producerId: string;
  kind: 'audio' | 'video';
  rtpParameters: RtpParameters;
}

export interface E2EEPolicyPayload {
  roomId: string;
  required: boolean;
  cipherSuites: string[];
}

export interface ErrorPayload {
  code: number;
  message: string;
  details?: Record<string, unknown>;
}

// ----------- Client message type map -----------
export interface GetRouterRtpCapabilitiesPayload {
  roomId: string;
}

export interface RouterRtpCapabilitiesPayload {
  roomId: string;
  routerRtpCapabilities: RtpCapabilities;
}

export interface ClientMessageMap {
  HELLO: HelloPayload;
  AUTH: AuthPayload;
  ROOM_CREATE: RoomCreatePayload;
  ROOM_JOIN: RoomJoinPayload;
  ROOM_LEAVE: RoomLeavePayload;
  TRANSPORT_CREATE: TransportCreatePayload;
  TRANSPORT_CONNECT: TransportConnectPayload;
  PRODUCE: ProducePayload;
  CONSUME: ConsumePayload;
  CONSUMER_RESUME: ConsumerResumePayload;
  ICE_RESTART: IceRestartPayload;
  OFFER: OfferPayload;
  ANSWER: AnswerPayload;
  ICE_CANDIDATE: IceCandidatePayload;
  E2EE_CAPS: E2EECapsPayload;
  E2EE_READY: E2EEReadyPayload;
  REKEY_BEGIN: RekeyBeginPayload;
  REKEY_COMMIT: RekeyCommitPayload;
  KEY_PACKAGE: KeyPackagePayload;
  KEY_ACK: KeyAckPayload;
  GET_ROUTER_RTP_CAPABILITIES: GetRouterRtpCapabilitiesPayload;
  PING: Record<string, never>;
}

// ----------- Connection state -----------
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'reconnecting'
  | 'failed';

// ----------- Event handler types -----------
export type MessageHandler<P = unknown> = (envelope: WsEnvelopeV1<P>) => void;
export type ConnectionStateHandler = (state: ConnectionState) => void;
export type ErrorHandler = (error: Error) => void;

// Legacy alias
export type CallsWsEventHandler = (frame: WsEnvelopeV1) => void;
