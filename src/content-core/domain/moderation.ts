// Content Core вЂ” Moderation Domain Model
// Two-stage moderation pipeline, policy decisions, appeal workflow

function generateId(): string { return crypto.randomUUID(); }
import type {
  ModerationCase,
  ModerationDecision,
  ModerationStage,
  PolicyDecision,
  PolicyDecisionResult,
  DistributionLevel,
  Visibility,
  DomainEvent,
} from './listing';

// ============================================================================
// Moderation Types
// ============================================================================

export type ModerationCaseStatus =
  | 'pending'
  | 'approved'
  | 'limited'
  | 'rejected'
  | 'quarantine'
  | 'error'
  | 'superseded';

export type ReviewPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ModerationAlgorithm =
  | 'hash_lookup'
  | 'csam_detector'
  | 'nsfw_classifier'
  | 'deepfake_detector'
  | 'context_analyzer'
  | 'copyright_checker'
  | 'text_safety'
  | 'human_review';

export interface ModerationFlag {
  code: string;
  category: 'critical' | 'safety' | 'quality' | 'copyright' | 'policy';
  confidence: number;
  description: string;
  detectedAt: string;
}

export interface ModerationSignal {
  algorithm: ModerationAlgorithm;
  flags: ModerationFlag[];
  overallConfidence: number;
  processingTimeMs: number;
  modelVersion: string;
}

// ============================================================================
// Two-Stage Moderation Pipeline
// ============================================================================

export interface ModerationPipelineConfig {
  fastStage: {
    enabled: boolean;
    timeoutMs: number;
    algorithms: ModerationAlgorithm[];
  };
  deepStage: {
    enabled: boolean;
    timeoutMs: number;
    algorithms: ModerationAlgorithm[];
    fallbackToHuman: boolean;
  };
  humanReview: {
    enabled: boolean;
    priorityRouting: boolean;
    autoEscalation: boolean;
  };
}

export const DEFAULT_MODERATION_PIPELINE: ModerationPipelineConfig = {
  fastStage: {
    enabled: true,
    timeoutMs: 5000,
    algorithms: ['hash_lookup', 'csam_detector', 'text_safety'],
  },
  deepStage: {
    enabled: true,
    timeoutMs: 30000,
    algorithms: ['nsfw_classifier', 'deepfake_detector', 'context_analyzer', 'copyright_checker'],
    fallbackToHuman: true,
  },
  humanReview: {
    enabled: true,
    priorityRouting: true,
    autoEscalation: true,
  },
};

// ============================================================================
// Policy Decision Matrix
// ============================================================================

const CRITICAL_FLAGS = [
  'csam',
  'child_exploitation',
  'terrorist_content',
  'illicit_drugs_manufacturing',
  'extreme_violence',
  'self_harm_instructions',
  'fraud_scam',
];

const HIGH_CONFIDENCE_FLAGS = ['nsfw', 'violence', 'hate_speech', 'harassment', 'misinformation'];
const MODERATE_CONFIDENCE_FLAGS = ['spam', 'misleading', 'low_quality', 'repetitive_content'];

