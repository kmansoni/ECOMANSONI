// Content Core — Publication Domain Model
// Publication aggregate root, state machine, and guards

function generateId() { return crypto.randomUUID(); }
import type {
  ContentItem,
  ContentItemStatus,
  ContentItemType,
  Visibility,
  ContentAssetReference,
  ModerationDecision,
  PolicyDecision,
  LifecycleTransitionLog,
  DomainEvent,
} from './listing';

// ============================================================================
// Publication Types
// ============================================================================

export type PublicationType = 'post' | 'reel' | 'story' | 'carousel';
export type PublicationFormat = 'text' | 'image' | 'video' | 'audio' | 'link' | 'poll';

export interface Publication extends ContentItem {
  itemType: 'publication';
  publicationType: PublicationType;
  format: PublicationFormat;
  caption: string | null;
  hashtags: string[];
  mentions: string[];
  location: string | null;
  mediaReferences: ContentAssetReference[];
  taggedUsers: string[];
  sharedPostId: string | null;
  parentReelId: string | null;
  isArchived: boolean;
  isPinned: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  reachCount: number;
  engagementRate: number;
}

// ============================================================================
// Publication Lifecycle State Machine
// ============================================================================

type PublicationTransition = {
  from: ContentItemStatus[];
  to: ContentItemStatus;
  guard: (pub: Publication) => { allowed: boolean; reason?: string };
  event: string;
};

const PUBLICATION_TRANSITIONS: PublicationTransition[] = [
  {
    from: ['draft'],
    to: 'pending_moderation',
    guard: (pub) => ({
      allowed: pub.mediaReferences.length > 0 || pub.caption !== null,
      reason: 'Publication must have content',
    }),
    event: 'PublicationSubmitted',
  },
  {
    from: ['pending_moderation'],
    to: 'published',
    guard: (pub) => ({
      allowed: true,
      reason: 'Moderation approved',
    }),
    event: 'PublicationApproved',
  },
  {
    from: ['pending_moderation'],
    to: 'quarantine',
    guard: () => ({ allowed: true, reason: 'Moderation requires review' }),
    event: 'PublicationQuarantined',
  },
  {
    from: ['pending_moderation'],
    to: 'rejected',
    guard: () => ({ allowed: true, reason: 'Moderation rejected' }),
    event: 'PublicationRejected',
  },
  {
    from: ['published'],
    to: 'suspended',
    guard: () => ({ allowed: true, reason: 'Suspended by moderation' }),
    event: 'PublicationSuspended',
  },
  {
    from: ['published'],
    to: 'suspended_by_parent',
    guard: () => ({ allowed: true, reason: 'Suspended by parent listing' }),
    event: 'PublicationSuspendedByParent',
  },
  {
    from: ['published'],
    to: 'draft',
    guard: () => ({ allowed: true, reason: 'Unpublished by user' }),
    event: 'PublicationUnpublished',
  },
  {
    from: ['suspended', 'suspended_by_parent'],
    to: 'published',
    guard: () => ({ allowed: true, reason: 'Reinstated' }),
    event: 'PublicationReinstated',
  },
  {
    from: ['draft', 'published', 'suspended', 'suspended_by_parent', 'quarantine'],
    to: 'deleted',
    guard: () => ({ allowed: true, reason: 'Deleted' }),
    event: 'PublicationDeleted',
  },
];

// ============================================================================
// Guards
// ============================================================================

export function isPublicationDraft(pub: Publication): boolean {
  return pub.status === 'draft';
}

export function isPublicationPending(pub: Publication): boolean {
  return pub.status === 'pending_moderation' || pub.status === 'moderation_pending';
}

export function isPublicationPublished(pub: Publication): boolean {
  return pub.status === 'published';
}

export function isPublicationActive(pub: Publication): boolean {
  return pub.status === 'published' && !pub.isArchived;
}

export function isPublicationEditable(pub: Publication): boolean {
  return pub.status === 'draft' || pub.status === 'rejected';
}

export function canPublicationPublish(pub: Publication): boolean {
  if (pub.status !== 'pending_moderation') return false;
  if (pub.mediaReferences.length === 0 && !pub.caption) return false;
  return true;
}

export function canPublicationEdit(pub: Publication): boolean {
  return pub.status === 'draft' || pub.status === 'rejected';
}

export function canPublicationDelete(pub: Publication): boolean {
  return pub.status !== 'deleted';
}

export function canPublicationArchive(pub: Publication): boolean {
  return pub.status === 'published';
}

