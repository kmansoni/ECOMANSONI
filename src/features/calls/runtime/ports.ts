/**
 * Runtime ports — interfaces for dependency injection.
 *
 * Architecture rule:
 * - Runtime uses ONLY these interfaces (ports), not concrete implementations
 * - Adapters implement these ports
 * - Provider wires implementations to ports
 */

import type {
  VideoCall,
  ConnectionState,
  RtpCapabilities,
} from "@/calls-v2/types";
import type { CallState, CallEvent } from "@/calls-v2/callStateMachine";

// ─── Call Signaling Port ──────────────────────────────────────────────────────

export interface CallSignalingPort {
  /** Connect to signaling server. */
  connect(): Promise<void>;

  /** Disconnect from signaling server. */
  disconnect(): void;

  /** Get current connection state. */
  getConnectionState(): ConnectionState;

  /** Wait for specific connection state. */
  waitForConnectionState(states: ConnectionState[], timeoutMs?: number): Promise<ConnectionState>;

  /** Send call invite to callee. */
  sendCallInvite(payload: {
    to: string;
    callId: string;
    callType: "audio" | "video";
    conversationId?: string;
    callsV2RoomId?: string;
    callsV2JoinToken?: string;
  }): Promise<void>;

  /** Send call accept to caller. */
  sendCallAccept(payload: { to: string; callId: string }): Promise<void>;

  /** Send call decline to caller. */
  sendCallDecline(payload: { to: string; callId: string }): Promise<void>;

  /** Send call hangup. */
  sendCallHangup(payload: { to: string; callId: string }): Promise<void>;

  /** Subscribe to signaling events. */
  onEvent(event: SignalingEvent, handler: SignalingEventHandler): () => void;
}

export type SignalingEvent =
  | "connected"
  | "disconnected"
  | "error"
  | "call_invite"
  | "call_accept"
  | "call_decline"
  | "call_cancel"
  | "call_hangup"
  | "room_joined"
  | "peer_joined"
  | "peer_left";

export type SignalingEventHandler = (payload: unknown) => void;

// ─── Call Persistence Port ────────────────────────────────────────────────────

export interface CallPersistencePort {
  /** Create new call record in DB. */
  createCall(payload: {
    callerId: string;
    calleeId: string;
    callType: "audio" | "video";
    conversationId?: string;
  }): Promise<VideoCall>;

  /** Update call status. */
  updateCallStatus(callId: string, status: string): Promise<void>;

  /** Get call by ID. */
  getCall(callId: string): Promise<VideoCall | null>;

  /** Get active calls for user. */
  getActiveCalls(userId: string): Promise<VideoCall[]>;

  /** Get call history for user. */
  getCallHistory(userId: string, limit?: number): Promise<VideoCall[]>;

  /** Subscribe to incoming calls via realtime. */
  subscribeToIncomingCalls(
    userId: string,
    onIncoming: (call: VideoCall) => void
  ): () => void;
}

// ─── Call Media Port ─────────────────────────────────────────────────────────

export interface CallMediaPort {
  /** Get local media stream (camera + mic). */
  acquireLocalStream(constraints?: MediaStreamConstraints): Promise<MediaStream>;

  /** Release local media stream. */
  releaseLocalStream(): void;

  /** Replace local track (for camera toggle). */
  replaceLocalTrack(kind: "audio" | "video", track: MediaStreamTrack): Promise<void>;

  /** Get SFU router capabilities. */
  getRouterCapabilities(): RtpCapabilities;

  /** Create send transport (for publishing). */
  createSendTransport(): Promise<string>;

  /** Create recv transport (for subscribing). */
  createRecvTransport(): Promise<string>;

  /** Connect transport with DTLS parameters. */
  connectTransport(transportId: string, dtlsParameters: unknown): Promise<void>;

  /** Produce local track to SFU. */
  produce(transportId: string, track: MediaStreamTrack, kind: "audio" | "video"): Promise<string>;

  /** Consume remote producer. */
  consume(producerId: string, rtpCapabilities: RtpCapabilities): Promise<string>;

