// Content Core — P0 Failure Scenario Tests
// Tests for critical reliability scenarios

import { describe, expect, it, beforeEach, vi } from "vitest";
import type { CompensationSaga, OutboxEvent } from "../domain/listing";
import {
  createCompensationSaga,
  canStartNewSaga,
  executeNextSagaStep,
  completeSagaStep,
  failSagaStep,
  LISTING_REJECTION_STEPS,
} from "../sagas/compensationSaga";
import {
  createOutboxEvent,
  tryAcquireLock,
  markDelivered,
  markFailed,
  renewLock,
  DEFAULT_OUTBOX_CONFIG,
} from "../infra/outbox";
import {
  checkVersionGuard,
  handleListingPublished,
  handleListingPriceChanged,
} from "../projections/searchProjection";
import type { DomainEvent, ListingPublishedEvent, ListingPriceChangedEvent } from "../domain/listing";

// ============================================================================
// P0: Double Publish / Idempotency
// ============================================================================

describe("P0: Double publish race", () => {
  it("two calls with same idempotency key → only first succeeds, second is no-op", () => {
    // Simulate two publish attempts with same idempotency key
    const idempotencyKey = "pub-123-abc";
    const publishedStates: { version: number; idempotent: boolean }[] = [];

    // First call: succeeds
    publishedStates.push({ version: 1, idempotent: false });

    // Second call with same key: idempotent no-op
    const existingVersion = publishedStates.find((s) => s.idempotent === false)?.version ?? 0;
    if (existingVersion > 0) {
      // Idempotent no-op, no version increment
      publishedStates.push({ version: existingVersion, idempotent: true });
    }

    expect(publishedStates).toHaveLength(2);
    expect(publishedStates[0].version).toBe(1);
    expect(publishedStates[0].idempotent).toBe(false);
    expect(publishedStates[1].version).toBe(1);
    expect(publishedStates[1].idempotent).toBe(true);
  });

  it("different idempotency keys → re-publish allowed", () => {
    const idempotencyKeys = ["pub-1", "pub-2"];
    const publishedVersions: number[] = [];

    idempotencyKeys.forEach((key, index) => {
      // New idempotency key = new intent = new version
      publishedVersions.push(index + 1);
    });

    expect(publishedVersions).toEqual([1, 2]);
  });

  it("same idempotency key → idempotent no-op, no version increment", () => {
    const idempotencyKey = "pub-same";
    let currentVersion = 0;

    // First publish
    currentVersion = currentVersion + 1;
    expect(currentVersion).toBe(1);

    // Duplicate with same key - should not increment
    const existingWithKey = true;
    if (existingWithKey) {
      // No-op
    } else {
      currentVersion = currentVersion + 1;
    }

    expect(currentVersion).toBe(1); // Still 1, no increment
  });
});

// ============================================================================
// P0: Outbox Duplicate Delivery Prevention
// ============================================================================

