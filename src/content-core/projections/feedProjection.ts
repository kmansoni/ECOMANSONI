// Content Core — Feed Projection
// Event-driven feed distribution, fanout, and engagement tracking

function generateId() { return crypto.randomUUID(); }
import type {
  DomainEvent,
  Visibility,
} from '../domain/listing';

// ============================================================================
// Feed Types
// ============================================================================

export type FeedType = 'home' | 'explore' | 'following' | 'nearby' | 'trending';

export interface FeedItem {
  id: string;
  feedType: FeedType;
  itemId: string;           // Publication or Listing ID
  itemType: 'publication' | 'listing';
  authorId: string;
  visibility: Visibility;
  score: number;             // Ranking score
  publishedAt: string;
  expiresAt: string | null;
  seenBy: string[];
  interactionCounts: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
  };
}

export interface FeedEvent {
  eventId: string;
  feedType: FeedType;
  itemId: string;
  recipientId: string | null;  // null = broadcast to all
  operation: 'add' | 'remove' | 'update';
  timestamp: string;
}

// ============================================================================
// Feed Ranking
// ============================================================================

export interface RankingFactors {
  recency: number;           // 0-1, newer = higher
  engagement: number;        // 0-1, more engagement = higher
  relevance: number;          // 0-1, personalized score
  authority: number;          // 0-1, author credibility
}

export const DEFAULT_RANKING_WEIGHTS = {
  recency: 0.3,
  engagement: 0.4,
  relevance: 0.2,
  authority: 0.1,
};

export function computeRankingScore(
  factors: RankingFactors,
  weights = DEFAULT_RANKING_WEIGHTS
): number {
  return (
    factors.recency * weights.recency +
    factors.engagement * weights.engagement +
    factors.relevance * weights.relevance +
    factors.authority * weights.authority
  );
}

export function computeRecencyScore(publishedAt: string): number {
  const published = new Date(publishedAt).getTime();
  const now = Date.now();
  const ageHours = (now - published) / (1000 * 60 * 60);

  // Exponential decay: 1.0 at 0 hours, ~0.5 at 6 hours, ~0.1 at 24 hours
  return Math.exp(-ageHours / 12);
}

export function computeEngagementScore(
  likes: number,
  comments: number,
  shares: number,
  saves: number,
  views: number
): number {
  if (views === 0) return 0;

  // Weighted engagement
  const weightedEngagement = likes * 1 + comments * 3 + shares * 5 + saves * 4;
  const engagementRate = weightedEngagement / views;

  // Normalize to 0-1 range (cap at 0.5 engagement rate)
  return Math.min(1, engagementRate / 0.5);
}

// ============================================================================
// Feed Item Factory
// ============================================================================

export function createFeedItem(
  itemId: string,
  itemType: 'publication' | 'listing',
  authorId: string,
  visibility: Visibility,
  publishedAt: string
): FeedItem {
  return {
    id: generateId(),
    feedType: 'home',
    itemId,
    itemType,
    authorId,
    visibility,
    score: 0,
    publishedAt,
    expiresAt: null,
    seenBy: [],
    interactionCounts: {
      views: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
    },
  };
}

// ============================================================================
// Feed Distribution Events
// ============================================================================

export interface PublicationPublishedForFeed {
  publicationId: string;
  authorId: string;
  visibility: Visibility;
  publishedAt: string;
}

export interface ListingPublishedForFeed {
  listingId: string;
  authorId: string;
  listingType: string;
  visibility: Visibility;
  publishedAt: string;
}

// ============================================================================
// Event Handlers
// ============================================================================

export interface FeedEventHandlerResult {
  success: boolean;
  feedItem?: FeedItem;
  feedEvents?: FeedEvent[];
  error?: string;
}

