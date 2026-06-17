// Content Core — Search Projection
// Event ordering, version guard, eventual consistency for search index

import type {
  DomainEvent,
  ListingPublishedEvent,
  ListingRejectedEvent,
  ListingDeletedEvent,
  ListingPriceChangedEvent,
  SearchListingProjection,
  ContentItemStatus,
  Visibility,
  ListingType,
} from '../domain/listing';

// ============================================================================
// Projection Types
// ============================================================================

export type SearchIndexStatus = 'not_indexed' | 'indexing' | 'indexed' | 'deindexing' | 'deindexed';

export interface SearchProjectionState {
  listingId: string;
  aggregateVersion: number;
  indexStatus: SearchIndexStatus;
  lastIndexedAt: string | null;
  lastError: string | null;
  retryCount: number;
}

export interface SearchIndexEvent {
  listingId: string;
  aggregateVersion: number;
  operation: 'index' | 'deindex' | 'update';
  timestamp: string;
}

// ============================================================================
// Version Guard (prevents stale events from overwriting newer state)
// ============================================================================

export interface VersionGuardResult {
  accepted: boolean;
  reason?: string;
  currentVersion: number;
  eventVersion: number;
}

export function checkVersionGuard(
  currentVersion: number,
  eventVersion: number
): VersionGuardResult {
  if (eventVersion < currentVersion) {
    return {
      accepted: false,
      reason: 'Stale event: event version is older than current projection version',
      currentVersion,
      eventVersion,
    };
  }

  if (eventVersion === currentVersion) {
    return {
      accepted: true,
      currentVersion,
      eventVersion,
    };
  }

  // eventVersion > currentVersion
  return {
    accepted: true,
    currentVersion,
    eventVersion,
  };
}

// ============================================================================
// Event Handlers
// ============================================================================

export interface EventHandlerResult {
  success: boolean;
  projection?: SearchListingProjection;
  state?: SearchProjectionState;
  event?: SearchIndexEvent;
  error?: string;
}

export function handleListingPublished(
  event: DomainEvent<ListingPublishedEvent>,
  currentProjection: SearchListingProjection | null,
  currentState: SearchProjectionState | null
): EventHandlerResult {
  const eventVersion = event.eventVersion;
  const currentVersion = currentState?.aggregateVersion ?? 0;

  const versionCheck = checkVersionGuard(currentVersion, eventVersion);
  if (!versionCheck.accepted) {
    return {
      success: false,
      error: versionCheck.reason,
    };
  }

  const now = new Date().toISOString();
  const projection: SearchListingProjection = {
    listingId: event.payload.listingId,
    aggregateVersion: eventVersion,
    title: (currentProjection?.title) ?? '',
    description: (currentProjection?.description) ?? '',
    price: (currentProjection?.price) ?? null,
    currency: (currentProjection?.currency) ?? 'RUB',
    location: (currentProjection?.location) ?? null,
    listingType: event.payload.listingType,
    authorId: event.payload.authorId,
    status: 'published',
    visibility: event.payload.visibility,
    indexedAt: now,
  };

  const state: SearchProjectionState = {
    listingId: event.payload.listingId,
    aggregateVersion: eventVersion,
    indexStatus: 'not_indexed', // Starts as not_indexed, async worker will index
    lastIndexedAt: null,
    lastError: null,
    retryCount: 0,
  };

  const indexEvent: SearchIndexEvent = {
    listingId: event.payload.listingId,
    aggregateVersion: eventVersion,
    operation: 'index',
    timestamp: now,
  };

  return {
    success: true,
    projection,
    state,
    event: indexEvent,
  };
}

export function handleListingPriceChanged(
  event: DomainEvent<ListingPriceChangedEvent>,
  currentProjection: SearchListingProjection | null,
  currentState: SearchProjectionState | null
): EventHandlerResult {
  if (!currentProjection) {
    return {
      success: false,
      error: 'No projection found for listing',
    };
  }

  const eventVersion = event.eventVersion;
  const currentVersion = currentState?.aggregateVersion ?? 0;

  const versionCheck = checkVersionGuard(currentVersion, eventVersion);
  if (!versionCheck.accepted) {
    return {
      success: false,
      error: versionCheck.reason,
    };
  }

  const now = new Date().toISOString();
  const projection: SearchListingProjection = {
    ...currentProjection,
    aggregateVersion: eventVersion,
    price: event.payload.newPrice,
    indexedAt: now,
  };

  const state: SearchProjectionState = {
    ...currentState!,
    aggregateVersion: eventVersion,
    indexStatus: 'not_indexed',
    lastIndexedAt: null,
  };

  const indexEvent: SearchIndexEvent = {
    listingId: event.payload.listingId,
    aggregateVersion: eventVersion,
    operation: 'update',
    timestamp: now,
  };

  return {
    success: true,
    projection,
    state,
    event: indexEvent,
  };
}

