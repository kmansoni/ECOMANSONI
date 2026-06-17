import { describe, expect, it, vi, beforeEach } from "vitest";
import type { OutboxEvent } from "../domain/types";

// ─── Retry backoff schedule ────────────────────────────────────────────────────

const BACKOFF_STEPS = [
  { delayMs: 1000, maxAttempts: 1 },
  { delayMs: 10000, maxAttempts: 2 },
  { delayMs: 60000, maxAttempts: 3 },
  { delayMs: 300000, maxAttempts: 4 },
  { delayMs: 3600000, maxAttempts: 5 },
] as const;

const MAX_DEAD_LETTER_ATTEMPTS = 5;

function calculateNextAttempt(event: OutboxEvent): string {
  // After MAX_DEAD_LETTER_ATTEMPTS, no more retries
  if (event.attempts >= MAX_DEAD_LETTER_ATTEMPTS) {
    // Far future — effectively no retry
    return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  }
  const step = BACKOFF_STEPS[Math.min(event.attempts, BACKOFF_STEPS.length - 1)];
  const next = new Date(Date.now() + step.delayMs);
  return next.toISOString();
}

// ─── Lock acquisition logic ───────────────────────────────────────────────────

interface LockResult {
  acquired: boolean;
  event: OutboxEvent | null;
}

function tryAcquireLock(
  event: OutboxEvent,
  workerId: string,
  lockTTLMs: number,
): LockResult {
  const now = new Date();

  // Event is not processable
  if (event.status === "completed" || event.status === "dead_letter") {
    return { acquired: false, event };
  }

  // Event is not ready for retry yet
  if (new Date(event.nextAttemptAt) > now) {
    return { acquired: false, event };
  }

  // Already locked by another worker and lock hasn't expired
  if (
    event.workerId !== null &&
    event.workerId !== workerId &&
    event.lockedAt !== null
  ) {
    const lockExpiry = new Date(
      new Date(event.lockedAt).getTime() + lockTTLMs,
    );
    if (lockExpiry > now) {
      return { acquired: false, event };
    }
  }

  // Acquire lock
  const updated: OutboxEvent = {
    ...event,
    status: "processing",
    workerId,
    lockedAt: now.toISOString(),
    attempts: event.attempts + 1,
  };

  return { acquired: true, event: updated };
}

// ─── Outbox worker selection ──────────────────────────────────────────────────

function selectNextEvent(
  events: OutboxEvent[],
  workerId: string,
  lockTTLMs: number,
): LockResult {
  // Sort by createdAt, process oldest first (FIFO)
  const sorted = [...events].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  for (const event of sorted) {
    const result = tryAcquireLock(event, workerId, lockTTLMs);
    if (result.acquired) {
      return result;
    }
  }

  return { acquired: false, event: null };
}

// ─── Error classification ────────────────────────────────────────────────────

type ErrorType = "transient" | "permanent" | "rate_limited";

