// Content Core — Outbox Infrastructure
// Distributed lock, claim/renew/deliver/fail pattern for at-least-once delivery

function generateId(): string { return crypto.randomUUID(); }
import type { OutboxEvent, DomainEvent } from '../domain/listing';
import type { OutboxEventStatus } from '../domain/listing';

// ============================================================================
// Outbox Types
// ============================================================================

export type { OutboxEventStatus };
export type LockResult =
  | { acquired: true; event: OutboxEvent }
  | { acquired: false; reason: 'already_locked' | 'not_found' | 'wrong_status' };

export interface OutboxConfig {
  leaseSeconds: number;
  maxAttempts: number;
  baseRetryDelayMs: number;
  maxRetryDelayMs: number;
  deadLetterAfterAttempts: number;
}

export const DEFAULT_OUTBOX_CONFIG: OutboxConfig = {
  leaseSeconds: 30,
  maxAttempts: 5,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 60000,
  deadLetterAfterAttempts: 5,
};

// ============================================================================
// Outbox Event Creation
// ============================================================================

export interface CreateOutboxEventInput<T = unknown> {
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  payload: T;
  idempotencyKey?: string;
}

export function createOutboxEvent<T = unknown>(
  input: CreateOutboxEventInput<T>
): OutboxEvent {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    aggregateVersion: input.aggregateVersion,
    eventType: input.eventType,
    payload: input.payload,
    status: 'pending',
    workerId: null,
    attemptCount: 0,
    maxAttempts: DEFAULT_OUTBOX_CONFIG.maxAttempts,
    nextAttemptAt: now,
    lastError: null,
    createdAt: now,
    processedAt: null,
  };
}

export function createOutboxEventFromDomainEvent<T = unknown>(
  event: DomainEvent<T>,
  idempotencyKey?: string
): OutboxEvent {
  return createOutboxEvent({
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    aggregateVersion: event.eventVersion,
    eventType: event.eventType,
    payload: event.payload,
    idempotencyKey: idempotencyKey ?? event.eventId,
  });
}

// ============================================================================
// Distributed Lock
// ============================================================================

export function tryAcquireLock(
  event: OutboxEvent,
  workerId: string,
  _lockTTLMs: number
): LockResult {
  if (event.workerId && event.workerId !== workerId) {
    return { acquired: false, reason: 'already_locked' };
  }

  if (event.status !== 'pending' && event.status !== 'retry') {
    return { acquired: false, reason: 'wrong_status' };
  }

  const lockedEvent: OutboxEvent = {
    ...event,
    status: 'processing',
    workerId,
    attemptCount: event.attemptCount + 1,
  };

  return { acquired: true, event: lockedEvent };
}

export function releaseLock(event: OutboxEvent, workerId: string): OutboxEvent {
  if (event.workerId !== workerId) {
    return event;
  }

  return {
    ...event,
    status: 'pending',
    workerId: null,
  };
}

// ============================================================================
// Event Selection
// ============================================================================

export interface SelectNextEventResult {
  selected: true;
  event: OutboxEvent;
  lockResult: LockResult;
  reason: string;
}

export function selectNextEvent(
  events: OutboxEvent[],
  workerId: string,
  lockTTLMs: number
): { selected: false; reason: 'no_events' } | SelectNextEventResult {
  const eligible = events
    .filter((e) => e.status === 'pending' || e.status === 'retry')
    .filter((e) => new Date(e.nextAttemptAt) <= new Date())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (eligible.length === 0) {
    return { selected: false, reason: 'no_events' };
  }

  for (const event of eligible) {
    const lockResult = tryAcquireLock(event, workerId, lockTTLMs);
    if (lockResult.acquired) {
      return {
        selected: true,
        event: lockResult.event,
        lockResult,
        reason: 'acquired',
      };
    }
  }

  return { selected: false, reason: 'no_events' };
}

// ============================================================================
// Event Delivery
// ============================================================================

export function markDelivered(
  event: OutboxEvent,
  workerId: string
): { success: boolean; event: OutboxEvent } {
  if (event.workerId !== workerId) {
    return { success: false, event };
  }

  const now = new Date().toISOString();
  return {
    success: true,
    event: {
      ...event,
      status: 'completed',
      processedAt: now,
      workerId: null,
    },
  };
}

export function markFailed(
  event: OutboxEvent,
  workerId: string,
  error: string,
  config: OutboxConfig
): { success: boolean; event: OutboxEvent; shouldDeadLetter: boolean } {
  if (event.workerId !== workerId) {
    return { success: false, event, shouldDeadLetter: false };
  }

  const attemptCount = event.attemptCount;

  if (attemptCount >= config.deadLetterAfterAttempts) {
    return {
      success: true,
      event: {
        ...event,
        status: 'dead_letter',
        lastError: error,
        workerId: null,
      },
      shouldDeadLetter: true,
    };
  }

  const delayMs = Math.min(
    config.baseRetryDelayMs * Math.pow(2, attemptCount - 1),
    config.maxRetryDelayMs
  );
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

  return {
    success: true,
    event: {
      ...event,
      status: 'retry',
      lastError: error,
      nextAttemptAt,
      workerId: null,
    },
    shouldDeadLetter: false,
  };
}

// ============================================================================
// Outbox Metrics
// ============================================================================

export interface OutboxMetrics {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  deadLetter: number;
  retry: number;
  oldestPendingAgeMs: number | null;
  averageAttempts: number;
}

export function computeOutboxMetrics(events: OutboxEvent[]): OutboxMetrics {
  const now = Date.now();
  const pending = events.filter((e) => e.status === 'pending');
  const processing = events.filter((e) => e.status === 'processing');
  const completed = events.filter((e) => e.status === 'completed');
  const deadLetter = events.filter((e) => e.status === 'dead_letter');
  const retry = events.filter((e) => e.status === 'retry');

  const oldestPendingAgeMs = pending.length > 0
    ? now - new Date(pending[0].createdAt).getTime()
    : null;

  const totalAttempts = events.reduce((sum, e) => sum + e.attemptCount, 0);
  const averageAttempts = events.length > 0 ? totalAttempts / events.length : 0;

  return {
    total: events.length,
    pending: pending.length,
    processing: processing.length,
    completed: completed.length,
    deadLetter: deadLetter.length,
    retry: retry.length,
    oldestPendingAgeMs,
    averageAttempts,
  };
}
