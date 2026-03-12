import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useMessageReactions } from "@/hooks/useMessageReactions";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" } as null | { id: string },
}));

const dbState = vi.hoisted(() => ({
  selectRows: [] as Array<{ message_id: string; user_id: string; emoji: string }>,
  upserts: [] as any[],
  deletes: 0,
  selectDeferred: null as null | Promise<{ data: any[]; error: null }>,
  resolveSelectDeferred: null as null | (() => void),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const channelBuilder: any = {
    on: vi.fn(() => channelBuilder),
    subscribe: vi.fn(() => channelBuilder),
  };

  const makeMessagesBuilder = () => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      then: (onFulfilled: any, onRejected: any) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected),
    };

    return builder;
  };

  const makeReactionsBuilder = () => {
    const state = {
      mode: "select" as "select" | "delete",
    };

    const builder: any = {
      select: vi.fn(() => {
        state.mode = "select";
        return builder;
      }),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      delete: vi.fn(() => {
        state.mode = "delete";
        return builder;
      }),
      upsert: vi.fn(async (payload: any) => {
        dbState.upserts.push(payload);
        return { error: null };
      }),
      then: (onFulfilled: any, onRejected: any) => {
        if (state.mode === "delete") {
          dbState.deletes += 1;
          return Promise.resolve({ error: null }).then(onFulfilled, onRejected);
        }

        const pending = dbState.selectDeferred
          ? dbState.selectDeferred
          : Promise.resolve({ data: dbState.selectRows, error: null });
        return pending.then(onFulfilled, onRejected);
      },
    };

    return builder;
  };

  const supabase = {
    from: vi.fn((table: string) => {
      if (table === "messages") return makeMessagesBuilder();
      if (table === "message_reactions") return makeReactionsBuilder();
      throw new Error(`Unexpected table: ${table}`);
    }),
    channel: vi.fn(() => channelBuilder),
    removeChannel: vi.fn(),
  };

  return { supabase };
});

describe("useMessageReactions race handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = { id: "user-1" };
    dbState.selectRows = [];
    dbState.upserts = [];
    dbState.deletes = 0;
    dbState.selectDeferred = null;
    dbState.resolveSelectDeferred = null;
    localStorage.clear();
  });

  it("uses the latest optimistic state when the same reaction is toggled twice quickly", async () => {
    const { result } = renderHook(() => useMessageReactions("conv-1"));

    await act(async () => {
      const first = result.current.toggleReaction("msg-1", "❤️");
      const second = result.current.toggleReaction("msg-1", "❤️");
      await Promise.all([first, second]);
    });

    expect(result.current.getReactions("msg-1")).toEqual([]);
    expect(dbState.upserts).toHaveLength(1);
    expect(dbState.deletes).toBe(1);
  });

  it("does not let a stale initial fetch overwrite a newer optimistic reaction", async () => {
    dbState.selectDeferred = new Promise((resolve) => {
      dbState.resolveSelectDeferred = () => resolve({ data: [], error: null });
    });

    const { result } = renderHook(() => useMessageReactions("conv-1"));

    await act(async () => {
      await result.current.toggleReaction("msg-2", "🔥");
    });

    await waitFor(() => {
      expect(result.current.getReactions("msg-2")).toEqual([
        { emoji: "🔥", count: 1, hasReacted: true, userIds: ["user-1"] },
      ]);
    });

    await act(async () => {
      dbState.resolveSelectDeferred?.();
      await dbState.selectDeferred;
    });

    expect(result.current.getReactions("msg-2")).toEqual([
      { emoji: "🔥", count: 1, hasReacted: true, userIds: ["user-1"] },
    ]);
  });
});
