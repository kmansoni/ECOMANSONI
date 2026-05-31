/**
 * Tests for Instagram analytics getCreatorInsights function
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn()
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc }
}));

import { getCreatorInsights, type CreatorInsights } from "@/lib/user-settings";

describe("getCreatorInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return correct structure with views_total, followers_total, top_reels, views_by_day, views_by_hour", async () => {
    const mockData: CreatorInsights = {
      days: 30,
      since: "2026-05-01",
      views_total: 15000,
      views_non_followers: 8000,
      views_non_followers_pct: 53.3,
      followers_total: 7100,
      followers_gained: 250,
      reels_total: 12,
      likes_total: 3400,
      comments_total: 180,
      views_by_day: [
        { day: "2026-05-01", views: 500 },
        { day: "2026-05-02", views: 420 },
        { day: "2026-05-03", views: 380 }
      ],
      views_by_hour: [
        { hour: 9, views: 200 },
        { hour: 12, views: 350 },
        { hour: 18, views: 410 },
        { hour: 21, views: 280 }
      ],
      top_reels: [
        {
          reel_id: "reel_001",
          views: 1200,
          likes_count: 85,
          comments_count: 12,
          created_at: "2026-05-02T10:30:00Z",
          thumbnail_url: "https://example.com/thumb1.jpg",
          description: "First reel"
        },
        {
          reel_id: "reel_002",
          views: 950,
          likes_count: 62,
          comments_count: 8,
          created_at: "2026-05-01T15:45:00Z",
          thumbnail_url: null,
          description: "Second reel"
        }
      ],
      followers_gender: { male: 3200, female: 3900, unknown: 0 }
    };

    mocks.rpc.mockResolvedValue({ data: mockData, error: null });

    const result = await getCreatorInsights(30);

    expect(result).toEqual(mockData);
    expect(mocks.rpc).toHaveBeenCalledWith("get_creator_insights", { p_days: 30 });
  });

  it("should use default days parameter (30) when not specified", async () => {
    const mockData = {
      days: 30,
      since: "2026-05-01",
      views_total: 0,
      views_non_followers: 0,
      views_non_followers_pct: 0,
      followers_total: 0,
      followers_gained: 0,
      reels_total: 0,
      likes_total: 0,
      comments_total: 0,
      views_by_day: [],
      views_by_hour: [],
      top_reels: [],
      followers_gender: { male: 0, female: 0, unknown: 0 }
    };

    mocks.rpc.mockResolvedValue({ data: mockData, error: null });

    await getCreatorInsights();

    expect(mocks.rpc).toHaveBeenCalledWith("get_creator_insights", { p_days: 30 });
  });

  it("should throw error when RPC returns error", async () => {
    const mockError = new Error("RPC error: permission denied");
    mocks.rpc.mockResolvedValue({ data: null, error: mockError });

    await expect(getCreatorInsights(30)).rejects.toThrow("RPC error: permission denied");
  });

  it("should return fallback data when RPC returns null data", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });

    const result = await getCreatorInsights(30);

    expect(result).toEqual({
      days: 30,
      since: expect.any(String),
      views_total: 0,
      views_non_followers: 0,
      views_non_followers_pct: 0,
      followers_total: 0,
      followers_gained: 0,
      reels_total: 0,
      likes_total: 0,
      comments_total: 0,
      views_by_day: [],
      views_by_hour: [],
      top_reels: [],
      followers_gender: { male: 0, female: 0, unknown: 0 }
    });
  });

  it("should return empty arrays for views_by_day and views_by_hour when RPC returns empty arrays", async () => {
    const mockData = {
      days: 30,
      since: "2026-05-01",
      views_total: 0,
      views_non_followers: 0,
      views_non_followers_pct: 0,
      followers_total: 0,
      followers_gained: 0,
      reels_total: 0,
      likes_total: 0,
      comments_total: 0,
      views_by_day: [],
      views_by_hour: [],
      top_reels: [],
      followers_gender: { male: 0, female: 0, unknown: 0 }
    };

    mocks.rpc.mockResolvedValue({ data: mockData, error: null });

    const result = await getCreatorInsights(7);

    expect(result.views_by_day).toEqual([]);
    expect(result.views_by_hour).toEqual([]);
    expect(result.top_reels).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_creator_insights", { p_days: 7 });
  });

  it("should call RPC with custom days parameter", async () => {
    const mockData = {
      days: 7,
      since: "2026-05-24",
      views_total: 3500,
      views_non_followers: 1200,
      views_non_followers_pct: 34.3,
      followers_total: 100,
      followers_gained: 10,
      reels_total: 2,
      likes_total: 450,
      comments_total: 30,
      views_by_day: [],
      views_by_hour: [],
      top_reels: [],
      followers_gender: { male: 50, female: 50, unknown: 0 }
    };

    mocks.rpc.mockResolvedValue({ data: mockData, error: null });

    const result = await getCreatorInsights(7);

    expect(result.days).toBe(7);
    expect(result.views_total).toBe(3500);
    expect(mocks.rpc).toHaveBeenCalledWith("get_creator_insights", { p_days: 7 });
  });
});