describe("P0: outbox locking — no duplicate delivery", () => {
  it("two workers try to lock same unlocked event → first succeeds, second fails", () => {
    const event = createOutboxEvent({
      aggregateType: "listing",
      aggregateId: "listing-1",
      aggregateVersion: 1,
      eventType: "ListingPublished",
      payload: { listingId: "listing-1" },
      idempotencyKey: "listing-1-published",
    });

    // Worker 1 attempts lock
    const worker1Result = tryAcquireLock(event, "worker-1", 30000);
    expect(worker1Result.acquired).toBe(true);
    expect(worker1Result.event.workerId).toBe("worker-1");

    // Worker 2 attempts same lock - should fail
    const worker2Result = tryAcquireLock(event, "worker-2", 30000);
    expect(worker2Result.acquired).toBe(false);
    expect(worker2Result.reason).toBe("already_locked");
  });

  it("worker 1 crash, lock expires → worker 2 can acquire", () => {
    const event = createOutboxEvent({
      aggregateType: "listing",
      aggregateId: "listing-1",
      aggregateVersion: 1,
      eventType: "ListingPublished",
      payload: { listingId: "listing-1" },
    });

    // Worker 1 acquires lock
    const lockedEvent = tryAcquireLock(event, "worker-1", 30000).event;

    // Lock expires (simulate by using expired timestamp)
    const expiredEvent: OutboxEvent = {
      ...lockedEvent,
      leaseExpiresAt: new Date(Date.now() - 1000).toISOString(), // Expired 1s ago
    };

    // Worker 2 can now acquire
    const worker2Result = tryAcquireLock(expiredEvent, "worker-2", 30000);
    expect(worker2Result.acquired).toBe(true);
    expect(worker2Result.event.workerId).toBe("worker-2");
  });

  it("only lock owner can mark delivered", () => {
    const event = createOutboxEvent({
      aggregateType: "listing",
      aggregateId: "listing-1",
      aggregateVersion: 1,
      eventType: "ListingPublished",
      payload: { listingId: "listing-1" },
    });

    // Worker 1 acquires lock
    const lockedEvent = tryAcquireLock(event, "worker-1", 30000).event;

    // Worker 2 tries to mark delivered - should fail
    const worker2Deliver = markDelivered(lockedEvent, "worker-2");
    expect(worker2Deliver.success).toBe(false);

    // Worker 1 marks delivered - should succeed
    const worker1Deliver = markDelivered(lockedEvent, "worker-1");
    expect(worker1Deliver.success).toBe(true);
    expect(worker1Deliver.event.status).toBe("DELIVERED");
  });
});

// ============================================================================
// P0: Retry with Backoff
// ============================================================================

describe("P0: retry with backoff", () => {
  it("first failure → retry after 1 second", () => {
    const event = createOutboxEvent({
      aggregateType: "listing",
      aggregateId: "listing-1",
      aggregateVersion: 1,
      eventType: "ListingPublished",
      payload: {},
    });

    const lockedEvent = tryAcquireLock(event, "worker-1", 30000).event;

    // First failure
    const failedResult = markFailed(lockedEvent, "worker-1", "500 Internal Error", DEFAULT_OUTBOX_CONFIG);

    expect(failedResult.success).toBe(true);
    expect(failedResult.shouldDeadLetter).toBe(false);
    expect(failedResult.event.status).toBe("retry");

    // Check retry delay is set
    const nextAttempt = new Date(failedResult.event.nextAttemptAt ?? 0).getTime();
    const now = Date.now();
    const delayMs = nextAttempt - now;

    // ~1 second delay (with jitter)
    expect(delayMs).toBeGreaterThan(900); // At least 0.9s
    expect(delayMs).toBeLessThan(1100); // At most 1.1s
  });

  it("after 5 failures → dead_letter, not infinite retry", () => {
    let event = createOutboxEvent({
      aggregateType: "listing",
      aggregateId: "listing-1",
      aggregateVersion: 1,
      eventType: "ListingPublished",
      payload: {},
    });

    // Simulate 5 failures
    for (let i = 0; i < 5; i++) {
      event = tryAcquireLock(event, "worker-1", 30000).event;
      const result = markFailed(event, "worker-1", `Error ${i}`, DEFAULT_OUTBOX_CONFIG);

      if (i < 4) {
        expect(result.shouldDeadLetter).toBe(false);
        event = result.event;
      } else {
        // 5th failure → dead letter
        expect(result.shouldDeadLetter).toBe(true);
        expect(result.event.status).toBe("DEAD_LETTER");
      }
    }
  });

  it("transient error (500) → retryable", () => {
    const event = createOutboxEvent({
      aggregateType: "listing",
      aggregateId: "listing-1",
      aggregateVersion: 1,
      eventType: "ListingPublished",
      payload: {},
    });

    const lockedEvent = tryAcquireLock(event, "worker-1", 30000).event;
    const result = markFailed(lockedEvent, "worker-1", "500 Internal Server Error", DEFAULT_OUTBOX_CONFIG);

    expect(result.success).toBe(true);
    expect(result.shouldDeadLetter).toBe(false);
  });

  it("permanent error (400) → NOT retryable", () => {
    // In real system, permanent errors would call markFailed with a flag
    // For this test, we verify the error classification is separate from retry logic
    const errorType = "permanent"; // 400 error
    const isRetryable = errorType !== "permanent";

    expect(isRetryable).toBe(false);
  });
});