export function handlePublicationPublished(
  event: DomainEvent<PublicationPublishedForFeed>,
  currentFeeds: Map<string, FeedItem>
): FeedEventHandlerResult {
  const { payload } = event;
  const feedItem = createFeedItem(
    payload.publicationId,
    'publication',
    payload.authorId,
    payload.visibility,
    payload.publishedAt
  );

  const feedEvents: FeedEvent[] = [];

  // Determine distribution based on visibility
  if (payload.visibility === 'public') {
    // Broadcast to all followers (would be async fanout in real implementation)
    feedEvents.push({
      eventId: generateId(),
      feedType: 'home',
      itemId: payload.publicationId,
      recipientId: null,
      operation: 'add',
      timestamp: new Date().toISOString(),
    });

    // Also add to explore
    feedEvents.push({
      eventId: generateId(),
      feedType: 'explore',
      itemId: payload.publicationId,
      recipientId: null,
      operation: 'add',
      timestamp: new Date().toISOString(),
    });
  } else if (payload.visibility === 'followers') {
    // Targeted distribution (would fetch follower IDs)
    feedEvents.push({
      eventId: generateId(),
      feedType: 'following',
      itemId: payload.publicationId,
      recipientId: payload.authorId,
      operation: 'add',
      timestamp: new Date().toISOString(),
    });
  }
  // close_friends, private, custom → no public feed events

  currentFeeds.set(feedItem.id, feedItem);

  return {
    success: true,
    feedItem,
    feedEvents,
  };
}

export function handleListingPublished(
  event: DomainEvent<ListingPublishedForFeed>,
  currentFeeds: Map<string, FeedItem>
): FeedEventHandlerResult {
  const { payload } = event;
  const feedItem = createFeedItem(
    payload.listingId,
    'listing',
    payload.authorId,
    payload.visibility,
    payload.publishedAt
  );

  // Listings go to explore and nearby feeds
  const feedEvents: FeedEvent[] = [
    {
      eventId: generateId(),
      feedType: 'explore',
      itemId: payload.listingId,
      recipientId: null,
      operation: 'add',
      timestamp: new Date().toISOString(),
    },
    {
      eventId: generateId(),
      feedType: 'nearby',
      itemId: payload.listingId,
      recipientId: null,
      operation: 'add',
      timestamp: new Date().toISOString(),
    },
  ];

  currentFeeds.set(feedItem.id, feedItem);

  return {
    success: true,
    feedItem,
    feedEvents,
  };
}

export function handlePublicationDeleted(
  event: DomainEvent<{ publicationId: string }>,
  currentFeeds: Map<string, FeedItem>
): FeedEventHandlerResult {
  const { payload } = event;

  // Find and remove all feed items for this publication
  const toRemove: FeedItem[] = [];
  for (const item of currentFeeds.values()) {
    if (item.itemId === payload.publicationId && item.itemType === 'publication') {
      toRemove.push(item);
    }
  }

  const feedEvents: FeedEvent[] = toRemove.map((item) => ({
    eventId: generateId(),
    feedType: item.feedType,
    itemId: item.itemId,
    recipientId: null,
    operation: 'remove',
    timestamp: new Date().toISOString(),
  }));

  for (const item of toRemove) {
    currentFeeds.delete(item.id);
  }

  return {
    success: true,
    feedEvents,
  };
}

export function handleEngagementUpdate(
  event: DomainEvent<{
    itemId: string;
    itemType: 'publication' | 'listing';
    engagementType: 'view' | 'like' | 'unlike' | 'comment' | 'share' | 'save';
    viewerId: string;
  }>,
  currentFeeds: Map<string, FeedItem>
): FeedEventHandlerResult {
  const { payload } = event;

  // Find feed item
  let feedItem: FeedItem | null = null;
  for (const item of currentFeeds.values()) {
    if (item.itemId === payload.itemId && item.itemType === payload.itemType) {
      feedItem = item;
      break;
    }
  }

  if (!feedItem) {
    return {
      success: false,
      error: 'Feed item not found',
    };
  }

  // Update interaction counts
  const updatedItem: FeedItem = {
    ...feedItem,
    seenBy: payload.engagementType === 'view'
      ? [...new Set([...feedItem.seenBy, payload.viewerId])]
      : feedItem.seenBy,
    interactionCounts: {
      ...feedItem.interactionCounts,
      views: payload.engagementType === 'view'
        ? feedItem.interactionCounts.views + 1
        : feedItem.interactionCounts.views,
      likes: payload.engagementType === 'like'
        ? feedItem.interactionCounts.likes + 1
        : payload.engagementType === 'unlike'
        ? feedItem.interactionCounts.likes - 1
        : feedItem.interactionCounts.likes,
      comments: payload.engagementType === 'comment'
        ? feedItem.interactionCounts.comments + 1
        : feedItem.interactionCounts.comments,
      shares: payload.engagementType === 'share'
        ? feedItem.interactionCounts.shares + 1
        : feedItem.interactionCounts.shares,
      saves: payload.engagementType === 'save'
        ? feedItem.interactionCounts.saves + 1
        : feedItem.interactionCounts.saves,
    },
  };

  // Recompute score
  const recencyScore = computeRecencyScore(updatedItem.publishedAt);
  const engagementScore = computeEngagementScore(
    updatedItem.interactionCounts.likes,
    updatedItem.interactionCounts.comments,
    updatedItem.interactionCounts.shares,
    updatedItem.interactionCounts.saves,
    updatedItem.interactionCounts.views
  );
  updatedItem.score = computeRankingScore({
    recency: recencyScore,
    engagement: engagementScore,
    relevance: 0.5,
    authority: 0.5,
  });

  currentFeeds.set(feedItem.id, updatedItem);

  return {
    success: true,
    feedItem: updatedItem,
  };
}

