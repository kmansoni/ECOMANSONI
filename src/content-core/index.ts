// Content Core — Public API
// All exports for the content publishing pipeline

// ============================================================================
// Domain Models
// ============================================================================

// Listing types (already created)
export type {
  ContentItemType,
  ListingType,
  ContentItemStatus,
  Visibility,
  ContentItem,
  ContentAssetReference,
  AssetRole,
  ModerationStatus,
  MediaAssetStatus,
  ContentHashes,
  MediaMetadata,
  MediaVariant,
  MediaAsset,
  ModerationDecision,
  ModerationStage,
  ModerationCase,
  PolicyDecisionResult,
  DistributionLevel,
  PolicyDecision,
  ActorType,
  LifecycleTransitionLog,
  DomainEvent,
  ListingPublishedEvent,
  ListingRejectedEvent,
  ListingDeletedEvent,
  ListingPriceChangedEvent,
  OutboxEventStatus,
  OutboxEvent,
  ConsumedEvent,
  SagaStatus,
  SagaStepStatus,
  CompensationStep,
  CompensationSaga,
  SearchListingProjection,
} from './domain/listing';

export {
  resolveEffectiveVisibility,
  aggregateAssetDecisions,
} from './domain/listing';

// Publication types (just created)
export type {
  PublicationType,
  PublicationFormat,
  Publication,
  PublicationAnalyticsEvent,
  FeedDistributionEvent,
  CarouselExclusionPolicy,
} from './domain/publication';

export {
  DEFAULT_CAROUSEL_POLICY,
  createPublication,
  computePublicationPolicyDecision,
  applyCarouselExclusionRules,
  computeFeedDistribution,
  transitionPublication,
  isPublicationDraft,
  isPublicationPending,
  isPublicationPublished,
  isPublicationActive,
  isPublicationEditable,
  canPublicationPublish,
  canPublicationEdit,
  canPublicationDelete,
  canPublicationArchive,
  canPublicationRestore,
} from './domain/publication';

// Moderation types (just created)
export type {
  ModerationCaseStatus,
  ReviewPriority,
  ModerationAlgorithm,
  ModerationFlag,
  ModerationSignal,
  ModerationPipelineConfig,
  ModerationCaseTransitionResult,
  AppealStatus,
  ModerationAppeal,
  CreateAppealInput,
  HumanReviewCase,
  FastStageResult,
  DeepStageResult,
  ModerationDecisionEvent,
} from './domain/moderation';

export {
  DEFAULT_MODERATION_PIPELINE,
  computePolicyDecision,
  createModerationCase,
  decideModerationCase,
  createAppeal,
  canAppeal,
  resolveAppeal,
  processFastStage,
  processDeepStage,
  createHumanReviewCase,
  routeToHumanReviewQueue,
  createModerationDecisionEvent,
  isModerationTimedOut,
  getTimedOutDecision,
} from './domain/moderation';

// Transition Log types (just created)
export type {
  EntityType,
  TransitionLogEntry,
  CreateTransitionLogInput,
  TransitionLogFilter,
  TransitionHistoryItem,
  TransitionValidationResult,
  AuditReport,
} from './domain/transitionLog';

export {
  createTransitionLogEntry,
  createTransitionLogFromEvent,
  buildTransitionLogFilter,
  reconstructTransitionHistory,
  getCurrentStatusFromHistory,
  validateTransition,
  generateAuditReport,
} from './domain/transitionLog';

// ============================================================================
// Infrastructure
// ============================================================================

// Outbox (just created)
export type {
  OutboxConfig,
  OutboxMetrics,
  CircuitBreaker,
  LockResult,
  LockInfo,
  SelectNextEventResult,
  DeliveryResult,
} from './infra/outbox';

export {
  DEFAULT_OUTBOX_CONFIG,
  createOutboxEvent,
  createOutboxEventFromDomainEvent,
  tryAcquireLock,
  renewLock,
  releaseLock,
  selectNextEvent,
  markDelivered,
  markFailed,
  moveToDeadLetter,
  computeOutboxMetrics,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  circuitBreakerTrip,
  circuitBreakerSuccess,
  circuitBreakerFailure,
  isCircuitOpen,
} from './infra/outbox';

// Consumed Events (just created)
export type {
  CreateConsumedEventInput,
  ConsumedEventFilter,
  IdempotencyCheckResult,
  ConsumerState,
  ConsumerMetrics,
  BatchProcessResult,
  CleanupResult,
} from './infra/consumedEvents';

