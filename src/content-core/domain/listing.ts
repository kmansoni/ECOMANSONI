// Content Core вЂ” Domain Models
// Publication & Listing Unified Domain Model v8

function generateId(): string { return crypto.randomUUID(); }

// ============================================================================
// Content Item (Aggregate Root)
// ============================================================================
export type ContentItemType = 'publication' | 'listing';
export type ListingType = 'real_estate' | 'insurance' | 'marketplace' | 'job' | 'event' | 'service';
export type ContentItemStatus =
  | 'draft'
  | 'pending_moderation'
  | 'moderation_pending'
  | 'published'
  | 'suspended_by_parent'
  | 'suspended'
  | 'quarantine'
  | 'rejected'
  | 'deleted';
export type Visibility = 'public' | 'followers' | 'close_friends' | 'private' | 'custom';

export interface ContentItem {
  id: string;
  authorId: string;
  itemType: ContentItemType;
  listingType: ListingType | null;
  status: ContentItemStatus;
  visibility: Visibility;
  aggregateVersion: number;
  idempotencyKey: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Content Asset Reference (shared across contexts)
// ============================================================================
export type AssetRole = 'primary' | 'gallery' | 'cover' | 'promo' | 'attachment';
export type ModerationStatus =
  | 'pending'
  | 'approved'
  | 'limited'
  | 'quarantine'
  | 'rejected'
  | 'processing_failed';

export interface ContentAssetReference {
  id: string;
  ownerType: 'publication' | 'listing' | 'campaign' | 'profile' | 'channel' | 'business_page';
  ownerId: string;
  assetId: string;
  role: AssetRole;
  sortOrder: number;
  moderationStatus: ModerationStatus;
  moderationCaseId: string | null;
  withdrawnAt: string | null;
  createdAt: string;
}

// ============================================================================
// Media Asset (shared entity)
// ============================================================================
export type MediaAssetStatus = 'processing' | 'ready' | 'flagged' | 'orphaned' | 'deleted';

export interface ContentHashes {
  sha256: string | null;
  phash: string | null;
  audioFingerprint: string | null;
  sceneHashes: string[];
}

export interface MediaMetadata {
  width: number | null;
  height: number | null;
  durationMs: number | null;
  fps: number | null;
  codec: string | null;
  bitrate: number | null;
  mimeType: string;
  sizeBytes: number;
  isAnimated: boolean;
}

export interface MediaVariant {
  id: string;
  assetId: string;
  variantType: string;
  path: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  quality: number | null;
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  ownerId: string;
  originalPath: string;
  hashes: ContentHashes;
  metadata: MediaMetadata;
  variants: MediaVariant[];
  status: MediaAssetStatus;
  updatedAt: string;
  createdAt: string;
}

// ============================================================================
// Moderation
// ============================================================================
export type ModerationDecision =
  | 'allow'
  | 'allow_with_limited_assets'
  | 'requires_user_fix'
  | 'reject'
  | 'quarantine';
export type ModerationStage = 'fast' | 'deep';

export interface ModerationCase {
  id: string;
  containerId: string;
  stage: ModerationStage;
  status: ModerationCaseStatus;
  flags: string[];
  confidence: number;
  algorithm: string;
  decision: ModerationDecision | null;
  reviewerId: string | null;
  decisionNotes: string | null;
  createdAt: string;
  decidedAt: string | null;
}

// ============================================================================
// Policy Contract
// ============================================================================
export type PolicyDecisionResult = 'ALLOW' | 'LIMIT' | 'QUARANTINE' | 'REJECT';
export type DistributionLevel = 'public' | 'followers' | 'close_friends' | 'author_only';

export interface PolicyDecision {
  decision: PolicyDecisionResult;
  distribution: DistributionLevel;
  reasons: string[];
  appealable: boolean;
  appealDeadlineHours: number;
  reviewPriority: 'low' | 'normal' | 'high' | 'urgent';
}

// ============================================================================
// Lifecycle Transition Log
// ============================================================================
export type ActorType = 'user' | 'service' | 'system' | 'moderation' | 'policy';

export interface LifecycleTransitionLog {
  id: string;
  entityType: 'listing' | 'publication' | 'asset' | 'campaign';
  entityId: string;
  fromStatus: string;
  toStatus: string;
  actorType: ActorType;
  actorId: string;
  reason: string;
  policyDecisionId: string | null;
  moderationDecisionId: string | null;
  requestId: string;
  createdAt: string;
}

// ============================================================================
// Domain Events
// ============================================================================
export interface DomainEvent<T = unknown> {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  causationId: string;
  causationType: 'user_action' | 'system_trigger' | 'scheduled';
  payload: T;
}

export interface ListingPublishedEvent {
  listingId: string;
  authorId: string;
  listingType: ListingType;
  visibility: Visibility;
  publishedAt: string;
}

export interface ListingRejectedEvent {
  listingId: string;
  reason: string;
  flags: string[];
  moderationCaseId: string;
}

export interface ListingDeletedEvent {
  listingId: string;
  authorId: string;
  reason: 'user_deleted' | 'moderation_rejected' | 'system_expired';
}

export interface ListingPriceChangedEvent {
  listingId: string;
  oldPrice: number | null;
  newPrice: number;
  changedAt: string;
}

// ============================================================================
// Outbox Events
// ============================================================================
export type OutboxEventStatus = 'pending' | 'processing' | 'completed' | 'retry' | 'dead_letter';

export interface OutboxEvent<T = unknown> {
  id: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  payload: T;
  status: OutboxEventStatus;
  workerId: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
}

// ============================================================================
// Consumed Events (consumer idempotency)
// ============================================================================
export interface ConsumedEvent {
  consumerName: string;
  eventId: string;
  idempotencyKey: string;
  processedAt: string;
}

// ============================================================================
// Compensation Saga
// ============================================================================
export type SagaStatus = 'running' | 'completed' | 'failed' | 'requires_manual_review' | 'dead_letter';
export type SagaStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed' | 'dead_letter';

export interface CompensationStep {
  name: string;
  stepOrder: number;
  status: SagaStepStatus;
  targetTable: string | null;
  targetId: string | null;
  rollbackPayload: Record<string, unknown>;
  actionType: 'UPDATE_STATUS' | 'DELETE_ROW' | 'SEND_NOTIFICATION' | 'CALL_EXTERNAL' | 'WRITE_AUDIT';
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  attemptedAt: string | null;
  completedAt: string | null;
}

export interface CompensationSaga {
  id: string;
  sagaType: string;
  triggerEventId: string;
  triggerReason: string;
  status: SagaStatus;
  context: Record<string, unknown>;
  containerId: string | null;
  assetId: string | null;
  contentItemId: string | null;
  steps: CompensationStep[];
  currentStep: number;
  retryCount: number;
  lastError: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Search Projection
// ============================================================================
export interface SearchListingProjection {
  listingId: string;
  aggregateVersion: number;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  location: string | null;
  listingType: ListingType;
  authorId: string;
  status: ContentItemStatus;
  visibility: Visibility;
  indexedAt: string;
}

// ============================================================================
// Visibility Resolution
// ============================================================================
const VISIBILITY_HIERARCHY: Record<Exclude<Visibility, 'author_only'>, number> = {
  'private': 1,
  'close_friends': 2,
  'followers': 3,
  'public': 4,
  'custom': 4,
};

export function resolveEffectiveVisibility(
  userRequested: Visibility,
  policyDistribution: string
): Visibility {
  const policyHierarchy = VISIBILITY_HIERARCHY[policyDistribution as Visibility] ?? 4;
  const userHierarchy = VISIBILITY_HIERARCHY[userRequested] ?? 4;
  return policyHierarchy <= userHierarchy ? userRequested : (policyDistribution as Visibility);
}

// ============================================================================
// Content Asset Aggregation
// ============================================================================
export function aggregateAssetDecisions(references: ContentAssetReference[]): {
  decision: ModerationDecision;
  excludedAssetIds: string[];
  warnings: string[];
} {
  if (references.length === 0) {
    return { decision: 'requires_user_fix', excludedAssetIds: [], warnings: ['No assets attached'] };
  }

  const primary = references.find(r => r.role === 'primary');
  const primaryRejected = primary?.moderationStatus === 'rejected' || primary?.moderationStatus === 'quarantine';
  if (primaryRejected) {
    return {
      decision: 'reject',
      excludedAssetIds: [primary!.assetId],
      warnings: ['Primary asset rejected'],
    };
  }

  const anyPending = references.some(r => r.moderationStatus === 'pending');
  if (anyPending) {
    return { decision: 'requires_user_fix', excludedAssetIds: [], warnings: ['Moderation in progress'] };
  }

  const excludedAssetIds = references
    .filter(r => r.moderationStatus === 'rejected' || r.moderationStatus === 'quarantine')
    .map(r => r.assetId);

  const warnings = excludedAssetIds.length > 0
    ? [`${excludedAssetIds.length} asset(s) excluded due to moderation`]
    : [];

  const allApproved = references.every(
    r => r.moderationStatus === 'approved' || r.withdrawnAt !== null
  );
  if (allApproved) {
    return { decision: 'allow', excludedAssetIds: [], warnings: [] };
  }

  return {
    decision: 'allow_with_limited_assets',
    excludedAssetIds,
    warnings,
  };
}