export function handleListingDeleted(
  event: DomainEvent<ListingDeletedEvent>,
  currentProjection: SearchListingProjection | null,
  currentState: SearchProjectionState | null
): EventHandlerResult {
  if (!currentProjection) {
    return {
      success: false,
      error: 'No projection found for listing',
    };
  }

  const eventVersion = event.eventVersion;
  const currentVersion = currentState?.aggregateVersion ?? 0;

  const versionCheck = checkVersionGuard(currentVersion, eventVersion);
  if (!versionCheck.accepted) {
    return {
      success: false,
      error: versionCheck.reason,
    };
  }

  const now = new Date().toISOString();
  const projection: SearchListingProjection = {
    ...currentProjection,
    aggregateVersion: eventVersion,
    status: 'deleted',
    indexedAt: now,
  };

  const state: SearchProjectionState = {
    ...currentState!,
    aggregateVersion: eventVersion,
    indexStatus: 'deindexing',
    lastIndexedAt: null,
  };

  const indexEvent: SearchIndexEvent = {
    listingId: event.payload.listingId,
    aggregateVersion: eventVersion,
    operation: 'deindex',
    timestamp: now,
  };

  return {
    success: true,
    projection,
    state,
    event: indexEvent,
  };
}

export function handleListingRejected(
  event: DomainEvent<ListingRejectedEvent>,
  currentProjection: SearchListingProjection | null,
  currentState: SearchProjectionState | null
): EventHandlerResult {
  if (!currentProjection) {
    return {
      success: false,
      error: 'No projection found for listing',
    };
  }

  const eventVersion = event.eventVersion;
  const currentVersion = currentState?.aggregateVersion ?? 0;

  const versionCheck = checkVersionGuard(currentVersion, eventVersion);
  if (!versionCheck.accepted) {
    return {
      success: false,
      error: versionCheck.reason,
    };
  }

  const now = new Date().toISOString();
  const projection: SearchListingProjection = {
    ...currentProjection,
    aggregateVersion: eventVersion,
    status: 'rejected',
    indexedAt: now,
  };

  const state: SearchProjectionState = {
    ...currentState!,
    aggregateVersion: eventVersion,
    indexStatus: 'deindexing',
    lastIndexedAt: null,
  };

  const indexEvent: SearchIndexEvent = {
    listingId: event.payload.listingId,
    aggregateVersion: eventVersion,
    operation: 'deindex',
    timestamp: now,
  };

  return {
    success: true,
    projection,
    state,
    event: indexEvent,
  };
}

// ============================================================================
// Event Router
// ============================================================================

export function routeSearchProjectionEvent(
  event: DomainEvent,
  currentProjection: SearchListingProjection | null,
  currentState: SearchProjectionState | null
): EventHandlerResult {
  switch (event.eventType) {
    case 'ListingPublished':
      return handleListingPublished(
        event as DomainEvent<ListingPublishedEvent>,
        currentProjection,
        currentState
      );
    case 'ListingPriceChanged':
      return handleListingPriceChanged(
        event as DomainEvent<ListingPriceChangedEvent>,
        currentProjection,
        currentState
      );
    case 'ListingDeleted':
      return handleListingDeleted(
        event as DomainEvent<ListingDeletedEvent>,
        currentProjection,
        currentState
      );
    case 'ListingRejected':
      return handleListingRejected(
        event as DomainEvent<ListingRejectedEvent>,
        currentProjection,
        currentState
      );
    default:
      return {
        success: false,
        error: `Unknown event type: ${event.eventType}`,
      };
  }
}

// ============================================================================
// Index Status Management
// ============================================================================

export function markIndexing(state: SearchProjectionState): SearchProjectionState {
  return {
    ...state,
    indexStatus: 'indexing',
    retryCount: 0,
  };
}

export function markIndexed(state: SearchProjectionState): SearchProjectionState {
  return {
    ...state,
    indexStatus: 'indexed',
    lastIndexedAt: new Date().toISOString(),
    retryCount: 0,
    lastError: null,
  };
}

export function markIndexFailed(
  state: SearchProjectionState,
  error: string
): SearchProjectionState {
  return {
    ...state,
    indexStatus: 'not_indexed',
    lastError: error,
    retryCount: state.retryCount + 1,
  };
}

export function markDeindexing(state: SearchProjectionState): SearchProjectionState {
  return {
    ...state,
    indexStatus: 'deindexing',
    retryCount: 0,
  };
}

export function markDeindexed(state: SearchProjectionState): SearchProjectionState {
  return {
    ...state,
    indexStatus: 'deindexed',
    lastIndexedAt: null,
    retryCount: 0,
    lastError: null,
  };
}

// ============================================================================
// Projection Queries
// ============================================================================