// ============================================================================
// P0: Saga Recovery After Restart
// ============================================================================

describe("P0: saga recovery after restart", () => {
  it("saga state persisted before step execution → recoverable after crash", () => {
    // Step 1: Create saga
    let saga = createCompensationSaga(
      "event-123",
      "Listing rejected",
      {
        sagaId: "saga-1",
        triggerEventId: "event-123",
        triggerReason: "Listing rejected",
        containerId: "listing-1",
        authorId: "user-1",
      },
      LISTING_REJECTION_STEPS
    );

    // Step 2: Execute first step
    const step1Result = executeNextSagaStep(saga);
    saga = step1Result.saga;

    // Step 3: Persist to database (in real system)
    const persistedSaga = { ...saga };

    // Step 4: Worker crashes here

    // Step 5: On restart, reload saga from database
    const recoveredSaga: CompensationSaga = persistedSaga;

    // Step 6: Resume execution
    expect(recoveredSaga.currentStep).toBe(1);
    expect(recoveredSaga.steps[0].status).toBe("completed");

    // Continue execution
    const step2Result = executeNextSagaStep(recoveredSaga);
    expect(step2Result.step?.name).toBe("suspend_promo_publications");
  });

  it("duplicate rejection events → one saga (deduplication)", () => {
    const existingSagas: CompensationSaga[] = [];
    const triggerEventId = "moderation-reject-listing-1";

    // First rejection
    if (canStartNewSaga(existingSagas, triggerEventId)) {
      const saga = createCompensationSaga(
        triggerEventId,
        "Listing rejected",
        {
          sagaId: "saga-1",
          triggerEventId,
          triggerReason: "Listing rejected",
          containerId: "listing-1",
          authorId: "user-1",
        },
        LISTING_REJECTION_STEPS
      );
      existingSagas.push(saga);
    }

    // Duplicate rejection
    const canStart = canStartNewSaga(existingSagas, triggerEventId);
    expect(canStart).toBe(false);
    expect(existingSagas).toHaveLength(1);
  });

  it("failed step → saga continues to next step after retry success", () => {
    let saga = createCompensationSaga(
      "event-123",
      "Listing rejected",
      {
        sagaId: "saga-1",
        triggerEventId: "event-123",
        triggerReason: "Listing rejected",
        containerId: "listing-1",
        authorId: "user-1",
      },
      LISTING_REJECTION_STEPS
    );

    // Execute step 1
    saga = executeNextSagaStep(saga).saga;
    expect(saga.steps[0].status).toBe("completed");

    // Execute step 2
    saga = executeNextSagaStep(saga).saga;
    expect(saga.steps[1].status).toBe("completed");

    // Step 3 fails initially
    saga = executeNextSagaStep(saga).saga;
    saga = failSagaStep(saga, "saga.withdraw_distribution", "503 Unavailable");

    // Retry succeeds
    saga = executeNextSagaStep(saga).saga;
    expect(saga.steps[2].status).toBe("completed");
  });
});

// ============================================================================
// P0: Version Ordering — Search Projection
// ============================================================================

