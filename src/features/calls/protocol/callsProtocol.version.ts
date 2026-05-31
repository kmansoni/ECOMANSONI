/**
 * Protocol version — maintains wire compatibility between client and server.
 * Increment on breaking changes to WS message format.
 */

export const CALLS_PROTOCOL_VERSION = 1;

export const CALLS_PROTOCOL_FEATURES = [
  "e2ee",
  "rekey",
  "sfu",
  "reconnect",
] as const;

export type CallsProtocolFeature = typeof CALLS_PROTOCOL_FEATURES[number];