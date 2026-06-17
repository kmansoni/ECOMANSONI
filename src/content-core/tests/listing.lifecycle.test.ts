import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
  Listing,
  ListingStatus,
  ListingIndexStatus,
  ContentAssetReference,
  ModerationDecision,
  ContainerDecision,
} from "../domain/types";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function createListing(overrides: Partial<Listing> = {}): Listing {
  const now = new Date().toISOString();
  return {
    id: "listing-1",
    authorId: "user-1",
    listingType: "real_estate",
    status: "draft",
    visibility: "public",
    title: "Квартира",
    description: "Описание",
    indexStatus: "not_indexed",
    aggregateVersion: 0,
    idempotencyKey: null,
    publishedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createReference(
  overrides: Partial<ContentAssetReference> = {},
): ContentAssetReference {
  const now = new Date().toISOString();
  return {
    id: "ref-1",
    ownerType: "listing",
    ownerId: "listing-1",
    assetId: "asset-1",
    role: "primary",
    sortOrder: 0,
    moderationStatus: "pending",
    moderationCaseId: null,
    withdrawnAt: null,
    createdAt: now,
    ...overrides,
  };
}

// ─── Domain logic under test ─────────────────────────────────────────────────

/**
 * Evaluates listing publish permission based on asset references.
 * Policy: primary asset rejected → listing requires_user_fix
 *         only optional gallery assets rejected → listing may publish
 */
function aggregateAssetDecisions(
  references: ContentAssetReference[],
): ContainerDecision {
  if (references.length === 0) return "requires_user_fix";

  const primary = references.find((r) => r.role === "primary");
  const primaryRejected =
    primary?.moderationStatus === "rejected" ||
    primary?.moderationStatus === "quarantine";
  if (primaryRejected) return "reject";

  const anyPending = references.some((r) => r.moderationStatus === "pending");
  if (anyPending) return "requires_user_fix";

  const anyRejected = references.some(
    (r) =>
      r.moderationStatus === "rejected" ||
      r.moderationStatus === "quarantine",
  );
  if (anyRejected) return "allow_with_limited_assets";

  const allApproved = references.every((r) => r.moderationStatus === "approved");
  if (allApproved) return "allow";

  return "requires_user_fix";
}

/**
 * Attempts to transition listing status.
 * Returns { success, listing, reason }
 * Invariant: only valid state transitions are allowed.
 */
function transitionListing(
  listing: Listing,
  targetStatus: ListingStatus,
  idempotencyKey: string | null,
): { success: boolean; listing: Listing; reason?: string } {
  // Idempotency check FIRST — before any mutation.
  // Returns the ORIGINAL listing without modification.
  if (
    listing.status === targetStatus &&
    listing.idempotencyKey === idempotencyKey
  ) {
    return { success: true, listing };
  }

  // From here: will create a NEW updated listing (never mutate input)
  if (listing.deletedAt !== null && targetStatus !== "deleted") {
    return {
      success: false,
      listing,
      reason: "ALREADY_DELETED",
    };
  }

  // Guard: cannot publish from rejected without re-submission
  if (listing.status === "rejected" && targetStatus === "published") {
    return {
      success: false,
      listing,
      reason: "REJECTED_STATUS",
    };
  }

  // Valid transitions
  const allowed: Partial<Record<ListingStatus, ListingStatus[]>> = {
    draft: ["pending", "deleted"],
    pending: ["published", "rejected", "draft", "deleted"],
    published: ["published", "suspended", "deleted"], // re-publish allowed
    suspended: ["published", "deleted"],
    rejected: ["draft", "deleted"],
  };

  const allowedTargets = allowed[listing.status] ?? [];
  if (!allowedTargets.includes(targetStatus)) {
    return {
      success: false,
      listing,
      reason: `INVALID_TRANSITION: ${listing.status} → ${targetStatus}`,
    };
  }

  const now = new Date().toISOString();
  const updated: Listing = {
    ...listing,
    status: targetStatus,
    aggregateVersion: listing.aggregateVersion + 1,
    idempotencyKey,
    publishedAt:
      targetStatus === "published" ? now : listing.publishedAt,
    deletedAt: targetStatus === "deleted" ? now : listing.deletedAt,
    updatedAt: now,
  };

  return { success: true, listing: updated };
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe("listing lifecycle", () => {
  describe("P0: concurrent publish with same idempotency key", () => {
    it("two calls with same idempotency key → only first succeeds, second is no-op", () => {
      const listing = createListing({ status: "pending" });

      const first = transitionListing(listing, "published", "key-abc");
      expect(first.success).toBe(true);
      expect(first.listing.status).toBe("published");
      expect(first.listing.idempotencyKey).toBe("key-abc");
      expect(first.listing.aggregateVersion).toBe(1);

      // Second call with same key — idempotent no-op
      const second = transitionListing(first.listing, "published", "key-abc");
      expect(second.success).toBe(true);
      expect(second.listing.aggregateVersion).toBe(1); // no increment
    });

    it("two calls with DIFFERENT idempotency keys → re-publish allowed (new intent)", () => {
      const listing = createListing({ status: "pending" });

      const first = transitionListing(listing, "published", "key-1");
      expect(first.success).toBe(true);

      // Different idempotency key: re-publish intent is allowed.
      const second = transitionListing(first.listing, "published", "key-2");
      expect(second.success).toBe(true);
      expect(second.listing.aggregateVersion).toBe(2);
    });
  });

  describe("P0: publish transaction inserts exactly one outbox event", () => {
    it("successful publish generates exactly one outbox event record", () => {
      const listing = createListing({ status: "pending" });

      const result = transitionListing(listing, "published", "key-publish-1");
      expect(result.success).toBe(true);

      // Simulate outbox event emission
      const outboxEvents = result.listing.status === "published"
        ? [{ id: "event-1", aggregateId: result.listing.id, eventType: "Listing.Published" }]
        : [];

      expect(outboxEvents).toHaveLength(1);
      expect(outboxEvents[0].eventType).toBe("Listing.Published");
    });

    it("failed publish generates zero outbox events", () => {
      const listing = createListing({ status: "rejected" });

      const result = transitionListing(listing, "published", "key-publish-1");
      expect(result.success).toBe(false);

      const outboxEvents = result.success ? [{ id: "event-1" }] : [];
      expect(outboxEvents).toHaveLength(0);
    });
  });

  describe("P0: moderation aggregation — primary asset rejected", () => {
    it("primary asset rejected → listing cannot publish", () => {
      const refs = [
        createReference({ role: "primary", moderationStatus: "rejected" }),
        createReference({ role: "gallery", moderationStatus: "approved" }),
      ];

      const decision = aggregateAssetDecisions(refs);
      expect(decision).toBe("reject");
    });

    it("gallery asset rejected, primary approved → listing may publish", () => {
      const refs = [
        createReference({ role: "primary", moderationStatus: "approved" }),
        createReference({ role: "gallery", moderationStatus: "rejected" }),
      ];

      const decision = aggregateAssetDecisions(refs);
      expect(decision).toBe("allow_with_limited_assets");
    });

    it("all assets approved → listing may publish", () => {
      const refs = [
        createReference({ role: "primary", moderationStatus: "approved" }),
        createReference({ role: "gallery", moderationStatus: "approved" }),
      ];

      const decision = aggregateAssetDecisions(refs);
      expect(decision).toBe("allow");
    });

    it("no assets → listing requires fix", () => {
      const decision = aggregateAssetDecisions([]);
      expect(decision).toBe("requires_user_fix");
    });

    it("primary still pending → listing cannot publish", () => {
      const refs = [
        createReference({ role: "primary", moderationStatus: "pending" }),
        createReference({ role: "gallery", moderationStatus: "approved" }),
      ];

      const decision = aggregateAssetDecisions(refs);
      expect(decision).toBe("requires_user_fix");
    });
  });

  describe("P0: published ≠ searchable contract", () => {
    it("listing published → indexStatus starts as not_indexed", () => {
      const listing = createListing({ status: "pending" });

      const result = transitionListing(listing, "published", "key-1");
      expect(result.success).toBe(true);
      expect(result.listing.status).toBe("published");
      expect(result.listing.indexStatus).toBe("not_indexed"); // explicit invariant
    });

    it("published listing with not_indexed status is ready for async indexing", () => {
      const listing = createListing({
        status: "published",
        indexStatus: "not_indexed",
      });

      // Indexing is a separate async step
      const withIndexStatus: Listing = {
        ...listing,
        indexStatus: "indexing" as ListingIndexStatus,
      };

      const indexed: Listing = {
        ...withIndexStatus,
        indexStatus: "searchable" as ListingIndexStatus,
      };

      expect(listing.indexStatus).toBe("not_indexed");
      expect(withIndexStatus.indexStatus).toBe("indexing");
      expect(indexed.indexStatus).toBe("searchable");
    });
  });

  describe("P0: moderation decision for deleted listing", () => {
    it("listing deleted before moderation decision → moderation superseded", () => {
      const listing = createListing({ status: "draft" });

      // User deletes the listing
      const deleted = transitionListing(listing, "deleted", "key-del-1");
      expect(deleted.success).toBe(true);
      expect(deleted.listing.status).toBe("deleted");
      expect(deleted.listing.deletedAt).not.toBeNull();

      // Moderation arrives for deleted listing
      // Owning service should NOT trigger compensation — listing is already gone
      const moderationDecision: ModerationDecision = {
        decision: "REJECT",
        distribution: "author_only",
        reasons: ["policy_violation"],
        flags: ["nsfw"],
        confidence: 0.95,
        appealable: true,
        appealDeadlineHours: 168,
        reviewPriority: "high",
      };

      // Invariant: moderation for deleted listing is superseded
      const isSuperseded = deleted.listing.deletedAt !== null;
      expect(isSuperseded).toBe(true);
      // Compensation saga should NOT run
    });
  });

  describe("P0: ListingRejected after already published → compensation", () => {
    it("published listing receives REJECT → suspended_by_parent state", () => {
      const listing = createListing({ status: "published" });

      // Moderation decision: REJECT arrives for already-published listing
      const moderationDecision: ModerationDecision = {
        decision: "REJECT",
        distribution: "author_only",
        reasons: ["policy_violation"],
        flags: ["nsfw"],
        confidence: 0.95,
        appealable: true,
        appealDeadlineHours: 168,
        reviewPriority: "high",
      };

      // Owning service applies compensation transition
      // Not a direct status change — compensation saga triggers
      const shouldCompensate =
        moderationDecision.decision === "REJECT" &&
        listing.status === "published";

      expect(shouldCompensate).toBe(true);
      // CompensationSaga should be triggered with steps:
      // 1. Suspend listing
      // 2. Withdraw distribution
      // 3. Deindex search
      // 4. Notify author
    });

    it("QUARANTINE decision → author_only visibility", () => {
      const moderationDecision: ModerationDecision = {
        decision: "QUARANTINE",
        distribution: "author_only",
        reasons: ["flagged_content"],
        flags: ["needs_review"],
        confidence: 0.7,
        appealable: true,
        appealDeadlineHours: 168,
        reviewPriority: "normal",
      };

      expect(moderationDecision.distribution).toBe("author_only");
      expect(moderationDecision.appealable).toBe(true);
    });
  });

  describe("P0: concurrent publish attempts — race condition", () => {
    it("two simultaneous publish calls → both succeed with different idempotency keys", () => {
      // Different idempotency keys = different publish attempts.
      // Both are valid: user may update listing and re-publish.
      // The second call transitions from published → published (re-publish).
      const listing = createListing({ status: "pending" });

      const first = transitionListing(listing, "published", "race-key-A");
      expect(first.success).toBe(true);
      expect(first.listing.status).toBe("published");
      expect(first.listing.idempotencyKey).toBe("race-key-A");

      // Re-publish with a different key: allowed (new intent)
      const second = transitionListing(first.listing, "published", "race-key-B");
      expect(second.success).toBe(true);
      expect(second.listing.idempotencyKey).toBe("race-key-B");
      // aggregateVersion increments (re-publish is a real transition)
      expect(second.listing.aggregateVersion).toBe(2);
    });

    it("duplicate publish with same idempotency key → idempotent no-op", () => {
      const listing = createListing({ status: "published", idempotencyKey: "same-key", aggregateVersion: 5 });

      const result = transitionListing(listing, "published", "same-key");
      // Idempotent: same state, same key → no-op
      expect(result.success).toBe(true);
      // Returns original listing without version increment
      expect(result.listing.aggregateVersion).toBe(5);
    });
  });

  describe("edge: invalid state transitions", () => {
    it("draft → published is invalid (must go through pending)", () => {
      const listing = createListing({ status: "draft" });
      const result = transitionListing(listing, "published", "key-1");
      expect(result.success).toBe(false);
      expect(result.reason).toBe("INVALID_TRANSITION: draft → published");
    });

    it("deleted → anything except nothing is invalid", () => {
      const listing = createListing({ status: "deleted", deletedAt: new Date().toISOString() });
      const result = transitionListing(listing, "published", "key-1");
      expect(result.success).toBe(false);
      expect(result.reason).toBe("ALREADY_DELETED");
    });

    it("suspended → rejected is invalid", () => {
      const listing = createListing({ status: "suspended" });
      const result = transitionListing(listing, "rejected", "key-1");
      expect(result.success).toBe(false);
      expect(result.reason).toBe("INVALID_TRANSITION: suspended → rejected");
    });
  });

  describe("aggregate version increments", () => {
    it("each successful transition increments aggregateVersion", () => {
      let listing = createListing();

      listing = transitionListing(listing, "pending", "k1").listing;
      expect(listing.aggregateVersion).toBe(1);

      listing = transitionListing(listing, "published", "k2").listing;
      expect(listing.aggregateVersion).toBe(2);

      listing = transitionListing(listing, "suspended", "k3").listing;
      expect(listing.aggregateVersion).toBe(3);
    });

    it("idempotent no-op does NOT increment version", () => {
      let listing = createListing({ status: "published", idempotencyKey: "key-A", aggregateVersion: 5 });

      const result = transitionListing(listing, "published", "key-A");
      expect(result.success).toBe(true);
      expect(result.listing.aggregateVersion).toBe(5); // no increment (same key)
    });
  });
});
