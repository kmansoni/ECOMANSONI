import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" } as null | { id: string },
}));

type RealtimeHandler = {
  event: string;
  table: string;
  callback: (payload: unknown) => void;
};

type RealtimeSubscription = {
  name: string;
  handlers: RealtimeHandler[];
  statusCallback?: (status: string) => void;
};

const realtimeState = vi.hoisted(() => ({
  subscriptions: [] as RealtimeSubscription[],
}));

const dbState = vi.hoisted(() => ({
  channels: [] as Array<Record<string, unknown>>,
  channelMessagesById: {} as Record<string, Array<Record<string, unknown>>>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/supabase", () => {
  const makeBuilder = (table: string) => {
    const state = {
      eq: {} as Record<string, unknown>,
      orderBy: null as null | { column: string; ascending: boolean },
      limitCount: null as number | null,
    };

    const resolveRows = () => {
      if (table === "channels") {
        let rows = [...dbState.channels];
        if (state.eq.is_public !== undefined) {
          rows = rows.filter((row) => row.is_public === state.eq.is_public);
        }
        if (state.orderBy?.column === "member_count") {
          rows.sort((a, b) => {
            const left = Number(a.member_count ?? 0);
            const right = Number(b.member_count ?? 0);
            return state.orderBy?.ascending ? left - right : right - left;
          });
        }
        return rows;
      }

      if (table === "channel_members") {
        return [];
      }

      if (table === "channel_messages") {
        const channelId = String(state.eq.channel_id ?? "");
        let rows = [...(dbState.channelMessagesById[channelId] ?? [])];
        if (state.orderBy?.column === "created_at") {
          rows.sort((a, b) => {
            const left = Date.parse(String(a.created_at ?? 0));
            const right = Date.parse(String(b.created_at ?? 0));
            return state.orderBy?.ascending ? left - right : right - left;
          });
        }
        if (typeof state.limitCount === "number") {
          rows = rows.slice(0, state.limitCount);
        }
        return rows;
      }

      return [];
    };

    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: unknown) => {
        state.eq[column] = value;
        return builder;
      }),
      order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
        state.orderBy = { column, ascending: Boolean(opts?.ascending) };
        return builder;
      }),
      limit: vi.fn((count: number) => {
        state.limitCount = count;
        return builder;
      }),
      then: (onFulfilled: (value: { data: unknown[]; error: null }) => unknown, onRejected: (reason: unknown) => unknown) =>
        Promise.resolve({ data: resolveRows(), error: null }).then(onFulfilled, onRejected),
    };

    return builder;
  };

  const supabase = {
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn((name: string) => {
      const subscription: RealtimeSubscription = { name, handlers: [] };
      realtimeState.subscriptions.push(subscription);

      const channelBuilder: any = {
        on: vi.fn((_eventType: string, config: Record<string, unknown>, callback: (payload: unknown) => void) => {
          subscription.handlers.push({
            event: String(config?.event ?? ""),
            table: String(config?.table ?? ""),
            callback,
          });
          return channelBuilder;
        }),
        subscribe: vi.fn((statusCallback?: (status: string) => void) => {
          subscription.statusCallback = statusCallback;
          return channelBuilder;
        }),
      };

      return channelBuilder;
    }),
    removeChannel: vi.fn(),
  };

  return { supabase };
});

function getSubscription(name: string): RealtimeSubscription {
  const found = realtimeState.subscriptions.find((item) => item.name === name);
  if (!found) throw new Error(`Subscription not found: ${name}`);
  return found;
}

describe("useChannels realtime list recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeState.subscriptions.length = 0;
    authState.user = { id: "user-1" };
    dbState.channels = [
      {
        id: "ch-1",
        name: "General",
        description: null,
        avatar_url: null,
        owner_id: "user-2",
        is_public: true,
        member_count: 3,
        created_at: "2026-04-21T10:00:00.000Z",
        updated_at: "2026-04-21T10:00:00.000Z",
      },
    ];
    dbState.channelMessagesById = {
      "ch-1": [
        {
          id: "msg-1",
          channel_id: "ch-1",
          sender_id: "user-2",
          content: "hello",
          created_at: "2026-04-21T10:00:00.000Z",
        },
      ],
    };
  });

  it("refreshes channel list on subscribed and degraded realtime statuses", async () => {
    const { useChannels } = await import("@/hooks/useChannels");
    const { result } = renderHook(() => useChannels());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.channels).toHaveLength(1);
    });

    const subscription = getSubscription("channels-updates");
    expect(subscription.statusCallback).toBeTypeOf("function");

    dbState.channelMessagesById["ch-1"] = [
      {
        id: "msg-2",
        channel_id: "ch-1",
        sender_id: "user-3",
        content: "after-realtime-refresh",
        created_at: "2026-04-21T10:05:00.000Z",
      },
    ];

    await act(async () => {
      subscription.statusCallback?.("CHANNEL_ERROR");
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitFor(() => {
      expect(result.current.channels[0].last_message?.id).toBe("msg-2");
    });

    dbState.channelMessagesById["ch-1"] = [
      {
        id: "msg-3",
        channel_id: "ch-1",
        sender_id: "user-4",
        content: "after-subscribed-refresh",
        created_at: "2026-04-21T10:10:00.000Z",
      },
    ];

    await act(async () => {
      subscription.statusCallback?.("SUBSCRIBED");
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    await waitFor(() => {
      expect(result.current.channels[0].last_message?.id).toBe("msg-3");
    });
  });
});