export function computePolicyDecision(
  flags: string[],
  confidence: number,
  userVisibility: Visibility,
  contentType: string
): PolicyDecision {
  // Critical flags в†’ immediate quarantine, no appeal
  if (flags.some((f) => CRITICAL_FLAGS.includes(f))) {
    return {
      decision: 'QUARANTINE',
      distribution: 'author_only',
      reasons: flags.filter((f) => CRITICAL_FLAGS.includes(f)),
      appealable: false,
      appealDeadlineHours: 0,
      reviewPriority: 'urgent',
    };
  }

  // High confidence violation в†’ quarantine with appeal
  if (confidence > 0.9 && flags.some((f) => HIGH_CONFIDENCE_FLAGS.includes(f))) {
    return {
      decision: 'QUARANTINE',
      distribution: 'author_only',
      reasons: flags.filter((f) => HIGH_CONFIDENCE_FLAGS.includes(f)),
      appealable: true,
      appealDeadlineHours: 168,
      reviewPriority: 'high',
    };
  }

  // Moderate confidence в†’ limited distribution
  if (confidence > 0.7 || flags.some((f) => MODERATE_CONFIDENCE_FLAGS.includes(f))) {
    return {
      decision: 'LIMIT',
      distribution: 'followers',
      reasons: flags.filter((f) => MODERATE_CONFIDENCE_FLAGS.includes(f)),
      appealable: true,
      appealDeadlineHours: 72,
      reviewPriority: 'normal',
    };
  }

  // Low confidence or no flags в†’ allow
  return {
    decision: 'ALLOW',
    distribution: 'public',
    reasons: [],
    appealable: false,
    appealDeadlineHours: 0,
    reviewPriority: 'low',
  };
}

// ============================================================================
// Moderation Case Factory
// ============================================================================

export interface CreateModerationCaseInput {
  containerId: string;
  stage: ModerationStage;
  assetIds?: string[];
  contentHashes?: string[];
  flags?: string[];
  confidence?: number;
  algorithm?: ModerationAlgorithm;
}

export function createModerationCase(input: CreateModerationCaseInput): ModerationCase {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    containerId: input.containerId,
    stage: input.stage,
    status: 'pending',
    flags: input.flags ?? [],
    confidence: input.confidence ?? 0,
    algorithm: input.algorithm ?? 'hash_lookup',
    decision: null,
    reviewerId: null,
    decisionNotes: null,
    createdAt: now,
    decidedAt: null,
  };
}

// ============================================================================
// Moderation Case State Machine
// ============================================================================

export interface ModerationCaseTransitionResult {
  success: boolean;
  moderationCase: ModerationCase;
  policyDecision?: PolicyDecision;
  event?: DomainEvent;
  reason?: string;
}

export function decideModerationCase(
  moderationCase: ModerationCase,
  decision: ModerationDecision,
  reviewerId: string | null,
  decisionNotes: string | null,
  userVisibility: Visibility,
  contentType: string
): ModerationCaseTransitionResult {
  if (moderationCase.status !== 'pending') {
    return {
      success: false,
      moderationCase,
      reason: `Case ${moderationCase.id} is not in pending status`,
    };
  }

  const policyDecision = computePolicyDecision(
    moderationCase.flags,
    moderationCase.confidence,
    userVisibility,
    contentType
  );

  const now = new Date().toISOString();
  const updatedCase: ModerationCase = {
    ...moderationCase,
    status: mapDecisionToStatus(decision),
    decision,
    reviewerId,
    decisionNotes,
    decidedAt: now,
  };

  const eventType = mapDecisionToEventType(decision);
  const event: DomainEvent = {
    eventId: generateId(),
    aggregateType: 'moderation_case',
    aggregateId: moderationCase.id,
    eventType,
    eventVersion: 1,
    occurredAt: now,
    causationId: moderationCase.id,
    causationType: 'system_trigger',
    payload: {
      caseId: moderationCase.id,
      containerId: moderationCase.containerId,
      decision,
      policyDecision,
      reviewerId,
      decisionNotes,
    },
  };

  return {
    success: true,
    moderationCase: updatedCase,
    policyDecision,
    event,
  };
}

function mapDecisionToStatus(decision: ModerationDecision): ModerationCaseStatus {
  switch (decision) {
    case 'allow':
      return 'approved';
    case 'allow_with_limited_assets':
      return 'limited';
    case 'reject':
      return 'rejected';
    case 'quarantine':
    case 'requires_user_fix':
      return 'quarantine';
    default:
      return 'error';
  }
}