export {
  createConsumedEvent,
  checkIdempotency,
  generateIdempotencyKey,
  createConsumerState,
  recordSuccessfulProcess,
  recordSkippedProcess,
  recordFailedProcess,
  computeConsumerMetrics,
  processBatchWithIdempotency,
  filterOldConsumedEvents,
  getCleanupCandidates,
} from './infra/consumedEvents';

// Retry Policy (just created)
export type {
  ErrorType,
  RetryableError,
  BackoffConfig,
  BackoffScheduleItem,
  RetryBudget,
  RetryDecision,
  RetryLoopOptions,
  RateLimitInfo,
} from './infra/retryPolicy';

export {
  DEFAULT_BACKOFF_CONFIG,
  classifyError,
  calculateBackoffDelay,
  generateBackoffSchedule,
  createRetryBudget,
  consumeRetryAttempt,
  resetRetryBudget,
  shouldRetryWithBackoff,
  retryWithBackoff,
  parseRateLimitHeaders,
  handleRateLimit,
} from './infra/retryPolicy';

// ============================================================================
// Sagas
// ============================================================================

// Compensation Saga (just created)
export type {
  SagaTriggerEvent,
  SagaStepDefinition,
  SagaExecutionContext,
  SagaExecutionResult,
} from './sagas/compensationSaga';

export {
  LISTING_REJECTION_STEPS,
  PUBLICATION_REJECTION_STEPS,
  createCompensationSaga,
  executeNextSagaStep,
  completeSagaStep,
  failSagaStep,
  skipSagaStep,
  completeSaga,
  failSaga,
  requireManualReview,
  canStartNewSaga,
  getExistingSaga,
  filterSagas,
  getSagaProgress,
  computeSagaMetrics,
} from './sagas/compensationSaga';

export type {
  SagaFilter,
  SagaStorePort,
} from './sagas/sagaStore';

export {
  SupabaseSagaStore,
  InMemorySagaStore,
  createSagaStore,
  getSagaStore,
  resetSagaStore,
} from './sagas/sagaStore';

// Saga Worker
export { SagaWorker, runSagaWorker } from './sagas/sagaWorker';

// ============================================================================
// Projections
// ============================================================================

// Search Projection (just created)
export type {
  SearchIndexStatus,
  SearchProjectionState,
  SearchIndexEvent,
  EventHandlerResult,
  SearchProjectionFilter,
} from './projections/searchProjection';

export {
  checkVersionGuard,
  handleListingPriceChanged,
  handleListingDeleted,
  handleListingRejected,
  routeSearchProjectionEvent,
  markIndexing,
  markIndexed,
  markIndexFailed,
  markDeindexing,
  markDeindexed,
  filterSearchProjections,
  testEventOrdering,
} from './projections/searchProjection';

// Feed Projection (just created)
export type {
  FeedType,
  FeedItem,
  FeedEvent,
  RankingFactors,
  PublicationPublishedForFeed,
  ListingPublishedForFeed,
  FeedEventHandlerResult,
  FeedQuery,
  FeedMetrics,
} from './projections/feedProjection';

export {
  DEFAULT_RANKING_WEIGHTS,
  computeRankingScore,
  computeRecencyScore,
  computeEngagementScore,
  createFeedItem,
  handlePublicationPublished,
  handlePublicationDeleted,
  handleEngagementUpdate,
  routeFeedEvent,
  queryFeed,
  computeFeedMetrics,
} from './projections/feedProjection';

// ============================================================================
// Cleanup
// ============================================================================

// Media Asset Cleanup (just created)
export type {
  CleanupStatus,
  CleanupTask,
  CleanupPolicy,
  OrphanCheckResult,
  CdnPurgeResult,
  CleanupBatch,
  RetentionStats,
  CleanupSchedule,
} from './cleanup/mediaAssetCleanup';

export {
  DEFAULT_CLEANUP_POLICY,
  checkOrphanStatus,
  findOrphanAssets,
  createCleanupTask,
  createCleanupTasksForOrphans,
  markForSoftDelete,
  isEligibleForSoftDelete,
  isEligibleForHardDelete,
  markForHardDelete,
  purgeCdnPaths,
  generateCdnPaths,
  startTask,
  completeTask,
  failTask,
  resetTask,
  executeSoftDeleteBatch,
  executeHardDeleteBatch,
  computeRetentionStats,
  computeNextCleanupSchedule,
} from './cleanup/mediaAssetCleanup';