export function canPublicationRestore(pub: Publication): boolean {
  return pub.status === 'deleted';
}

// ============================================================================
// State Machine
// ============================================================================

export interface TransitionResult {
  success: boolean;
  publication: Publication;
  event?: DomainEvent;
  reason?: string;
}

export function transitionPublication(
  pub: Publication,
  targetStatus: ContentItemStatus,
  idempotencyKey: string,
  context: {
    actorId: string;
    reason: string;
    policyDecision?: PolicyDecision;
    moderationDecision?: ModerationDecision;
  }
): TransitionResult {
  const transition = PUBLICATION_TRANSITIONS.find(
    (t) => t.from.includes(pub.status) && t.to === targetStatus
  );

  if (!transition) {
    return {
      success: false,
      publication: pub,
      reason: `Invalid transition: ${pub.status} → ${targetStatus}`,
    };
  }

  const guardResult = transition.guard(pub);
  if (!guardResult.allowed) {
    return {
      success: false,
      publication: pub,
      reason: guardResult.reason,
    };
  }

  const now = new Date().toISOString();
  const updatedPublication: Publication = {
    ...pub,
    status: targetStatus,
    aggregateVersion: pub.aggregateVersion + 1,
    updatedAt: now,
    publishedAt: targetStatus === 'published' ? now : pub.publishedAt,
    deletedAt: targetStatus === 'deleted' ? now : pub.deletedAt,
  };

  const event: DomainEvent = {
    eventId: generateId(),
    aggregateType: 'publication',
    aggregateId: pub.id,
    eventType: transition.event,
    eventVersion: 1,
    occurredAt: now,
    causationId: idempotencyKey,
    causationType: 'user_action',
    payload: {
      publicationId: pub.id,
      authorId: pub.authorId,
      fromStatus: pub.status,
      toStatus: targetStatus,
      reason: context.reason,
      policyDecision: context.policyDecision,
      moderationDecision: context.moderationDecision,
    },
  };

  return {
    success: true,
    publication: updatedPublication,
    event,
  };
}

// ============================================================================
// Publication Factory
// ============================================================================

export interface CreatePublicationInput {
  authorId: string;
  publicationType: PublicationType;
  format: PublicationFormat;
  caption?: string;
  hashtags?: string[];
  mentions?: string[];
  location?: string;
  visibility?: Visibility;
  idempotencyKey?: string;
}

export function createPublication(input: CreatePublicationInput): Publication {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    authorId: input.authorId,
    itemType: 'publication',
    listingType: null,
    status: 'draft',
    visibility: input.visibility ?? 'public',
    aggregateVersion: 0,
    idempotencyKey: input.idempotencyKey ?? null,
    publishedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    publicationType: input.publicationType,
    format: input.format,
    caption: input.caption ?? null,
    hashtags: input.hashtags ?? [],
    mentions: input.mentions ?? [],
    location: input.location ?? null,
    mediaReferences: [],
    taggedUsers: [],
    sharedPostId: null,
    parentReelId: null,
    isArchived: false,
    isPinned: false,
    viewCount: 0,
    likeCount: 0,
    commentCount: 0,
    shareCount: 0,
    saveCount: 0,
    reachCount: 0,
    engagementRate: 0,
  };
}

// ============================================================================
// Publication Analytics Events
// ============================================================================

export interface PublicationAnalyticsEvent {
  publicationId: string;
  eventType:
    | 'view'
    | 'watch_25'
    | 'watch_50'
    | 'watch_75'
    | 'watch_complete'
    | 'rewatch'
    | 'skip'
    | 'share'
    | 'save'
    | 'like'
    | 'unlike'
    | 'comment'
    | 'follow_after_view';
  viewerId: string | null;
  watchDurationMs: number | null;
  timestamp: string;
}

// ============================================================================
// Moderation Policy Decision for Publications
// ============================================================================

