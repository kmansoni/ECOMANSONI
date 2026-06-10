/**
 * Call context for Sentry error attribution.
 *
 * This module provides a way to attach call metadata to all subsequent
 * logger calls, making it easy to attribute errors to specific calls
 * in Sentry.
 *
 * Usage:
 *   import { setCallContext, clearCallContext } from "@/lib/callContext";
 *
 *   // When a call starts
 *   setCallContext({ callId, roomId, engine: 'sfu' });
 *
 *   // When the call ends
 *   clearCallContext();
 *
 *   // All logger calls after setCallContext will include call metadata
 */

export interface CallContext {
  callId?: string;
  roomId?: string;
  engine?: 'sfu' | 'legacy';
  callType?: 'audio' | 'video';
  e2eeActive?: boolean;
  sfuEndpoint?: string;
}

// Global state for call context (module-level singleton)
let currentContext: CallContext = {};

export function setCallContext(context: Partial<CallContext>): void {
  currentContext = { ...currentContext, ...context };
}

export function getCallContext(): CallContext {
  return { ...currentContext };
}

export function clearCallContext(): void {
  currentContext = {};
}

/**
 * Get call context for Sentry tags.
 * Returns an object suitable for Sentry.setTag() calls.
 */
export function getSentryTags(): Record<string, string> {
  const tags: Record<string, string> = {};
  if (currentContext.callId) {
    tags.callId = currentContext.callId.slice(0, 8) + '...'; // Truncate for privacy
  }
  if (currentContext.roomId) {
    tags.roomId = currentContext.roomId.slice(0, 8) + '...';
  }
  if (currentContext.engine) {
    tags.callEngine = currentContext.engine;
  }
  if (currentContext.callType) {
    tags.callType = currentContext.callType;
  }
  if (currentContext.e2eeActive !== undefined) {
    tags.e2eeActive = String(currentContext.e2eeActive);
  }
  return tags;
}

/**
 * Get call context for Sentry extra data.
 * Returns an object suitable for Sentry.captureException() extra parameter.
 */
export function getSentryExtra(): Record<string, unknown> {
  return {
    callContext: {
      callId: currentContext.callId ?? null,
      roomId: currentContext.roomId ?? null,
      engine: currentContext.engine ?? null,
      callType: currentContext.callType ?? null,
      e2eeActive: currentContext.e2eeActive ?? null,
      sfuEndpoint: currentContext.sfuEndpoint ?? null,
    },
  };
}
