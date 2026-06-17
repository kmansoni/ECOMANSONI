// Domain types for Content & Listing Unified Domain Model
// See: ADR-00XX Publication & Listing Unified Domain Model

export type ListingType =
  | 'real_estate'
  | 'insurance'
  | 'marketplace'
  | 'job'
  | 'event';

export type ListingStatus =
  | 'draft'
  | 'pending'
  | 'published'
  | 'suspended'
  | 'rejected'
  | 'deleted';

export type ListingIndexStatus =
  | 'not_indexed'
  | 'indexing'
  | 'searchable'
  | 'index_failed';

export type PublicationStatus =
  | 'draft'
  | 'pending_policy'
  | 'published'
  | 'suspended_by_parent'
  | 'rejected'
  | 'deleted';

export type Visibility =
  | 'public'
  | 'followers'
  | 'close_friends'
  | 'private'
  | 'author_only';

// ContentAssetReference — owner-agnostic link between content and media asset
export type ContentAssetReference = {
  id: string;
  ownerType: 'publication' | 'listing' | 'campaign' | 'profile' | 'channel' | 'business_page';
  ownerId: string;
  assetId: string;
  role: 'primary' | 'gallery' | 'cover' | 'promo' | 'attachment';
  sortOrder: number;
  moderationStatus: 'pending' | 'approved' | 'limited' | 'quarantine' | 'rejected';
  moderationCaseId: string | null;
  withdrawnAt: string | null; // null = active, not null = user removed
  createdAt: string;
};

// Moderation types
export type PolicyDecisionType = 'ALLOW' | 'LIMIT' | 'QUARANTINE' | 'REJECT';

export type ModerationDecision = {
  decision: PolicyDecisionType;
  distribution: 'public' | 'followers' | 'close_friends' | 'author_only';
  reasons: string[];
  flags: string[];
  confidence: number;
  appealable: boolean;
  appealDeadlineHours: number;
  reviewPriority: 'low' | 'normal' | 'high' | 'urgent';
};

// Asset moderation aggregation policy
export type ContainerDecision =
  | 'allow'
  | 'allow_with_limited_assets'
  | 'requires_user_fix'
  | 'reject'
  | 'quarantine';

export type AssetModerationStatus =
  | 'pending'
  | 'approved'
  | 'limited'
  | 'quarantine'
  | 'rejected'
  | 'processing_failed';

// Listing — aggregate root
export type Listing = {
  id: string;
  authorId: string;
  listingType: ListingType;
  status: ListingStatus;
  visibility: Visibility;
  title: string;
  description: string;
  price?: number;
  currency?: string;
  indexStatus: ListingIndexStatus;
  aggregateVersion: number;
  idempotencyKey: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// Publication — aggregate root
export type Publication = {
  id: string;
  authorId: string;
  type: 'social_post' | 'reel' | 'story' | 'text_story' | 'live_session';
  status: PublicationStatus;
  visibility: Visibility;
  parentType: 'listing' | 'campaign' | 'profile' | 'channel' | null;
  parentId: string | null;
  caption: string;
  aggregateVersion: number;
  idempotencyKey: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// LifecycleTransitionLog — immutable audit trail
export type LifecycleTransition = {
  id: string;
  entityType: 'listing' | 'publication' | 'asset' | 'campaign';
  entityId: string;
  fromStatus: string;
  toStatus: string;
  actorType: 'user' | 'service' | 'system' | 'moderation' | 'policy';
  actorId: string;
  reason: string;
  policyDecisionId?: string;
  moderationDecisionId?: string;
  requestId: string;
  createdAt: string;
};

// Outbox events
export type OutboxEvent = {
  id: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';
  workerId: string | null;
  lockedAt: string | null;
  attempts: number;
  nextAttemptAt: string;
  error?: string;
  createdAt: string;
  processedAt: string | null;
};

// Consumed events — for consumer idempotency
export type ConsumedEvent = {
  consumerName: string;
  eventId: string;
  idempotencyKey: string;
  consumedAt: string;
};

// Compensation saga
export type SagaStatus = 'running' | 'completed' | 'failed' | 'requires_manual_review';
export type SagaStepStatus = 'pending' | 'done' | 'failed';

export type CompensationStep = {
  name: string;
  targetService: string;
  commandType: string;
  status: SagaStepStatus;
  retryCount: number;
  lastError?: string;
};

export type CompensationSaga = {
  sagaId: string;
  originalEventId: string;
  status: SagaStatus;
  steps: CompensationStep[];
  currentStep: number;
  retryCount: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

// Media asset
export type MediaAsset = {
  id: string;
  ownerId: string;
  status: 'processing' | 'ready' | 'flagged' | 'orphaned';
  sha256: string | null;
  phash: string | null;
  audioFingerprint: string | null;
  sceneHashes: string[];
  createdAt: string;
  updatedAt: string;
};

// Search projection state
export type SearchListingProjection = {
  listingId: string;
  aggregateVersion: number;
  title: string;
  price: number | null;
  currency: string;
  location: string | null;
  listingType: ListingType;
  authorId: string;
  indexedAt: string;
};

// Domain events
export type DomainEvent<T = unknown> = {
  eventId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  occurredAt: string;
  causationId: string;
  payload: T;
};