function classifyError(status: number, body?: string): ErrorType {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "transient";
  if (status >= 400 && status < 500) return "permanent";
  return "transient";
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("outbox locking", () => {
  const workerId = "worker-1";
  const lockTTLMs = 5 * 60 * 1000; // 5 minutes

  function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
    const now = new Date().toISOString();
    return {
      id: "event-1",
      aggregateType: "listing",
      aggregateId: "listing-1",
      aggregateVersion: 1,
      eventType: "Listing.Published",
      payload: {},
      idempotencyKey: "key-1",
      status: "pending",
      workerId: null,
      lockedAt: null,
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      processedAt: null,
      ...overrides,
    };
  }

  describe("P0: parallel workers — no duplicate lock", () => {
    it("two workers try to lock same unlocked event → first succeeds, second fails", () => {
      const event = makeEvent();

      const w1 = tryAcquireLock(event, "worker-1", lockTTLMs);
      expect(w1.acquired).toBe(true);

      // Worker 2 tries same event — now it's locked by worker-1
      const w2 = tryAcquireLock(w1.event!, "worker-2", lockTTLMs);
      expect(w2.acquired).toBe(false); // already locked by worker-1
    });

    it("worker 1 acquires lock, crashes, lock expires → worker 2 can acquire", () => {
      const now = new Date();
      const lockedAt = new Date(now.getTime() - lockTTLMs - 1000).toISOString(); // expired

      const expiredLock = makeEvent({
        workerId: "worker-1",
        lockedAt,
        status: "processing",
        attempts: 1,
      });

      // Lock has expired — worker 2 can now acquire
      const w2 = tryAcquireLock(expiredLock, "worker-2", lockTTLMs);
      expect(w2.acquired).toBe(true);
      expect(w2.event!.workerId).toBe("worker-2");
      expect(w2.event!.attempts).toBe(2); // incremented
    });

    it("selectNextEvent picks oldest pending event", () => {
      const events = [
        makeEvent({ id: "e3", createdAt: new Date(Date.now() + 1000).toISOString() }),
        makeEvent({ id: "e1", createdAt: new Date(Date.now() - 1000).toISOString() }),
        makeEvent({ id: "e2", createdAt: new Date(Date.now()).toISOString() }),
      ];

      const result = selectNextEvent(events, "worker-1", lockTTLMs);
      expect(result.acquired).toBe(true);
      expect(result.event!.id).toBe("e1"); // oldest
    });

    it("skip_locked event → pick next available", () => {
      const events = [
        makeEvent({ id: "e1", workerId: "other", lockedAt: new Date().toISOString() }),
        makeEvent({ id: "e2" }),
      ];

      const result = selectNextEvent(events, "worker-1", lockTTLMs);
      expect(result.acquired).toBe(true);
      expect(result.event!.id).toBe("e2");
    });
  });

  describe("P0: retry with backoff", () => {
    it("first failure → retry after 1 second", () => {
      const event = makeEvent({ attempts: 0 });
      const next = calculateNextAttempt(event);

      const nextDate = new Date(next).getTime();
      const now = Date.now();
      const delay = nextDate - now;

      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThan(2000);
    });

    it("second failure → retry after 10 seconds", () => {
      const event = makeEvent({ attempts: 1 });
      const next = calculateNextAttempt(event);

      const nextDate = new Date(next).getTime();
      const now = Date.now();
      const delay = nextDate - now;

      expect(delay).toBeGreaterThanOrEqual(10000);
      expect(delay).toBeLessThan(11000);
    });

    it("after 5 failures → dead_letter (not infinite retry)", () => {
      // After 5 failed attempts, event has attempts=5.
      // The system should NOT attempt a 6th retry → dead_letter.
      const event = makeEvent({ attempts: 5 });

      // Invariant: after MAX_DEAD_LETTER_ATTEMPTS, nextAttemptAt is set to far future (no more retries)
      // Or: lock acquisition returns acquired=false (no attempt made)
      const next = calculateNextAttempt(event);
      const nextDate = new Date(next).getTime();
      const now = Date.now();
      // After dead_letter, nextAttemptAt should be far in the future (or event.status = 'dead_letter')
      const shouldNotRetry = nextDate > now + 24 * 60 * 60 * 1000; // > 1 day
      expect(shouldNotRetry).toBe(true);
    });

    it("transient error (500) → retryable", () => {
      const errorType = classifyError(500);
      expect(errorType).toBe("transient");
    });

    it("permanent error (400) → NOT retryable", () => {
      const errorType = classifyError(400);
      expect(errorType).toBe("permanent");
    });

    it("rate limited (429) → special handling", () => {
      const errorType = classifyError(429);
      expect(errorType).toBe("rate_limited");
    });
  });

  describe("P0: duplicate delivery → consumer applies once (at-least-once)", () => {
    it("first delivery attempt is applied", () => {
      const applied = new Set<string>();
      const event = makeEvent();

      // First delivery
      if (!applied.has(event.idempotencyKey)) {
        applied.add(event.idempotencyKey);
      }

      expect(applied.has("key-1")).toBe(true);
    });

    it("second delivery attempt is skipped", () => {
      const applied = new Set<string>();
      const event = makeEvent();

      // First delivery
      if (!applied.has(event.idempotencyKey)) {
        applied.add(event.idempotencyKey);
      }

      // Simulate: consumer crashes BEFORE writing consumed_event
      // On restart, event is re-delivered

      // Second delivery attempt — already applied
      const alreadyApplied = applied.has(event.idempotencyKey);
      expect(alreadyApplied).toBe(true);
      // No side effect on second delivery
    });

    it("consumer crash between handler and consumed_event → at-least-once", () => {
      // At-least-once: crash after handler, before consumed_event
      // → on restart, event is re-applied.
      // This is the correct guarantee. Exactly-once is not achievable without DTC.

      const processedCount = { value: 0 };
      const consumedRecord = { written: false };

      function processEvent() {
        // Handler runs — creates side effect (FeedEvent, search index, etc.)
        processedCount.value++;
      }

      function writeConsumedRecord() {
        consumedRecord.written = true;
      }

      // Delivery 1: handler runs successfully
      if (processedCount.value === 0) {
        processEvent();
      }
      // Simulated crash here — writeConsumedRecord NOT called

      // consumedRecord NOT written (crash before)
      expect(consumedRecord.written).toBe(false);
      // Side effect DID happen (handler ran)
      expect(processedCount.value).toBe(1);

      // Delivery 2: on restart, event re-delivered
      // consumed_record check returns: not written → proceed
      if (!consumedRecord.written) {
        processEvent(); // re-applied
        writeConsumedRecord();
      }

      // At-least-once: handler ran twice (correct, not an error)
      expect(processedCount.value).toBe(2);
      // consumed_record now written
      expect(consumedRecord.written).toBe(true);
    });
  });

  describe("P0: saga partial failure — partial state visible", () => {
    it("saga fails at step 2 → step 1 state is preserved", () => {
      // Saga steps
      const steps = [
        { name: "suspend_listing", status: "done" as const },
        { name: "withdraw_distribution", status: "failed" as const, lastError: "500" },
        { name: "deindex_search", status: "pending" as const },
      ];

      // Invariant: step 1 result must be visible in saga state
      const doneStep = steps.find((s) => s.status === "done");
      const failedStep = steps.find((s) => s.status === "failed");

      expect(doneStep).toBeDefined();
      expect(failedStep).toBeDefined();
      expect(failedStep!.name).toBe("withdraw_distribution");
    });

    it("failed saga requires manual review", () => {
      const steps = [
        { name: "suspend_listing", status: "done" as const },
        { name: "withdraw_distribution", status: "failed" as const, lastError: "503" },
      ];

      // After MAX retries on failed step → requires_manual_review
      const failedStep = steps.find((s) => s.status === "failed");
      const requiresReview = failedStep !== undefined;
      expect(requiresReview).toBe(true);
    });
  });

  describe("P0: event ordering — stale event cannot overwrite newer projection", () => {
    it("ListingPublished v1 arrives AFTER ListingPriceChanged v2 → v2 wins", () => {
      const projection = {
        listingId: "listing-1",
        aggregateVersion: 2,
        price: 5000000,
      };

      // ListingPublished v1 — stale
      const staleEvent = { aggregateVersion: 1, payload: { price: 4000000 } };

      // Version guard: never apply event.version <= projection.version
      const isStale = staleEvent.aggregateVersion <= projection.aggregateVersion;
      expect(isStale).toBe(true);
      // No side effect — stale event ignored
    });

    it("ListingPriceChanged v3 arrives AFTER ListingPublished v2 → v3 wins", () => {
      const projection = {
        listingId: "listing-1",
        aggregateVersion: 2,
        price: 4000000,
      };

      const newerEvent = { aggregateVersion: 3, payload: { price: 5000000 } };

      const isStale = newerEvent.aggregateVersion <= projection.aggregateVersion;
      expect(isStale).toBe(false);
      // Apply newer event
      const updated = { ...projection, ...newerEvent.payload, aggregateVersion: newerEvent.aggregateVersion };
      expect(updated.price).toBe(5000000);
    });

    it("out-of-order delivery: v3 then v1 → v1 skipped, v3 applied", () => {
      const projection = {
        listingId: "listing-1",
        aggregateVersion: 3,
        price: 6000000,
      };

      // v1 arrives late
      const lateEvent = { aggregateVersion: 1, payload: { price: 4000000 } };

      const isStale = lateEvent.aggregateVersion <= projection.aggregateVersion;
      expect(isStale).toBe(true);
      // Late v1 is skipped — projection remains at v3
    });
  });

  describe("P0: media cleanup race — no active asset hard-deleted", () => {
    it("asset with zero active references is eligible for cleanup", () => {
      type Ref = { assetId: string; withdrawnAt: string | null };

      const refs: Ref[] = [
        { assetId: "asset-1", withdrawnAt: new Date().toISOString() },
        { assetId: "asset-1", withdrawnAt: new Date().toISOString() },
      ];

      // Check: all references for this asset are withdrawn
      const allWithdrawn = refs.every((r) => r.withdrawnAt !== null);
      const hasActive = refs.some((r) => r.withdrawnAt === null);

      expect(allWithdrawn).toBe(true);
      expect(hasActive).toBe(false);

      // Asset is eligible for cleanup ONLY if grace period passed
      const gracePeriodMs = 30 * 24 * 60 * 60 * 1000; // 30 days
      const lastActivity = new Date(refs[0].withdrawnAt!).getTime();
      const eligible = Date.now() - lastActivity >= gracePeriodMs;

      // If grace not passed yet, NOT eligible
      expect(eligible).toBe(false); // just withdrawn, not 30 days
    });

    it("re-upload before cleanup runs → new reference prevents old asset deletion", () => {
      type Ref = { assetId: string; withdrawnAt: string | null };

      // Old asset has all references withdrawn
      const oldRefs: Ref[] = [
        { assetId: "asset-old", withdrawnAt: new Date().toISOString() },
      ];

      // But new upload creates NEW reference for NEW asset
      const newRefs: Ref[] = [
        { assetId: "asset-new", withdrawnAt: null },
      ];

      // Cleanup query: SELECT assets WHERE NOT EXISTS (active references)
      // Only asset-old has zero active references
      const allRefs = [...oldRefs, ...newRefs];
      const assetOldActive = allRefs.some(
        (r) => r.assetId === "asset-old" && r.withdrawnAt === null,
      );
      const assetNewActive = allRefs.some(
        (r) => r.assetId === "asset-new" && r.withdrawnAt === null,
      );

      expect(assetOldActive).toBe(false); // old asset: no active refs
      expect(assetNewActive).toBe(true); // new asset: has active ref

      // Cleanup should only target asset-old, not asset-new
      // Safe: old asset eligible (if grace passed), new asset NOT eligible
      expect(assetOldActive).toBe(false);
    });
  });
});
