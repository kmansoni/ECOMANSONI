import { describe, expect, it, vi } from "vitest";

import {
  fetchUserBriefMap,
  makeFallbackUserBrief,
  resolveUserBrief,
  type UserBriefClient,
} from "@/lib/users/userBriefs";

function createClient(options?: {
  rpcData?: unknown;
  rpcError?: unknown;
  profilesData?: unknown;
  profilesError?: unknown;
}): UserBriefClient {
  return {
    rpc: vi.fn().mockResolvedValue({
      data: options?.rpcData ?? [],
      error: options?.rpcError ?? null,
    }),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({
          data: options?.profilesData ?? [],
          error: options?.profilesError ?? null,
        }),
      })),
    })),
  };
}

describe("user brief resolution", () => {
  it("prefers RPC user briefs when available", async () => {
    const client = createClient({
      rpcData: [
        {
          user_id: "11111111-1111-1111-1111-111111111111",
          display_name: "  Alice  ",
          avatar_url: " https://cdn.example/avatar.png ",
          username: " alice ",
        },
      ],
    });

    const briefMap = await fetchUserBriefMap([
      "11111111-1111-1111-1111-111111111111",
    ], client);

    expect(briefMap.get("11111111-1111-1111-1111-111111111111")).toEqual({
      user_id: "11111111-1111-1111-1111-111111111111",
      display_name: "Alice",
      avatar_url: "https://cdn.example/avatar.png",
      username: "alice",
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("falls back to profiles and stable ids when RPC is unavailable", async () => {
    const client = createClient({
      rpcError: { message: "function get_user_briefs does not exist" },
      profilesData: [
        {
          user_id: "11111111-1111-1111-1111-111111111111",
          full_name: "Alice Example",
          avatar_url: null,
          username: null,
        },
      ],
    });

    const briefMap = await fetchUserBriefMap([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ], client);

    expect(briefMap.get("11111111-1111-1111-1111-111111111111")).toEqual({
      user_id: "11111111-1111-1111-1111-111111111111",
      display_name: "Alice Example",
      avatar_url: null,
      username: "u_1111111111111111",
    });
    expect(briefMap.get("22222222-2222-2222-2222-222222222222")).toEqual(
      makeFallbackUserBrief("22222222-2222-2222-2222-222222222222")
    );
    expect(client.from).toHaveBeenCalled();
  });

  it("uses embedded data when direct resolution map is empty", () => {
    const resolved = resolveUserBrief(
      "33333333-3333-3333-3333-333333333333",
      new Map(),
      {
        display_name: "Bob Embedded",
        avatar_url: "https://cdn.example/bob.png",
        username: "bob",
      }
    );

    expect(resolved).toEqual({
      user_id: "33333333-3333-3333-3333-333333333333",
      display_name: "Bob Embedded",
      avatar_url: "https://cdn.example/bob.png",
      username: "bob",
    });
  });
});