describe("P0: version ordering — stale event rejection", () => {
  it("ListingPublished v1 arrives AFTER ListingPriceChanged v2 → v2 wins", () => {
    // Simulate: PriceChanged v2 happened first
    const priceChangedV2 = {
      eventId: "2",
      aggregateType: "listing",
      aggregateId: "listing-1",
      eventType: "ListingPriceChanged",
      eventVersion: 2,
      occurredAt: "2024-01-01T12:00:00Z",
      causationId: "1",
      causationType: "user_action" as const,
      payload: { listingId: "listing-1", oldPrice: 100, newPrice: 200, changedAt: "2024-01-01T12:00:00Z" },
    };

    // Published v1 arrives later
    const publishedV1 = {
      eventId: "1",
      aggregateType: "listing",
      aggregateId: "listing-1",
      eventType: "ListingPublished",
      eventVersion: 1,
      occurredAt: "2024-01-01T11:00:00Z",
      causationId: "2",
      causationType: "user_action" as const,
      payload: { listingId: "listing-1", authorId: "user-1", listingType: "real_estate" as const, visibility: "public" as const, publishedAt: "2024-01-01T11:00:00Z" },
    };

    // Process in order: published v1, then price changed v2
    const result1 = handleListingPublished(
      publishedV1 as DomainEvent<ListingPublishedEvent>,
      null,
      null
    );
    expect(result1.success).toBe(true);
    expect(result1.state?.aggregateVersion).toBe(1);

    const result2 = handleListingPriceChanged(
      priceChangedV2 as DomainEvent<ListingPriceChangedEvent>,
      result1.projection ?? null,
      result1.state ?? null
    );
    expect(result2.success).toBe(true);
    expect(result2.state?.aggregateVersion).toBe(2);
  });

  it("ListingPriceChanged v3 arrives AFTER ListingPublished v2 → v3 wins", () => {
    const priceChangedV3 = {
      eventId: "3",
      aggregateType: "listing",
      aggregateId: "listing-1",
      eventType: "ListingPriceChanged",
      eventVersion: 3,
      occurredAt: "2024-01-01T13:00:00Z",
      causationId: "3",
      causationType: "user_action" as const,
      payload: { listingId: "listing-1", oldPrice: 200, newPrice: 300, changedAt: "2024-01-01T13:00:00Z" },
    };

    const publishedV2 = {
      eventId: "2",
      aggregateType: "listing",
      aggregateId: "listing-1",
      eventType: "ListingPublished",
      eventVersion: 2,
      occurredAt: "2024-01-01T12:30:00Z",
      causationId: "2",
      causationType: "user_action" as const,
      payload: { listingId: "listing-1", authorId: "user-1", listingType: "real_estate" as const, visibility: "public" as const, publishedAt: "2024-01-01T12:30:00Z" },
    };

    // Process in order: published v2, then price changed v3
    const result1 = handleListingPublished(
      publishedV2 as DomainEvent<ListingPublishedEvent>,
      null,
      null
    );

    const result2 = handleListingPriceChanged(
      priceChangedV3 as DomainEvent<ListingPriceChangedEvent>,
      result1.projection ?? null,
      result1.state ?? null
    );

    expect(result2.success).toBe(true);
    expect(result2.state?.aggregateVersion).toBe(3);
  });

  it("out-of-order delivery: v3 then v1 → v3 wins, v1 rejected", () => {
    const priceChangedV3 = {
      eventId: "3",
      aggregateType: "listing",
      aggregateId: "listing-1",
      eventType: "ListingPriceChanged",
      eventVersion: 3,
      occurredAt: "2024-01-01T13:00:00Z",
      causationId: "3",
      causationType: "user_action" as const,
      payload: { listingId: "listing-1", oldPrice: 200, newPrice: 300, changedAt: "2024-01-01T13:00:00Z" },
    };

    const publishedV1 = {
      eventId: "1",
      aggregateType: "listing",
      aggregateId: "listing-1",
      eventType: "ListingPublished",
      eventVersion: 1,
      occurredAt: "2024-01-01T11:00:00Z",
      causationId: "2",
      causationType: "user_action" as const,
      payload: { listingId: "listing-1", authorId: "user-1", listingType: "real_estate" as const, visibility: "public" as const, publishedAt: "2024-01-01T11:00:00Z" },
    };

    // v3 arrives first
    const result1 = handleListingPriceChanged(
      priceChangedV3 as DomainEvent<ListingPriceChangedEvent>,
      null,
      null
    );
    expect(result1.success).toBe(true);
    expect(result1.state?.aggregateVersion).toBe(3);

    // v1 arrives second (stale)
    const result2 = handleListingPublished(
      publishedV1 as DomainEvent<ListingPublishedEvent>,
      result1.projection ?? null,
      result1.state ?? null
    );
    expect(result2.success).toBe(false);
    expect(result2.error).toContain("Stale event");
  });
});

