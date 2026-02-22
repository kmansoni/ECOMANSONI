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
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
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

describe("useSearch trending hashtags", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = null;
  });

  it("calls get_trending_hashtags_v1 RPC and stores results", async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    (supabase as any).rpc.mockResolvedValueOnce({
      data: [
        {
          hashtag: "#cars",
          normalized_tag: "cars",
          reels_count: 120,
          usage_last_24h: 55,
          velocity_score: 2.4,
          status: "normal",
        },
      ],
      error: null,
    });

    const { useSearch } = await import("@/hooks/useSearch");

    const { result } = renderHook(() => useSearch());

    await act(async () => {
      await result.current.fetchTrendingHashtags();
    });

    expect((supabase as any).rpc).toHaveBeenCalledWith("get_trending_hashtags_v1", { p_limit: 12 });
    expect(result.current.trendingHashtags).toHaveLength(1);
    expect(result.current.trendingHashtags[0].normalized_tag).toBe("cars");
  });
});
