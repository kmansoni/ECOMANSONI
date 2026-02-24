import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: null as null | { id: string },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/integrations/supabase/client", () => {
  const supabase = {
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        ilike: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  };

  return { supabase };
});

describe("useSearch explore page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
  });

  it("calls get_explore_page_v2 RPC and stores payload", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase as any).rpc.mockResolvedValueOnce({
      data: {
        generated_at: "2026-02-22T00:00:00Z",
        sections: [
          { type: "hashtags", title: "Hashtags", items: [{ hashtag: "cats", status: "normal", post_count_approx: 10 }] },
        ],
      },
      error: null,
    });

    const { useSearch } = await import("@/hooks/useSearch");
    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await result.current.fetchExplorePage();
    });

    expect((supabase as any).rpc).toHaveBeenCalledWith(
      "get_explore_page_v2",
      expect.objectContaining({
        p_segment_id: "seg_default",
        p_allow_stale: true,
        p_force_refresh: false,
      }),
    );

    expect(result.current.explorePage?.sections?.[0]?.type).toBe("hashtags");
  });
});