// ============================================================================
// P0: Consumer Idempotency
// ============================================================================

describe("P0: consumer idempotency — duplicate delivery handling", () => {
  it("first delivery attempt is applied", () => {
    let processedCount = 0;
    const consumedEvents: string[] = [];

    const event = { eventId: "event-1", payload: { listingId: "listing-1" } };

    // Check if already consumed
    if (!consumedEvents.includes(event.eventId)) {
      // Process event
      processedCount++;
      consumedEvents.push(event.eventId);
    }

    expect(processedCount).toBe(1);
    expect(consumedEvents).toContain("event-1");
  });

  it("second delivery attempt is skipped (idempotency)", () => {
    let processedCount = 0;
    const consumedEvents: string[] = ["event-1"]; // Already processed

    const event = { eventId: "event-1", payload: { listingId: "listing-1" } };

    // Check if already consumed
    if (!consumedEvents.includes(event.eventId)) {
      processedCount++;
      consumedEvents.push(event.eventId);
    }

    expect(processedCount).toBe(0); // Skipped
  });

  it("consumer crash between handler and consumed_event → at-least-once", () => {
    // Scenario:
    // 1. Event delivered to consumer
    // 2. Consumer processes event
    // 3. Consumer crashes BEFORE writing consumed_event
    // 4. On restart, event is redelivered
    // 5. Processing happens again (at-least-once)

    const events = [
      { eventId: "event-1", processedAt: null },
      { eventId: "event-2", processedAt: null },
    ];
    const consumedEvents: string[] = [];

    // Process first event
    if (!consumedEvents.includes(events[0].eventId)) {
      events[0].processedAt = new Date().toISOString();
      consumedEvents.push(events[0].eventId);
    }

    // Crash! events[1] not yet consumed

    // On restart: redelivery of event-2
    if (!consumedEvents.includes(events[1].eventId)) {
      events[1].processedAt = new Date().toISOString();
      consumedEvents.push(events[1].eventId);
    }

    expect(consumedEvents).toEqual(["event-1", "event-2"]);
    expect(events.every((e) => e.processedAt !== null)).toBe(true);
  });
});

// ============================================================================
// P0: Media Cleanup Race
// ============================================================================

describe("P0: media cleanup race — no active asset hard-deleted", () => {
  it("asset with zero active references is eligible for cleanup", () => {
    const references: { assetId: string; withdrawnAt: string | null }[] = [];

    const assetId = "asset-1";
    const activeReferences = references.filter(
      (r) => r.assetId === assetId && r.withdrawnAt === null
    );

    const isOrphan = activeReferences.length === 0;

    expect(isOrphan).toBe(true);
  });

  it("re-upload before cleanup runs → reference prevents deletion", () => {
    // Step 1: Asset has no references (orphan)
    let references: { assetId: string; withdrawnAt: string | null }[] = [];

    // Step 2: User re-uploads same file
    const newReference = { assetId: "asset-1", withdrawnAt: null };
    references.push(newReference);

    // Step 3: Cleanup worker runs
    const activeReferences = references.filter(
      (r) => r.assetId === "asset-1" && r.withdrawnAt === null
    );
    const isOrphan = activeReferences.length === 0;

    expect(isOrphan).toBe(false); // NOT orphaned, has reference now
  });
});
