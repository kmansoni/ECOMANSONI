/**
 * Message codec for WS protocol.
 * Handles parsing, serialization, and validation of wire messages.
 */

import { WsEnvelopeSchema, type WsEnvelope } from "./callsWs.schemas";

export type { WsEnvelope };

/**
 * Parse raw JSON into typed envelope. Returns null if invalid.
 */
export function parseEnvelope(raw: unknown): WsEnvelope | null {
  try {
    return WsEnvelopeSchema.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Serialize envelope to JSON string.
 */
export function serializeEnvelope(envelope: WsEnvelope): string {
  return JSON.stringify(envelope);
}

/**
 * Generate unique message ID for tracing.
 */
export function generateMsgId(): string {
  return crypto.randomUUID();
}

/**
 * Create timestamp for envelope.
 */
export function createTimestamp(): number {
  return Date.now();
}