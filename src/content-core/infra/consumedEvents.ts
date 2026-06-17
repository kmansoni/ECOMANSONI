// Content Core — Consumed Events (Consumer Idempotency)
// Ensures at-least-once delivery is applied exactly once

function generateId() { return crypto.randomUUID(); }
import type { ConsumedEvent } from '../domain/listing';

// ============================================================================
// Consumed Event Types
// ============================================================================

export interface CreateConsumedEventInput {
  consumerName: string;
  eventId: string;
  idempotencyKey: string;
}

export interface ConsumedEventFilter {
  consumerName?: string;
  eventId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
}

// ============================================================================
// Consumed Event Creation
// ============================================================================

export function createConsumedEvent(input: CreateConsumedEventInput): ConsumedEvent {
  return {
    consumerName: input.consumerName,
    eventId: input.eventId,
    idempotencyKey: input.idempotencyKey,
    processedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Idempotency Check
// ============================================================================

export interface IdempotencyCheckResult {
  alreadyConsumed: boolean;
  consumedEvent?: ConsumedEvent;
}

export function checkIdempotency(
  consumedEvents: ConsumedEvent[],
  consumerName: string,
  eventId: string
): IdempotencyCheckResult {
  const existing = consumedEvents.find(
    (e) => e.consumerName === consumerName && e.eventId === eventId
  );

  if (existing) {
    return { alreadyConsumed: true, consumedEvent: existing };
  }

  return { alreadyConsumed: false };
}

// ============================================================================
// Idempotency Key Generation
// ============================================================================

export function generateIdempotencyKey(
  consumerName: string,
  eventId: string,
  context?: Record<string, unknown>
): string {
  const parts = [consumerName, eventId];

  if (context) {
    const sortedKeys = Object.keys(context).sort();
    for (const key of sortedKeys) {
      parts.push(`${key}:${String(context[key])}`);
    }
  }

  return parts.join('|');
}

// ============================================================================
// Consumer State Management
// ============================================================================

export interface ConsumerState {
  consumerName: string;
  lastProcessedEventId: string | null;
  lastProcessedAt: string | null;
  processedCount: number;
  skippedCount: number;
  errorCount: number;
  lastError: string | null;
}

export function createConsumerState(consumerName: string): ConsumerState {
  const now = new Date().toISOString();
  return {
    consumerName,
    lastProcessedEventId: null,
    lastProcessedAt: null,
    processedCount: 0,
    skippedCount: 0,
    errorCount: 0,
    lastError: null,
  };
}

export function recordSuccessfulProcess(
  state: ConsumerState,
  eventId: string
): ConsumerState {
  return {
    ...state,
    lastProcessedEventId: eventId,
    lastProcessedAt: new Date().toISOString(),
    processedCount: state.processedCount + 1,
  };
}

export function recordSkippedProcess(
  state: ConsumerState,
  eventId: string
): ConsumerState {
  return {
    ...state,
    lastProcessedEventId: eventId,
    lastProcessedAt: new Date().toISOString(),
    skippedCount: state.skippedCount + 1,
  };
}

export function recordFailedProcess(
  state: ConsumerState,
  eventId: string,
  error: string
): ConsumerState {
  return {
    ...state,
    lastProcessedEventId: eventId,
    lastProcessedAt: new Date().toISOString(),
    errorCount: state.errorCount + 1,
    lastError: error,
  };
}

// ============================================================================
// Consumer Metrics
// ============================================================================

export interface ConsumerMetrics {
  consumerName: string;
  processedCount: number;
  skippedCount: number;
  errorCount: number;
  totalProcessed: number;
  successRate: number;
  errorRate: number;
  lastProcessedAt: string | null;
  lastError: string | null;
}

export function computeConsumerMetrics(
  state: ConsumerState
): ConsumerMetrics {
  const totalProcessed = state.processedCount + state.skippedCount;
  const successRate = totalProcessed > 0
    ? state.processedCount / totalProcessed
    : 0;
  const errorRate = totalProcessed > 0
    ? state.errorCount / totalProcessed
    : 0;

  return {
    consumerName: state.consumerName,
    processedCount: state.processedCount,
    skippedCount: state.skippedCount,
    errorCount: state.errorCount,
    totalProcessed,
    successRate,
    errorRate,
    lastProcessedAt: state.lastProcessedAt,
    lastError: state.lastError,
  };
}

// ============================================================================
// Batch Processing with Idempotency
// ============================================================================

export interface BatchProcessResult<T> {
  processed: T[];
  skipped: { eventId: string; reason: string }[];
  failed: { eventId: string; error: string }[];
}

export async function processBatchWithIdempotency<T>(
  events: Array<{ eventId: string; payload: unknown }>,
  consumerName: string,
  consumedEvents: ConsumedEvent[],
  handler: (event: { eventId: string; payload: unknown }) => Promise<T>
): Promise<BatchProcessResult<T>> {
  const processed: T[] = [];
  const skipped: { eventId: string; reason: string }[] = [];
  const failed: { eventId: string; error: string }[] = [];

  for (const event of events) {
    const idempotencyCheck = checkIdempotency(consumedEvents, consumerName, event.eventId);

    if (idempotencyCheck.alreadyConsumed) {
      skipped.push({
        eventId: event.eventId,
        reason: 'Already processed',
      });
      continue;
    }

    try {
      const result = await handler(event);
      processed.push(result);
    } catch (error) {
      failed.push({
        eventId: event.eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed, skipped, failed };
}

// ============================================================================
// Cleanup Old Consumed Events
// ============================================================================

export interface CleanupResult {
  deletedCount: number;
  deletedBefore: string;
}

export function filterOldConsumedEvents(
  events: ConsumedEvent[],
  retentionDays: number
): ConsumedEvent[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffIso = cutoffDate.toISOString();

  return events.filter((e) => e.processedAt > cutoffIso);
}

export function getCleanupCandidates(
  events: ConsumedEvent[],
  retentionDays: number
): { toDelete: ConsumedEvent[]; kept: ConsumedEvent[] } {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffIso = cutoffDate.toISOString();

  const toDelete: ConsumedEvent[] = [];
  const kept: ConsumedEvent[] = [];

  for (const event of events) {
    if (event.processedAt <= cutoffIso) {
      toDelete.push(event);
    } else {
      kept.push(event);
    }
  }

  return { toDelete, kept };
}