export interface SearchProjectionFilter {
  listingType?: ListingType;
  authorId?: string;
  status?: ContentItemStatus;
  visibility?: Visibility;
  minPrice?: number;
  maxPrice?: number;
  location?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export function filterSearchProjections(
  projections: SearchListingProjection[],
  filter: SearchProjectionFilter
): SearchListingProjection[] {
  return projections.filter((p) => {
    if (filter.listingType && p.listingType !== filter.listingType) return false;
    if (filter.authorId && p.authorId !== filter.authorId) return false;
    if (filter.status && p.status !== filter.status) return false;
    if (filter.visibility && p.visibility !== filter.visibility) return false;
    if (filter.minPrice !== undefined && (p.price === null || p.price < filter.minPrice)) return false;
    if (filter.maxPrice !== undefined && (p.price === null || p.price > filter.maxPrice)) return false;
    if (filter.location && !p.location?.toLowerCase().includes(filter.location.toLowerCase())) return false;
    if (filter.query) {
      const q = filter.query.toLowerCase();
      if (
        !p.title.toLowerCase().includes(q) &&
        !p.description.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });
}

// ============================================================================
// Event Ordering Test Cases
// ============================================================================

export function testEventOrdering(): void {
  // Test 1: ListingPublished v1 arrives AFTER ListingPriceChanged v2 → v2 wins
  const priceChangedV2 = {
    eventId: '2',
    aggregateType: 'listing',
    aggregateId: 'listing-1',
    eventType: 'ListingPriceChanged',
    eventVersion: 2,
    occurredAt: '2024-01-01T12:00:00Z',
    causationId: '1',
    causationType: 'user_action' as const,
    payload: { listingId: 'listing-1', oldPrice: 100, newPrice: 200, changedAt: '2024-01-01T12:00:00Z' },
  };

  const publishedV1 = {
    eventId: '1',
    aggregateType: 'listing',
    aggregateId: 'listing-1',
    eventType: 'ListingPublished',
    eventVersion: 1,
    occurredAt: '2024-01-01T11:00:00Z',
    causationId: '2',
    causationType: 'user_action' as const,
    payload: { listingId: 'listing-1', authorId: 'user-1', listingType: 'real_estate' as ListingType, visibility: 'public' as Visibility, publishedAt: '2024-01-01T11:00:00Z' },
  };

  // Process in order: published v1, then price changed v2
  const result1 = handleListingPublished(publishedV1 as DomainEvent<ListingPublishedEvent>, null, null);
  const result2 = handleListingPriceChanged(priceChangedV2 as DomainEvent<ListingPriceChangedEvent>, result1.projection ?? null, result1.state ?? null);

  console.assert(result2.success, 'Price change v2 should be accepted after published v1');
  console.assert(result2.state?.aggregateVersion === 2, 'Version should be 2');

  // Test 2: ListingPriceChanged v3 arrives AFTER ListingPublished v2 → v3 wins
  const priceChangedV3 = {
    eventId: '3',
    aggregateType: 'listing',
    aggregateId: 'listing-1',
    eventType: 'ListingPriceChanged',
    eventVersion: 3,
    occurredAt: '2024-01-01T13:00:00Z',
    causationId: '3',
    causationType: 'user_action' as const,
    payload: { listingId: 'listing-1', oldPrice: 200, newPrice: 300, changedAt: '2024-01-01T13:00:00Z' },
  };

  const publishedV2 = {
    eventId: '2',
    aggregateType: 'listing',
    aggregateId: 'listing-1',
    eventType: 'ListingPublished',
    eventVersion: 2,
    occurredAt: '2024-01-01T12:30:00Z',
    causationId: '2',
    causationType: 'user_action' as const,
    payload: { listingId: 'listing-1', authorId: 'user-1', listingType: 'real_estate' as ListingType, visibility: 'public' as Visibility, publishedAt: '2024-01-01T12:30:00Z' },
  };

  const result3 = handleListingPublished(publishedV2 as DomainEvent<ListingPublishedEvent>, null, null);
  const result4 = handleListingPriceChanged(priceChangedV3 as DomainEvent<ListingPriceChangedEvent>, result3.projection ?? null, result3.state ?? null);

  console.assert(result4.success, 'Price change v3 should be accepted after published v2');
  console.assert(result4.state?.aggregateVersion === 3, 'Version should be 3');

  // Test 3: Out-of-order delivery: v3 then v1 → v3 wins
  const result5 = handleListingPriceChanged(priceChangedV3 as DomainEvent<ListingPriceChangedEvent>, null, null);
  const result6 = handleListingPublished(publishedV1 as DomainEvent<ListingPublishedEvent>, result5.projection ?? null, result5.state ?? null);

  console.assert(!result6.success, 'Stale event v1 should be rejected after v3');
  console.assert(result6.error?.includes('Stale event'), 'Should reject stale event');
}