export function computePublicationPolicyDecision(
  flags: string[],
  confidence: number,
  userVisibility: Visibility,
  contentType: string
): PolicyDecision {
  const CRITICAL_FLAGS = [
    'csam',
    'child_exploitation',
    'terrorist_content',
    'illicit_drugs_manufacturing',
    'extreme_violence',
  ];

  if (flags.some((f) => CRITICAL_FLAGS.includes(f))) {
    return {
      decision: 'QUARANTINE',
      distribution: 'author_only',
      reasons: ['Critical content detected'],
      appealable: false,
      appealDeadlineHours: 0,
      reviewPriority: 'urgent',
    };
  }

  if (confidence > 0.9 && flags.some((f) => ['nsfw', 'violence', 'hate_speech'].includes(f))) {
    return {
      decision: 'QUARANTINE',
      distribution: 'author_only',
      reasons: ['High confidence violation detected'],
      appealable: true,
      appealDeadlineHours: 168,
      reviewPriority: 'high',
    };
  }

  if (confidence > 0.7) {
    return {
      decision: 'LIMIT',
      distribution: 'followers',
      reasons: ['Moderate confidence violation'],
      appealable: true,
      appealDeadlineHours: 72,
      reviewPriority: 'normal',
    };
  }

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
// Carousel Exclusion Rules
// ============================================================================

export type CarouselExclusionPolicy = {
  primaryRejectedBehavior: 'reject_entire_carousel' | 'promote_next_as_primary_then_allow';
  optionalRejectedBehavior: 'exclude_and_allow' | 'exclude_and_warn';
  minimumAssets: 1 | 2;
};

export const DEFAULT_CAROUSEL_POLICY: CarouselExclusionPolicy = {
  primaryRejectedBehavior: 'reject_entire_carousel',
  optionalRejectedBehavior: 'exclude_and_allow',
  minimumAssets: 1,
};

export function applyCarouselExclusionRules(
  references: ContentAssetReference[],
  policy: CarouselExclusionPolicy = DEFAULT_CAROUSEL_POLICY
): {
  allowed: boolean;
  excludedAssetIds: string[];
  promotedAssetId: string | null;
  warnings: string[];
} {
  if (references.length < policy.minimumAssets) {
    return {
      allowed: false,
      excludedAssetIds: [],
      promotedAssetId: null,
      warnings: [`Minimum ${policy.minimumAssets} assets required`],
    };
  }

  const primary = references.find((r) => r.role === 'primary');
  const primaryRejected =
    primary?.moderationStatus === 'rejected' || primary?.moderationStatus === 'quarantine';

  if (primaryRejected) {
    if (policy.primaryRejectedBehavior === 'reject_entire_carousel') {
      return {
        allowed: false,
        excludedAssetIds: references.map((r) => r.assetId),
        promotedAssetId: null,
        warnings: ['Primary asset rejected, entire carousel blocked'],
      };
    }

    const galleryAssets = references
      .filter((r) => r.role === 'gallery' && r.moderationStatus === 'approved')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    if (galleryAssets.length === 0) {
      return {
        allowed: false,
        excludedAssetIds: references.map((r) => r.assetId),
        promotedAssetId: null,
        warnings: ['No approved assets to promote'],
      };
    }

    return {
      allowed: true,
      excludedAssetIds: [primary!.assetId],
      promotedAssetId: galleryAssets[0].assetId,
      warnings: ['Primary asset excluded, first gallery promoted'],
    };
  }

  const excludedAssetIds = references
    .filter((r) => r.role !== 'primary' && (r.moderationStatus === 'rejected' || r.moderationStatus === 'quarantine'))
    .map((r) => r.assetId);

  const warnings =
    excludedAssetIds.length > 0 && policy.optionalRejectedBehavior === 'exclude_and_warn'
      ? [`${excludedAssetIds.length} optional asset(s) excluded`]
      : [];

  return {
    allowed: true,
    excludedAssetIds,
    promotedAssetId: null,
    warnings,
  };
}

// ============================================================================
// Feed Distribution
// ============================================================================

export interface FeedDistributionEvent {
  publicationId: string;
  authorId: string;
  visibility: Visibility;
  distributionType: 'public' | 'followers' | 'close_friends' | 'mentions';
  recipientIds: string[];
  timestamp: string;
}

export function computeFeedDistribution(
  pub: Publication,
  followerIds: string[],
  closeFriendIds: string[]
): FeedDistributionEvent {
  const distributionType =
    pub.visibility === 'public'
      ? 'public'
      : pub.visibility === 'followers'
      ? 'followers'
      : pub.visibility === 'close_friends'
      ? 'close_friends'
      : 'mentions';

  let recipientIds: string[];
  switch (distributionType) {
    case 'public':
      recipientIds = [];
      break;
    case 'followers':
      recipientIds = followerIds;
      break;
    case 'close_friends':
      recipientIds = closeFriendIds;
      break;
    case 'mentions':
      recipientIds = pub.mentions;
      break;
  }

  return {
    publicationId: pub.id,
    authorId: pub.authorId,
    visibility: pub.visibility,
    distributionType,
    recipientIds,
    timestamp: new Date().toISOString(),
  };
}
