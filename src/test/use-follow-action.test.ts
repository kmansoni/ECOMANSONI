import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFollowAction } from "@/hooks/useFollowAction";

const repoState = vi.hoisted(() => ({
  followCalls: [] as Array<[string, string]>,
  pending: null as null | Promise<void>,
  resolvePending: null as null | (() => void),
  rejectPending: null as null | ((err: unknown) => void),
  shouldFail: false,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/repositories/followRepository", () => ({
  follow: vi.fn(async (followerId: string, followingId: string) => {
    repoState.followCalls.push([followerId, followingId]);
    if (repoState.pending) {
      await repoState.pending;
    }
    if (repoState.shouldFail) {
      throw new Error("network");
    }
  }),
}));

function primePending() {
  repoState.pending = new Promise<void>((resolve, reject) => {
    repoState.resolvePending = () => resolve();
    repoState.rejectPending = (err) => reject(err);
  });
}

describe("useFollowAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoState.followCalls = [];
    repoState.pending = null;
    repoState.resolvePending = null;
    repoState.rejectPending = null;
    repoState.shouldFail = false;
  });

  it("ignores re-entrant follow while request is in-flight", async () => {
    primePending();
    const { result } = renderHook(() => useFollowAction({ currentUserId: "me" }));

    await act(async () => {
      void result.current.follow("target-1");
      void result.current.follow("target-1");
      void result.current.follow("target-1");
    });

    expect(repoState.followCalls).toHaveLength(1);
    expect(result.current.isPending("target-1")).toBe(true);
    expect(result.current.isFollowed("target-1")).toBe(true);

    await act(async () => {
      repoState.resolvePending?.();
      await repoState.pending;
    });

    await waitFor(() => {
      expect(result.current.isPending("target-1")).toBe(false);
    });
    expect(result.current.isFollowed("target-1")).toBe(true);
  });

  it("is a no-op when target is already followed", async () => {
    const { result } = renderHook(() => useFollowAction({ currentUserId: "me" }));

    act(() => {
      result.current.setInitialFollowing(new Set(["target-2"]));
    });

    await act(async () => {
      const ok = await result.current.follow("target-2");
      expect(ok).toBe(false);
    });

    expect(repoState.followCalls).toHaveLength(0);
  });

  it("rejects self-follow and empty currentUserId", async () => {
    const { result: anon } = renderHook(() => useFollowAction({ currentUserId: null }));
    await act(async () => {
      expect(await anon.current.follow("x")).toBe(false);
    });

    const { result: self } = renderHook(() => useFollowAction({ currentUserId: "me" }));
    await act(async () => {
      expect(await self.current.follow("me")).toBe(false);
    });

    expect(repoState.followCalls).toHaveLength(0);
  });

  it("rolls back optimistic state on error", async () => {
    primePending();
    repoState.shouldFail = true;
    const { result } = renderHook(() => useFollowAction({ currentUserId: "me" }));

    let outcome: boolean | undefined;
    await act(async () => {
      const p = result.current.follow("target-3");
      repoState.rejectPending?.(new Error("network"));
      outcome = await p;
    });

    expect(outcome).toBe(false);
    expect(result.current.isFollowed("target-3")).toBe(false);
    expect(result.current.isPending("target-3")).toBe(false);
  });

  it("invokes onFollowed only on success", async () => {
    const onFollowed = vi.fn();
    const { result } = renderHook(() =>
      useFollowAction({ currentUserId: "me", onFollowed }),
    );

    await act(async () => {
      await result.current.follow("target-4");
    });

    expect(onFollowed).toHaveBeenCalledWith("target-4");
    expect(onFollowed).toHaveBeenCalledTimes(1);
  });
});