function mapDecisionToEventType(decision: ModerationDecision): string {
  switch (decision) {
    case 'allow':
      return 'ModerationCaseApproved';
    case 'allow_with_limited_assets':
      return 'ModerationCaseLimited';
    case 'reject':
      return 'ModerationCaseRejected';
    case 'quarantine':
      return 'ModerationCaseQuarantined';
    case 'requires_user_fix':
      return 'ModerationCaseRequiresFix';
    default:
      return 'ModerationCaseError';
  }
}

// ============================================================================
// Appeal Workflow
// ============================================================================

export type AppealStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'withdrawn';

export interface ModerationAppeal {
  id: string;
  moderationCaseId: string;
  containerId: string;
  authorId: string;
  status: AppealStatus;
  reason: string;
  additionalContext: string | null;
  reviewerId: string | null;
  reviewerNotes: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
}

export interface CreateAppealInput {
  moderationCaseId: string;
  containerId: string;
  authorId: string;
  reason: string;
  additionalContext?: string;
}

export function createAppeal(input: CreateAppealInput): ModerationAppeal {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    moderationCaseId: input.moderationCaseId,
    containerId: input.containerId,
    authorId: input.authorId,
    status: 'submitted',
    reason: input.reason,
    additionalContext: input.additionalContext ?? null,
    reviewerId: null,
    reviewerNotes: null,
    submittedAt: now,
    reviewedAt: null,
    expiresAt: null,
  };
}

export function canAppeal(appeal: ModerationAppeal, policyDecision: PolicyDecision): boolean {
  if (appeal.status !== 'submitted' && appeal.status !== 'under_review') return false;
  if (!policyDecision.appealable) return false;
  if (appeal.reviewedAt !== null) return false;
  if (appeal.expiresAt && new Date(appeal.expiresAt) < new Date()) return false;
  return true;
}

export function resolveAppeal(
  appeal: ModerationAppeal,
  newDecision: ModerationDecision,
  reviewerId: string,
  reviewerNotes: string
): ModerationAppeal {
  const now = new Date().toISOString();
  return {
    ...appeal,
    status: newDecision === 'allow' ? 'approved' : 'rejected',
    reviewerId,
    reviewerNotes,
    reviewedAt: now,
  };
}

// ============================================================================
// Fast Stage Processing
// ============================================================================

export interface FastStageResult {
  decision: ModerationDecision;
  flags: string[];
  confidence: number;
  requiresDeepScan: boolean;
  processingTimeMs: number;
}

export async function processFastStage(
  contentHashes: string[],
  assetIds: string[]
): Promise<FastStageResult> {
  const startTime = Date.now();
  const flags: string[] = [];
  let requiresDeepScan = false;

  // Hash lookup - check against known content databases
  for (const hash of contentHashes) {
    if (hash.startsWith('csam_') || hash.startsWith('known_violation_')) {
      flags.push('csam');
      requiresDeepScan = true;
    }
  }

  // Quick signal extraction
  if (flags.length === 0) {
    requiresDeepScan = true;
  }

  const processingTimeMs = Date.now() - startTime;

  if (flags.length === 0) {
    return {
      decision: 'allow',
      flags: [],
      confidence: 0.1,
      requiresDeepScan: true,
      processingTimeMs,
    };
  }

  const confidence = flags.includes('csam') ? 0.99 : 0.85;

  return {
    decision: confidence > 0.9 ? 'quarantine' : 'reject',
    flags,
    confidence,
    requiresDeepScan: false,
    processingTimeMs,
  };
}

// ============================================================================
// Deep Stage Processing
// ============================================================================

export interface DeepStageResult {
  decision: ModerationDecision;
  flags: string[];
  confidence: number;
  signals: ModerationSignal[];
  processingTimeMs: number;
}

