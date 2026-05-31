/**
 * Zod schemas for WS protocol validation.
 * These define the wire format for client-server communication.
 */

import { z } from "zod";

// ─── Envelope ────────────────────────────────────────────────────────────────

export const WsEnvelopeSchema = z.object({
  v: z.literal(1),
  type: z.string(),
  msgId: z.string(),
  ts: z.number(),
  seq: z.number().optional(),
  ack: z.object({
    ackOfMsgId: z.string(),
    ok: z.boolean().optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
      retryable: z.boolean().optional(),
    }).optional(),
  }).optional(),
  trace: z.union([z.string(), z.object({
    traceId: z.string().optional(),
    spanId: z.string().optional(),
  })]).optional(),
  payload: z.unknown(),
});

// ─── Call signaling ───────────────────────────────────────────────────────────

export const CallSignalInviteSchema = z.object({
  to: z.string(),
  to_device: z.string().optional(),
  callId: z.string(),
  callType: z.enum(["audio", "voice", "video"]),
  conversationId: z.string().nullable().optional(),
  callsV2RoomId: z.string().nullable().optional(),
  callsV2JoinToken: z.string().nullable().optional(),
});

export const CallSignalStateSchema = z.object({
  to: z.string(),
  to_device: z.string().optional(),
  callId: z.string(),
});

// ─── E2EE ───────────────────────────────────────────────────────────────────

export const KeyPackageSchema = z.object({
  roomId: z.string(),
  fromDeviceId: z.string().optional(),
  toDeviceId: z.string().optional(),
  senderKeyId: z.string().optional(),
  targetDeviceId: z.string(),
  epoch: z.number(),
  ciphertext: z.string(),
  keyPackageType: z.enum(["DISCOVERY", "WRAPPED_EPOCH_KEY"]).optional(),
  discoveryNonce: z.string().optional(),
  sig: z.string(),
  identitySig: z.string().optional(),
  senderPublicKey: z.string(),
  salt: z.string(),
  senderSigningPublicKey: z.string().optional(),
  senderIdentity: z.object({
    userId: z.string(),
    deviceId: z.string(),
    sessionId: z.string(),
    identityPubKeyJwk: z.unknown().optional(),
  }),
});

// ─── Media ─────────────────────────────────────────────────────────────────

export const RtpCapabilitiesSchema = z.object({
  codecs: z.array(z.object({
    mimeType: z.string(),
    kind: z.enum(["audio", "video"]),
    preferredPayloadType: z.number().optional(),
    clockRate: z.number(),
    channels: z.number().optional(),
    parameters: z.record(z.unknown()).optional(),
    rtcpFeedback: z.array(z.object({
      type: z.string(),
      parameter: z.string().optional(),
    })).optional(),
  })).optional(),
  headerExtensions: z.array(z.object({
    uri: z.string(),
    kind: z.enum(["audio", "video", ""]),
    preferredId: z.number(),
    preferredEncrypt: z.boolean().optional(),
    direction: z.string().optional(),
  })).optional(),
});

// ─── Types ──────────────────────────────────────────────────────────────────

export type WsEnvelope = z.infer<typeof WsEnvelopeSchema>;
export type CallSignalInvite = z.infer<typeof CallSignalInviteSchema>;
export type CallSignalState = z.infer<typeof CallSignalStateSchema>;
export type KeyPackage = z.infer<typeof KeyPackageSchema>;
export type RtpCapabilities = z.infer<typeof RtpCapabilitiesSchema>;