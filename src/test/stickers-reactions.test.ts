import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const maybeSingleMock = vi.fn();
  const singleMock = vi.fn();
  const selectMock = vi.fn((columns?: string) => {
    if (columns === "emoji") {
      return {
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [{ emoji: "❤️" }, { emoji: "🔥" }, { emoji: "👍" }], error: null })),
        })),
      };
    }
    return {
      eq: vi.fn(() => ({
        maybeSingle: maybeSingleMock,
      })),
    };
  });
  const upsertMock = vi.fn(() => ({
    select: vi.fn(() => ({ single: singleMock })),
  }));
  const insertMock = vi.fn(() => ({
    select: vi.fn(() => ({ single: singleMock })),
  }));
  const updateMock = vi.fn(() => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({ single: singleMock })),
    })),
  }));
  const fromMock = vi.fn(() => ({
    select: selectMock,
    upsert: upsertMock,
    insert: insertMock,
    update: updateMock,
  }));
  return {
    fromMock,
    maybeSingleMock,
    singleMock,
    insertMock,
    upsertMock,
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.fromMock,
  },
}));

import {
  getOrCreateUserEmojiPreferences,
  getOrCreateUserQuickReaction,
  listQuickReactionCatalog,
  setUserQuickReaction,
} from "@/lib/stickers-reactions";

describe("stickers-reactions service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates quick reaction row when not exists", async () => {
    mocks.maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    mocks.singleMock.mockResolvedValueOnce({
      data: { user_id: "u1", emoji: "❤️", created_at: "2026-01-01", updated_at: "2026-01-01" },
      error: null,
    });

    const row = await getOrCreateUserQuickReaction("u1");

    expect(mocks.fromMock).toHaveBeenCalledWith("user_quick_reaction");
    expect(mocks.insertMock).toHaveBeenCalled();
    expect(row.emoji).toBe("❤️");
  });

  it("updates quick reaction", async () => {
    mocks.singleMock.mockResolvedValueOnce({
      data: { user_id: "u1", emoji: "🔥", created_at: "2026-01-01", updated_at: "2026-01-02" },
      error: null,
    });

    const row = await setUserQuickReaction("u1", "🔥");

    expect(mocks.upsertMock).toHaveBeenCalled();
    expect(row.emoji).toBe("🔥");
  });

  it("returns quick reaction catalog", async () => {
    const list = await listQuickReactionCatalog();
    expect(list).toEqual(["❤️", "🔥", "👍"]);
  });

  it("creates default emoji preferences when absent", async () => {
    mocks.maybeSingleMock.mockResolvedValueOnce({ data: null, error: null });
    mocks.singleMock.mockResolvedValueOnce({
      data: {
        user_id: "u1",
        emoji_suggestions_mode: "all",
        large_emoji_mode: "up_to_three",
        recents_first: true,
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
      error: null,
    });

    const prefs = await getOrCreateUserEmojiPreferences("u1");
    expect(prefs.large_emoji_mode).toBe("up_to_three");
    expect(mocks.insertMock).toHaveBeenCalled();
  });
});

