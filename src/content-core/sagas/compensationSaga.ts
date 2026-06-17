// Content Core — Compensation Saga
// Saga state machine for handling rejections with compensation steps

function generateId() { return crypto.randomUUID(); }
import type { CompensationSaga, CompensationStep, SagaStatus, SagaStepStatus } from '../domain/listing';

// ============================================================================
// Saga Types (re-exported and extended)
// ============================================================================

export type SagaTriggerEvent =
  | 'ListingRejected'
  | 'ListingQuarantined'
  | 'PublicationRejected'
  | 'PublicationQuarantined'
  | 'AssetRejected'
  | 'ModerationDecisionFailed';

export interface SagaStepDefinition {
  name: string;
  stepOrder: number;
  actionType: 'UPDATE_STATUS' | 'DELETE_ROW' | 'SEND_NOTIFICATION' | 'CALL_EXTERNAL' | 'WRITE_AUDIT';
  targetTable: string | null;
  targetIdField: string | null;
  maxRetries: number;
  compensationAction?: 'RESTORE_STATUS' | 'DELETE_ROW' | 'CALL_EXTERNAL';
}

export interface SagaExecutionContext {
  sagaId: string;
  triggerEventId: string;
  triggerReason: string;
  containerId: string;
  authorId: string;
  assetId?: string;
  contentItemId?: string;
  policyDecision?: {
    decision: string;
    distribution: string;
  };
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Saga Step Definitions
// ============================================================================

export const LISTING_REJECTION_STEPS: SagaStepDefinition[] = [
  {
    name: 'suspend_listing',
    stepOrder: 1,
    actionType: 'UPDATE_STATUS',
    targetTable: 'listings',
    targetIdField: 'id',
    maxRetries: 3,
    compensationAction: 'RESTORE_STATUS',
  },
  {
    name: 'suspend_promo_publications',
    stepOrder: 2,
    actionType: 'UPDATE_STATUS',
    targetTable: 'publications',
    targetIdField: 'listing_id',
    maxRetries: 3,
    compensationAction: 'RESTORE_STATUS',
  },
  {
    name: 'withdraw_distribution',
    stepOrder: 3,
    actionType: 'CALL_EXTERNAL',
    targetTable: null,
    targetIdField: null,
    maxRetries: 3,
    compensationAction: 'CALL_EXTERNAL',
  },
  {
    name: 'deindex_search',
    stepOrder: 4,
    actionType: 'CALL_EXTERNAL',
    targetTable: null,
    targetIdField: null,
    maxRetries: 2,
    compensationAction: 'CALL_EXTERNAL',
  },
  {
    name: 'notify_author',
    stepOrder: 5,
    actionType: 'SEND_NOTIFICATION',
    targetTable: null,
    targetIdField: null,
    maxRetries: 5,
  },
  {
    name: 'log_transition',
    stepOrder: 6,
    actionType: 'WRITE_AUDIT',
    targetTable: 'container_lifecycle_logs',
    targetIdField: 'id',
    maxRetries: 0,
  },
];

export const PUBLICATION_REJECTION_STEPS: SagaStepDefinition[] = [
  {
    name: 'suspend_publication',
    stepOrder: 1,
    actionType: 'UPDATE_STATUS',
    targetTable: 'publications',
    targetIdField: 'id',
    maxRetries: 3,
    compensationAction: 'RESTORE_STATUS',
  },
  {
    name: 'withdraw_from_feeds',
    stepOrder: 2,
    actionType: 'CALL_EXTERNAL',
    targetTable: null,
    targetIdField: null,
    maxRetries: 3,
    compensationAction: 'CALL_EXTERNAL',
  },
  {
    name: 'notify_author',
    stepOrder: 3,
    actionType: 'SEND_NOTIFICATION',
    targetTable: null,
    targetIdField: null,
    maxRetries: 5,
  },
  {
    name: 'log_transition',
    stepOrder: 4,
    actionType: 'WRITE_AUDIT',
    targetTable: 'container_lifecycle_logs',
    targetIdField: 'id',
    maxRetries: 0,
  },
];

// ============================================================================
// Saga Factory
// ============================================================================

export function createCompensationSaga(
  triggerEventId: string,
  triggerReason: string,
  context: SagaExecutionContext,
  steps: SagaStepDefinition[]
): CompensationSaga {
  const now = new Date().toISOString();

  const sagaSteps: CompensationStep[] = steps.map((step) => ({
    name: step.name,
    stepOrder: step.stepOrder,
    status: 'pending',
    targetTable: step.targetTable,
    targetId: null,
    rollbackPayload: {},
    actionType: step.actionType,
    retryCount: 0,
    maxRetries: step.maxRetries,
    lastError: null,
    attemptedAt: null,
    completedAt: null,
  }));

  return {
    id: generateId(),
    sagaType: 'compensation',
    triggerEventId,
    triggerReason,
    status: 'running',
    context: context as Record<string, unknown>,
    containerId: context.containerId,
    assetId: context.assetId ?? null,
    contentItemId: context.contentItemId ?? null,
    steps: sagaSteps,
    currentStep: 0,
    retryCount: 0,
    lastError: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// ============================================================================
// Saga State Machine
// ============================================================================

export interface SagaExecutionResult {
  saga: CompensationSaga;
  step: CompensationStep | null;
  completed: boolean;
  requiresManualReview: boolean;
}

export function executeNextSagaStep(saga: CompensationSaga): SagaExecutionResult {
  if (saga.status !== 'running') {
    return {
      saga,
      step: null,
      completed: false,
      requiresManualReview: saga.status === 'requires_manual_review',
    };
  }

  // Find next pending step
  const nextStepIndex = saga.steps.findIndex((s) => s.status === 'pending');
  if (nextStepIndex === -1) {
    // All steps completed
    const completedSaga = completeSaga(saga);
    return {
      saga: completedSaga,
      step: null,
      completed: true,
      requiresManualReview: false,
    };
  }

  const now = new Date().toISOString();
  const updatedSteps = [...saga.steps];
  updatedSteps[nextStepIndex] = {
    ...updatedSteps[nextStepIndex],
    status: 'in_progress',
    attemptedAt: now,
  };

  return {
    saga: {
      ...saga,
      steps: updatedSteps,
      currentStep: nextStepIndex,
      updatedAt: now,
    },
    step: updatedSteps[nextStepIndex],
    completed: false,
    requiresManualReview: false,
  };
}

export function completeSagaStep(
  saga: CompensationSaga,
  stepName: string,
  targetId: string,
  result: Record<string, unknown>
): CompensationSaga {
  const stepIndex = saga.steps.findIndex((s) => s.name === stepName);
  if (stepIndex === -1) return saga;

  const now = new Date().toISOString();
  const updatedSteps = [...saga.steps];
  updatedSteps[stepIndex] = {
    ...updatedSteps[stepIndex],
    status: 'completed',
    targetId,
    rollbackPayload: result,
    completedAt: now,
  };

  return {
    ...saga,
    steps: updatedSteps,
    updatedAt: now,
  };
}

export function failSagaStep(
  saga: CompensationSaga,
  stepName: string,
  error: string
): CompensationSaga {
  const stepIndex = saga.steps.findIndex((s) => s.name === stepName);
  if (stepIndex === -1) return saga;

  const step = saga.steps[stepIndex];
  const newRetryCount = step.retryCount + 1;
  const now = new Date().toISOString();

  // Check if should retry
  if (newRetryCount < step.maxRetries) {
    const updatedSteps = [...saga.steps];
    updatedSteps[stepIndex] = {
      ...step,
      status: 'pending',
      retryCount: newRetryCount,
      lastError: error,
    };

    return {
      ...saga,
      steps: updatedSteps,
      retryCount: saga.retryCount + 1,
      updatedAt: now,
    };
  }

  // Max retries exceeded → requires manual review
  const updatedSteps = [...saga.steps];
  updatedSteps[stepIndex] = {
    ...step,
    status: 'failed',
    retryCount: newRetryCount,
    lastError: error,
  };

  return {
    ...saga,
    steps: updatedSteps,
    status: 'requires_manual_review',
    lastError: error,
    updatedAt: now,
  };
}

export function skipSagaStep(
  saga: CompensationSaga,
  stepName: string,
  reason: string
): CompensationSaga {
  const stepIndex = saga.steps.findIndex((s) => s.name === stepName);
  if (stepIndex === -1) return saga;

  const now = new Date().toISOString();
  const updatedSteps = [...saga.steps];
  updatedSteps[stepIndex] = {
    ...updatedSteps[stepIndex],
    status: 'skipped',
    lastError: reason,
    completedAt: now,
  };

  return {
    ...saga,
    steps: updatedSteps,
    updatedAt: now,
  };
}

export function completeSaga(saga: CompensationSaga): CompensationSaga {
  const now = new Date().toISOString();
  return {
    ...saga,
    status: 'completed',
    completedAt: now,
    updatedAt: now,
  };
}

export function failSaga(saga: CompensationSaga, error: string): CompensationSaga {
  const now = new Date().toISOString();
  return {
    ...saga,
    status: 'failed',
    lastError: error,
    updatedAt: now,
  };
}

export function requireManualReview(saga: CompensationSaga, reason: string): CompensationSaga {
  const now = new Date().toISOString();
  return {
    ...saga,
    status: 'requires_manual_review',
    lastError: reason,
    updatedAt: now,
  };
}

// ============================================================================
// Saga Deduplication
// ============================================================================

export function canStartNewSaga(
  existingSagas: CompensationSaga[],
  triggerEventId: string
): boolean {
  // Check if saga for this event already exists and is not dead letter
  const existing = existingSagas.find(
    (s) =>
      s.triggerEventId === triggerEventId &&
      s.status !== 'dead_letter'
  );

  return !existing;
}

export function getExistingSaga(
  sagas: CompensationSaga[],
  triggerEventId: string
): CompensationSaga | null {
  return sagas.find(
    (s) =>
      s.triggerEventId === triggerEventId &&
      s.status !== 'dead_letter'
  ) ?? null;
}

// ============================================================================
// Saga Queries
// ============================================================================

export interface SagaFilter {
  status?: SagaStatus;
  containerId?: string;
  authorId?: string;
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}

export function filterSagas(
  sagas: CompensationSaga[],
  filter: SagaFilter
): CompensationSaga[] {
  return sagas.filter((saga) => {
    if (filter.status && saga.status !== filter.status) return false;
    if (filter.containerId && saga.containerId !== filter.containerId) return false;
    if (filter.authorId && saga.context.authorId !== filter.authorId) return false;
    if (filter.fromDate && saga.startedAt && saga.startedAt < filter.fromDate) return false;
    if (filter.toDate && saga.startedAt && saga.startedAt > filter.toDate) return false;
    return true;
  });
}

export function getSagaProgress(saga: CompensationSaga): {
  completedSteps: number;
  totalSteps: number;
  percentComplete: number;
  currentStepName: string | null;
  failedStepName: string | null;
} {
  const completedSteps = saga.steps.filter(
    (s) => s.status === 'completed' || s.status === 'skipped'
  ).length;
  const totalSteps = saga.steps.length;
  const percentComplete = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  const failedStep = saga.steps.find((s) => s.status === 'failed');
  const currentStep = saga.steps.find(
    (s) => s.status === 'pending' || s.status === 'in_progress'
  );

  return {
    completedSteps,
    totalSteps,
    percentComplete,
    currentStepName: currentStep?.name ?? null,
    failedStepName: failedStep?.name ?? null,
  };
}

// ============================================================================
// Saga Metrics
// ============================================================================

export interface SagaMetrics {
  total: number;
  running: number;
  completed: number;
  failed: number;
  requiresManualReview: number;
  deadLetter: number;
  averageDurationMs: number | null;
  successRate: number;
}

export function computeSagaMetrics(sagas: CompensationSaga[]): SagaMetrics {
  const running = sagas.filter((s) => s.status === 'running').length;
  const completed = sagas.filter((s) => s.status === 'completed').length;
  const failed = sagas.filter((s) => s.status === 'failed').length;
  const requiresManualReview = sagas.filter((s) => s.status === 'requires_manual_review').length;
  const deadLetter = sagas.filter((s) => s.status === 'dead_letter').length;

  const completedWithDuration = sagas.filter(
    (s) => s.status === 'completed' && s.startedAt && s.completedAt
  );

  let averageDurationMs: number | null = null;
  if (completedWithDuration.length > 0) {
    const totalMs = completedWithDuration.reduce((sum, s) => {
      const start = new Date(s.startedAt!).getTime();
      const end = new Date(s.completedAt!).getTime();
      return sum + (end - start);
    }, 0);
    averageDurationMs = totalMs / completedWithDuration.length;
  }

  const terminalSagas = completed + failed + deadLetter;
  const successRate = terminalSagas > 0 ? completed / terminalSagas : 0;

  return {
    total: sagas.length,
    running,
    completed,
    failed,
    requiresManualReview,
    deadLetter,
    averageDurationMs,
    successRate,
  };
}