export async function processDeepStage(
  assetIds: string[],
  signals: ModerationSignal[]
): Promise<DeepStageResult> {
  const startTime = Date.now();
  const allFlags: string[] = [];
  let maxConfidence = 0;

  for (const signal of signals) {
    allFlags.push(...signal.flags.map((f) => f.code));
    maxConfidence = Math.max(maxConfidence, signal.overallConfidence);
  }

  const processingTimeMs = Date.now() - startTime;

  if (allFlags.length === 0) {
    return {
      decision: 'allow',
      flags: [],
      confidence: 0.05,
      signals,
      processingTimeMs,
    };
  }

  // Aggregate decision based on all signals
  let decision: ModerationDecision;
  if (maxConfidence > 0.9) {
    decision = 'quarantine';
  } else if (maxConfidence > 0.7) {
    decision = 'allow_with_limited_assets';
  } else {
    decision = 'allow';
  }

  return {
    decision,
    flags: [...new Set(allFlags)],
    confidence: maxConfidence,
    signals,
    processingTimeMs,
  };
}

// ============================================================================
// Human Review Queue
// ============================================================================

export interface HumanReviewCase {
  appealId: string | null;
  moderationCaseId: string;
  containerId: string;
  authorId: string;
  priority: ReviewPriority;
  flags: string[];
  confidence: number;
  contentPreview: string;
  submittedAt: string;
  assignedTo: string | null;
  assignedAt: string | null;
  completedAt: string | null;
  decision: ModerationDecision | null;
  notes: string | null;
}

export function createHumanReviewCase(
  moderationCase: ModerationCase,
  policyDecision: PolicyDecision,
  contentPreview: string
): HumanReviewCase {
  return {
    appealId: null,
    moderationCaseId: moderationCase.id,
    containerId: moderationCase.containerId,
    authorId: '', // Set by caller
    priority: policyDecision.reviewPriority,
    flags: moderationCase.flags,
    confidence: moderationCase.confidence,
    contentPreview,
    submittedAt: new Date().toISOString(),
    assignedTo: null,
    assignedAt: null,
    completedAt: null,
    decision: null,
    notes: null,
  };
}

export function routeToHumanReviewQueue(
  case_: HumanReviewCase,
  queue: HumanReviewCase[]
): HumanReviewCase[] {
  const updatedQueue = [...queue.filter((c) => c.moderationCaseId !== case_.moderationCaseId)];
  updatedQueue.push(case_);
  return updatedQueue.sort((a, b) => {
    const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// ============================================================================
// Moderation Decision Events
// ============================================================================

export interface ModerationDecisionEvent {
  caseId: string;
  containerId: string;
  decision: ModerationDecision;
  distribution: DistributionLevel;
  visibility: Visibility;
  appealable: boolean;
  appealDeadlineHours: number;
  timestamp: string;
}

export function createModerationDecisionEvent(
  case_: ModerationCase,
  policyDecision: PolicyDecision
): DomainEvent<ModerationDecisionEvent> {
  return {
    eventId: generateId(),
    aggregateType: 'moderation_case',
    aggregateId: case_.id,
    eventType: 'ModerationDecisionIssued',
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    causationId: case_.id,
    causationType: 'system_trigger',
    payload: {
      caseId: case_.id,
      containerId: case_.containerId,
      decision: case_.decision ?? 'allow',
      distribution: policyDecision.distribution,
      visibility: policyDecision.distribution as Visibility,
      appealable: policyDecision.appealable,
      appealDeadlineHours: policyDecision.appealDeadlineHours,
      timestamp: new Date().toISOString(),
    },
  };
}

// ============================================================================
// Moderation Timeout в†’ Quarantine
// ============================================================================

export function isModerationTimedOut(
  moderationCase: ModerationCase,
  stage: ModerationStage,
  config: ModerationPipelineConfig
): boolean {
  const timeoutMs =
    stage === 'fast' ? config.fastStage.timeoutMs : config.deepStage.timeoutMs;
  const elapsedMs =
    Date.now() - new Date(moderationCase.createdAt).getTime();
  return elapsedMs > timeoutMs;
}

export function getTimedOutDecision(): ModerationDecision {
  // Timeout в†’ QUARANTINE, NEVER ALLOW
  return 'quarantine';
}