  /** Resume consumer (start receiving). */
  resumeConsumer(consumerId: string): Promise<void>;

  /** Close consumer. */
  closeConsumer(consumerId: string): Promise<void>;

  /** Get remote stream assembled from consumers. */
  getRemoteStream(): MediaStream | null;

  /** Subscribe to remote track events. */
  onRemoteTrack(handler: (track: MediaStreamTrack, kind: "audio" | "video") => void): () => void;
}

// ─── Call Crypto Port ─────────────────────────────────────────────────────────

export interface CallCryptoPort {
  /** Generate ECDH key pair for key exchange. */
  generateKeyPair(): Promise<CryptoKeyPair>;

  /** Derive shared secret using ECDH. */
  deriveSharedSecret(
    privateKey: CryptoKey,
    publicKey: CryptoKey
  ): Promise<ArrayBuffer>;

  /** Derive encryption key using HKDF. */
  deriveKey(
    inputKeyMaterial: ArrayBuffer,
    salt: ArrayBuffer,
    info: string
  ): Promise<CryptoKey>;

  /** Encrypt data with AES-GCM. */
  encrypt(
    plaintext: ArrayBuffer,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<ArrayBuffer>;

  /** Decrypt data with AES-GCM. */
  decrypt(
    ciphertext: ArrayBuffer,
    key: CryptoKey,
    iv: Uint8Array
  ): Promise<ArrayBuffer>;

  /** Generate random bytes for nonces/salts. */
  getRandomBytes(length: number): Uint8Array;

  /** Check if Insertable Streams are supported. */
  isInsertableStreamsSupported(): boolean;

  /** Apply E2EE transform to RTCRtpSender. */
  applySenderTransform(sender: RTCRtpSender, key: CryptoKey): Promise<void>;

  /** Apply E2EE transform to RTCRtpReceiver. */
  applyReceiverTransform(receiver: RTCRtpReceiver, key: CryptoKey): Promise<void>;
}

// ─── Call Telemetry Port ──────────────────────────────────────────────────────

export interface CallTelemetryPort {
  /** Log call event. */
  logEvent(event: {
    name: string;
    properties?: Record<string, unknown>;
    timestamp?: number;
  }): void;

  /** Log call metric. */
  logMetric(metric: {
    name: string;
    value: number;
    unit?: string;
    tags?: Record<string, string>;
  }): void;

  /** Track call quality. */
  trackCallQuality(data: {
    callId: string;
    roundTripTime?: number;
    packetLoss?: number;
    jitter?: number;
    bitrate?: number;
  }): void;
}

// ─── Call Permissions Port ────────────────────────────────────────────────────

export interface CallPermissionsPort {
  /** Request media permissions. */
  requestMediaPermissions(kind: "audio" | "video"): Promise<boolean>;

  /** Check if permissions are granted. */
  hasMediaPermissions(): Promise<boolean>;

  /** Get available media devices. */
  enumerateDevices(): Promise<MediaDeviceInfo[]>;

  /** Select specific device for camera/mic. */
  selectDevice(kind: "camera" | "microphone", deviceId: string): void;
}

// ─── Clock Port ───────────────────────────────────────────────────────────────

export interface CallClockPort {
  /** Get current timestamp in milliseconds. */
  now(): number;

  /** Schedule callback after delay. */
  setTimeout(callback: () => void, delayMs: number): number;

  /** Cancel scheduled callback. */
  clearTimeout(id: number): void;

  /** Schedule recurring callback. */
  setInterval(callback: () => void, intervalMs: number): number;

  /** Cancel recurring callback. */
  clearInterval(id: number): void;
}

// ─── Port Implementations Factory ─────────────────────────────────────────────

export interface PortFactory {
  signaling: CallSignalingPort;
  persistence: CallPersistencePort;
  media: CallMediaPort;
  crypto: CallCryptoPort;
  telemetry: CallTelemetryPort;
  permissions: CallPermissionsPort;
  clock: CallClockPort;
}