/**
 * WebSocket close policy for calls.
 * Defines which close codes are fatal vs retryable.
 */

export {
  CALLS_WS_FATAL_CLOSE_CODES,
  isCallsWsFatalCloseCode,
} from "@/calls-v2/callsWsClosePolicy";

export type { ConnectionState } from "@/calls-v2/types";