import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFollow } from "@/hooks/useFollow";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" } as null | { id: string },
}));

const dbState = vi.hoisted(() => ({
  maybeSingleData: null as any,
  upsertCalls: 0,
  deleteCalls: 0,
  pendingMutation: null as null | Promise<{ error: null }>,
  resolvePendingMutation: null as null | (() => void),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeFollowersBuilder = () => {
    const state = {
      mode: "select" as "select" | "delete" | "upsert",
    };

    const builder: any = {
      select: vi.fn(() => {
        state.mode = "select";
        return builder;
      }),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => ({ data: dbState.maybeSingleData, error: null })),
      delete: vi.fn(() => {
        state.mode = "delete";
        return builder;
      }),
      upsert: vi.fn(async () => {
        state.mode = "upsert";
        dbState.upsertCalls += 1;
        if (dbState.pendingMutation) return dbState.pendingMutation;
        return { error: null };
      }),
      then: (onFulfilled: any, onRejected: any) => {
        if (state.mode === "delete") {
          dbState.deleteCalls += 1;
          const p = dbState.pendingMutation ?? Promise.resolve({ error: null });
          return p.then(onFulfilled, onRejected);
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
      },
    };

    return builder;
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table !== "followers") throw new Error(`Unexpected table: ${table}`);
      return makeFollowersBuilder();
    }),
  };

  return { supabase };
});

describe("useFollow race guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: "user-1" };
    dbState.maybeSingleData = null;
    dbState.upsertCalls = 0;
    dbState.deleteCalls = 0;
    dbState.resolvePendingMutation = null;
    dbState.pendingMutation = new Promise((resolve) => {
      dbState.resolvePendingMutation = () => resolve({ error: null });
    });
  });

  it("ignores re-entrant toggle while mutation is in-flight", async () => {
    const { result } = renderHook(() => useFollow("user-2"));

    await waitFor(() => {
      expect(result.current.isFollowing).toBe(false);
    });

    await act(async () => {
      void result.current.toggle();
      void result.current.toggle();
    });

    expect(result.current.isFollowing).toBe(true);
    expect(dbState.upsertCalls).toBe(1);
    expect(dbState.deleteCalls).toBe(0);

    await act(async () => {
      dbState.resolvePendingMutation?.();
      await dbState.pendingMutation;
    });

    expect(result.current.isFollowing).toBe(true);
  });
});
