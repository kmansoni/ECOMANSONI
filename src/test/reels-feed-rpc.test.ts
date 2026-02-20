import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = (response: { data: any[]; error: any } = { data: [], error: null }) => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      in: vi.fn(() => builder),
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(response).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const supabase = {
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
    from: vi.fn((table: string) => {
      if (table === "followers") {
        return makeQuery({ data: [{ following_id: "someone" }], error: null });
      }
      if (table === "profiles") {
        return makeQuery({ data: [], error: null });
      }
      return makeQuery({ data: [], error: null });
    }),
  };

  return { supabase };
});

describe("useReels feed source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
    // deterministic session id
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("test-uuid" as any);
    sessionStorage.clear();
  });

  it("uses get_reels_feed_v2 RPC for main reels feed when logged out", async () => {
    const { useReels } = await import("@/hooks/useReels");
    const { supabase } = await import("@/integrations/supabase/client");

    renderHook(() => useReels("reels"));

    await waitFor(() => {
      expect((supabase as any).rpc).toHaveBeenCalled();
    });

    expect((supabase as any).rpc).toHaveBeenCalledWith("get_reels_feed_v2", expect.objectContaining({
      p_limit: 50,
      p_offset: 0,
      p_session_id: "anon-test-uuid",
    }));
  });

  it("uses reels table query for friends feed", async () => {
    authState.user = { id: "user-1" };
    const { useReels } = await import("@/hooks/useReels");
    const { supabase } = await import("@/integrations/supabase/client");

    renderHook(() => useReels("friends"));

    await waitFor(() => {
      expect((supabase as any).from).toHaveBeenCalledWith("followers");
    });

    await waitFor(() => {
      expect((supabase as any).from).toHaveBeenCalledWith("reels");
    });
  });
});
