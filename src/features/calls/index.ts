/**
 * Calls feature — public API.
 *
 * All imports from this package should go through here.
 * This provides backward compatibility with existing imports.
 */

// ─── Domain ─────────────────────────────────────────────────────────────────

export * from "./domain/call.types";
export * from "./domain/call.events";
export * from "./domain/callStateMachine";
export * from "./domain/callGuards";

// ─── Protocol ───────────────────────────────────────────────────────────────

export * from "./protocol/callsProtocol.version";
export * from "./protocol/callsWs.schemas";
export * from "./protocol/callsWs.codec";
export * from "./protocol/callsWs.closePolicy";

// ─── Runtime ──────────────────────────────────────────────────────────��─────

export * from "./runtime/ports";
export { CallSession, CallSessionRegistry, callSessionRegistry } from "./runtime/callSession";
export * from "./runtime/callLifecycle";

// ─── Device ─────────────────────────────────────────────────────────────────

export {
  getMediaDevices,
  getDefaultDeviceId,
  requestMediaPermission,
  hasCamera,
  hasMicrophone,
  onDeviceChange,
  type DeviceKind,
  type MediaDevice,
} from "./device/deviceManager";

export {
  LocalMediaManager,
  localMediaManager,
  type LocalMediaOptions,
} from "./device/localMedia";

// ─── Transport ─────────────────────────────────────────────────────────────

export {
  SfuTransportManager,
  sfuTransportManager,
  type TransportOptions,
  type ProduceResult,
  type ConsumeResult,
} from "./transport/sfuTransport";

// ─── Encryption ─────────────────────────────────────────────────────────────

export {
  setupSenderEncryption,
  setupReceiverEncryption,
  removeEncryptionTransforms,
  isE2EESupported,
  SFRAME_KEY_LENGTH,
  SFRAME_NONCE_LENGTH,
} from "./encryption/e2eeTransform";

// ─── Adapters ───────────────────────────────────────────────────────────────

export { SupabaseCallPersistenceAdapter, supabaseCallPersistence } from "./adapters/supabasePersistence";
export { CallTelemetryAdapter, callTelemetry } from "./adapters/telemetry";
export { BrowserPermissionsAdapter, browserPermissions } from "./adapters/browserPermissions";
export { acquireScreenShare, isScreenShareSupported } from "./adapters/screenShare";

// ─── Backward compatibility re-exports from calls-v2 ─────────────────────────

// These re-exports allow gradual migration:
// Old code imports from @/calls-v2/*
// New code imports from @/features/calls/*
// Both work until legacy imports are removed

export { CALL_ENGINE_MODE, type CallEngineMode } from "@/calls-v2/callStateMachine";

export type {
  VideoCall,
  VideoCallStatus,
  WsEnvelopeV1,
  ConnectionState,
  RtpCapabilities,
  DtlsParameters,
  IceParameters,
  IceCandidate,
  RtpParameters,
  ConsumerReplayDescriptor,
  TransportCreatePayload,
  TransportConnectPayload,
  ProducePayload,
  ConsumePayload,
  ConsumerAddedPayload,
  HelloPayload,
  AuthPayload,
  RoomCreatePayload,
  RoomJoinPayload,
  RoomLeavePayload,
  OfferPayload,
  AnswerPayload,
  IceCandidatePayload,
  E2EECapsPayload,
  E2EEReadyPayload,
  RekeyBeginPayload,
  RekeyCommitPayload,
  KeyPackagePayload,
  KeyAckPayload,
  HelloAckPayload,
  AuthOkPayload,
  AuthFailPayload,
  RoomCreatedPayload,
  RoomJoinedPayload,
  PeerJoinedPayload,
  PeerLeftPayload,
  TransportCreatedPayload,
  ProducedPayload,
  ConsumedPayload,
  SerializedProducer,
  SerializedConsumer,
  E2EEPolicyPayload,
  ErrorPayload,
  CallSignalInvitePayload,
  CallSignalStatePayload,
  ClientMessageMap,
  MessageHandler,
  ConnectionStateHandler,
  ErrorHandler,
  CallsWsEvent,
  CallsWsEventHandler,
  CallsWsConfig,
  CallsWsAuth,
} from "@/calls-v2/types";