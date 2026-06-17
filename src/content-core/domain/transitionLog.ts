// Content Core — Lifecycle Transition Log
// Transaction-safe logging of state transitions with idempotency

function generateId() { return crypto.randomUUID(); }
import type { LifecycleTransitionLog, ActorType, DomainEvent } from './listing';

// ============================================================================
// Transition Log Types
// ============================================================================

export type EntityType = 'listing' | 'publication' | 'asset' | 'campaign' | 'saga';

export interface TransitionLogEntry {
  entityType: EntityType;
  entityId: string;
  fromStatus: string;
  toStatus: string;
  actorType: ActorType;
  actorId: string;
  reason: string;
  idempotencyKey: string;
  policyDecisionId: string | null;
  moderationDecisionId: string | null;
  requestId: string;
  metadata: Record<string, unknown>;
}

export interface CreateTransitionLogInput {
  entityType: EntityType;
  entityId: string;
  fromStatus: string;
  toStatus: string;
  actorType: ActorType;
  actorId: string;
  reason: string;
  policyDecisionId?: string | null;
  moderationDecisionId?: string | null;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Idempotent Transition Log Creation
// ============================================================================

export function createTransitionLogEntry(
  input: CreateTransitionLogInput
): LifecycleTransitionLog {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    entityType: input.entityType,
    entityId: input.entityId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    actorType: input.actorType,
    actorId: input.actorId,
    reason: input.reason,
    policyDecisionId: input.policyDecisionId ?? null,
    moderationDecisionId: input.moderationDecisionId ?? null,
    requestId: input.requestId ?? generateId(),
    createdAt: now,
  };
}

// ============================================================================
// Transition Log from Domain Event
// ============================================================================

export function createTransitionLogFromEvent(
  event: DomainEvent,
  fromStatus: string,
  toStatus: string,
  actorId: string,
  actorType: ActorType,
  reason: string,
  policyDecisionId?: string | null,
  moderationDecisionId?: string | null
): LifecycleTransitionLog {
  const entityType = mapAggregateTypeToEntity(event.aggregateType);
  return createTransitionLogEntry({
    entityType,
    entityId: event.aggregateId,
    fromStatus,
    toStatus,
    actorType,
    actorId,
    reason,
    requestId: event.causationId,
    policyDecisionId: policyDecisionId ?? null,
    moderationDecisionId: moderationDecisionId ?? null,
    metadata: {
      eventId: event.eventId,
      eventType: event.eventType,
      eventVersion: event.eventVersion,
    },
  });
}

function mapAggregateTypeToEntity(aggregateType: string): EntityType {
  const mapping: Record<string, EntityType> = {
    listing: 'listing',
    publication: 'publication',
    asset: 'asset',
    campaign: 'campaign',
    saga: 'saga',
    moderation_case: 'asset', // Moderation cases log against the asset
  };
  return mapping[aggregateType] ?? 'asset';
}

// ============================================================================
// Transition Log Queries
// ============================================================================

export interface TransitionLogFilter {
  entityType?: EntityType;
  entityId?: string;
  actorId?: string;
  fromStatus?: string;
  toStatus?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export function buildTransitionLogFilter(
  filter: TransitionLogFilter
): {
  where: string[];
  params: unknown[];
  orderBy: string;
  limit: number;
  offset: number;
} {
  const where: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filter.entityType) {
    where.push(`entity_type = $${paramIndex++}`);
    params.push(filter.entityType);
  }
  if (filter.entityId) {
    where.push(`entity_id = $${paramIndex++}`);
    params.push(filter.entityId);
  }
  if (filter.actorId) {
    where.push(`actor_id = $${paramIndex++}`);
    params.push(filter.actorId);
  }
  if (filter.fromStatus) {
    where.push(`from_status = $${paramIndex++}`);
    params.push(filter.fromStatus);
  }
  if (filter.toStatus) {
    where.push(`to_status = $${paramIndex++}`);
    params.push(filter.toStatus);
  }
  if (filter.fromDate) {
    where.push(`created_at >= $${paramIndex++}`);
    params.push(filter.fromDate);
  }
  if (filter.toDate) {
    where.push(`created_at <= $${paramIndex++}`);
    params.push(filter.toDate);
  }

  return {
    where,
    params,
    orderBy: 'created_at DESC',
    limit: filter.limit ?? 100,
    offset: filter.offset ?? 0,
  };
}

// ============================================================================
// Transition History Reconstruction
// ============================================================================

export interface TransitionHistoryItem {
  status: string;
  timestamp: string;
  actorType: ActorType;
  actorId: string;
  reason: string;
}

export function reconstructTransitionHistory(
  logs: LifecycleTransitionLog[]
): TransitionHistoryItem[] {
  return logs
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((log) => ({
      status: log.toStatus,
      timestamp: log.createdAt,
      actorType: log.actorType,
      actorId: log.actorId,
      reason: log.reason,
    }));
}

// ============================================================================
// Current Status from History
// ============================================================================

export function getCurrentStatusFromHistory(
  logs: LifecycleTransitionLog[]
): { status: string; timestamp: string } | null {
  if (logs.length === 0) return null;

  const sorted = [...logs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return {
    status: sorted[0].toStatus,
    timestamp: sorted[0].createdAt,
  };
}

// ============================================================================
// Transition Validation
// ============================================================================

export interface TransitionValidationResult {
  valid: boolean;
  violations: string[];
}

export function validateTransition(
  logs: LifecycleTransitionLog[],
  expectedFromStatus: string,
  expectedToStatus: string
): TransitionValidationResult {
  const violations: string[] = [];

  if (logs.length === 0) {
    violations.push('No transition history found');
    return { valid: false, violations };
  }

  const latestLog = logs.reduce((latest, log) =>
    new Date(log.createdAt) > new Date(latest.createdAt) ? log : latest
  );

  if (latestLog.toStatus !== expectedFromStatus) {
    violations.push(
      `Expected current status to be '${expectedFromStatus}', but found '${latestLog.toStatus}'`
    );
  }

  // Check for duplicate transition
  const duplicateExists = logs.some(
    (log) =>
      log.fromStatus === expectedFromStatus &&
      log.toStatus === expectedToStatus
  );

  if (duplicateExists) {
    violations.push('This transition has already been recorded');
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// ============================================================================
// Audit Report Generation
// ============================================================================

export interface AuditReport {
  entityType: EntityType;
  entityId: string;
  totalTransitions: number;
  statusHistory: TransitionHistoryItem[];
  lastTransition: TransitionHistoryItem | null;
  transitionsByActor: Record<ActorType, number>;
  createdAt: string;
  generatedAt: string;
}

export function generateAuditReport(
  logs: LifecycleTransitionLog[]
): AuditReport | null {
  if (logs.length === 0) return null;

  const entityType = logs[0].entityType;
  const entityId = logs[0].entityId;

  const transitionsByActor: Record<ActorType, number> = {
    user: 0,
    service: 0,
    system: 0,
    moderation: 0,
    policy: 0,
  };

  for (const log of logs) {
    transitionsByActor[log.actorType]++;
  }

  const history = reconstructTransitionHistory(logs);

  return {
    entityType,
    entityId,
    totalTransitions: logs.length,
    statusHistory: history,
    lastTransition: history[history.length - 1] ?? null,
    transitionsByActor,
    createdAt: logs[0].createdAt,
    generatedAt: new Date().toISOString(),
  };
}