// ============================================================================
// Event Router
// ============================================================================

export function routeFeedEvent(
  event: DomainEvent,
  currentFeeds: Map<string, FeedItem>
): FeedEventHandlerResult {
  switch (event.eventType) {
    case 'PublicationApproved':
    case 'PublicationPublished':
      return handlePublicationPublished(
        event as DomainEvent<PublicationPublishedForFeed>,
        currentFeeds
      );
    case 'ListingPublished':
      return handleListingPublished(
        event as DomainEvent<ListingPublishedForFeed>,
        currentFeeds
      );
    case 'PublicationDeleted':
      return handlePublicationDeleted(
        event as DomainEvent<{ publicationId: string }>,
        currentFeeds
      );
    case 'EngagementUpdated':
      return handleEngagementUpdate(event as DomainEvent<{ itemId: string; itemType: "publication" | "listing"; engagementType: "view" | "like" | "unlike" | "comment" | "share" | "save"; viewerId: string; }>, currentFeeds);
    default:
      return {
        success: false,
        error: `Unknown event type: ${event.eventType}`,
      };
  }
}

// ============================================================================
// Feed Queries
// ============================================================================

export interface FeedQuery {
  feedType: FeedType;
  userId: string;
  limit?: number;
  offset?: number;
  afterId?: string;
  beforeTime?: string;
}

export function queryFeed(
  feeds: Map<string, FeedItem>,
  query: FeedQuery
): FeedItem[] {
  let items = Array.from(feeds.values())
    .filter((item) => {
      // Filter by feed type
      if (item.feedType !== query.feedType) return false;

      // Filter by visibility
      if (item.visibility === 'private' && item.authorId !== query.userId) return false;

      // Filter by time
      if (query.beforeTime && item.publishedAt >= query.beforeTime) return false;

      // Filter seen items for home feed
      if (query.feedType === 'home' && item.seenBy.includes(query.userId)) return false;

      return true;
    })
    .sort((a, b) => {
      // Sort by score descending, then by publishedAt descending
      if (Math.abs(b.score - a.score) > 0.01) {
        return b.score - a.score;
      }
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

  // Apply cursor-based pagination
  if (query.afterId) {
    const afterIndex = items.findIndex((item) => item.id === query.afterId);
    if (afterIndex !== -1) {
      items = items.slice(afterIndex + 1);
    }
  }

  // Apply offset
  if (query.offset) {
    items = items.slice(query.offset);
  }

  // Apply limit
  if (query.limit) {
    items = items.slice(0, query.limit);
  }

  return items;
}

// ============================================================================
// Feed Metrics
// ============================================================================

export interface FeedMetrics {
  totalItems: number;
  byFeedType: Record<FeedType, number>;
  averageScore: number;
  totalEngagement: number;
  uniqueAuthors: number;
}

export function computeFeedMetrics(feeds: Map<string, FeedItem>): FeedMetrics {
  const items = Array.from(feeds.values());

  const byFeedType: Record<FeedType, number> = {
    home: 0,
    explore: 0,
    following: 0,
    nearby: 0,
    trending: 0,
  };

  let totalScore = 0;
  let totalEngagement = 0;
  const uniqueAuthors = new Set<string>();

  for (const item of items) {
    byFeedType[item.feedType]++;
    totalScore += item.score;
    totalEngagement +=
      item.interactionCounts.likes +
      item.interactionCounts.comments +
      item.interactionCounts.shares +
      item.interactionCounts.saves;
    uniqueAuthors.add(item.authorId);
  }

  return {
    totalItems: items.length,
    byFeedType,
    averageScore: items.length > 0 ? totalScore / items.length : 0,
    totalEngagement,
    uniqueAuthors: uniqueAuthors.size,
  };
}
