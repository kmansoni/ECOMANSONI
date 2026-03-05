import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" } as null | { id: string },
}));

type RealtimeHandler = {
  event: string;
  table: string;
  callback: (payload: any) => void | Promise<void>;
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
  channelMessages: [] as any[],
  groupMessages: [] as any[],
  profiles: {} as Record<string, { user_id: string; display_name: string | null; avatar_url: string | null }>,
  channelMessageSelectCalls: 0,
  groupMessageSelectCalls: 0,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/lib/supabase", () => {
  const makeBuilder = (table: string) => {
    const state = {
      eq: {} as Record<string, any>,
      in: {} as Record<string, any[]>,
      orderBy: null as null | { column: string; ascending: boolean },
    };

    const resolveRows = () => {
      if (table === "channel_messages") {
        dbState.channelMessageSelectCalls += 1;
        let rows = [...dbState.channelMessages];
        if (state.eq.channel_id) {
          rows = rows.filter((row) => row.channel_id === state.eq.channel_id);
        }
        if (state.orderBy?.column === "created_at") {
          rows.sort((a, b) =>
            state.orderBy?.ascending
              ? Date.parse(a.created_at) - Date.parse(b.created_at)
              : Date.parse(b.created_at) - Date.parse(a.created_at),
          );
        }
        return rows;
      }

      if (table === "group_chat_messages") {
        dbState.groupMessageSelectCalls += 1;
        let rows = [...dbState.groupMessages];
        if (state.eq.group_id) {
          rows = rows.filter((row) => row.group_id === state.eq.group_id);
        }
        if (state.orderBy?.column === "created_at") {
          rows.sort((a, b) =>
            state.orderBy?.ascending
              ? Date.parse(a.created_at) - Date.parse(b.created_at)
              : Date.parse(b.created_at) - Date.parse(a.created_at),
          );
        }
        return rows;
      }

      if (table === "profiles") {
        if (state.in.user_id) {
          return state.in.user_id
            .map((id) => dbState.profiles[id])
            .filter(Boolean);
        }

        if (state.eq.user_id) {
          return dbState.profiles[state.eq.user_id] ? [dbState.profiles[state.eq.user_id]] : [];
        }
      }

      return [];
    };

    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn((column: string, value: any) => {
        state.eq[column] = value;
        return builder;
      }),
      in: vi.fn((column: string, values: any[]) => {
        state.in[column] = values;
        return builder;
      }),
      order: vi.fn((column: string, opts?: { ascending?: boolean }) => {
        state.orderBy = { column, ascending: Boolean(opts?.ascending) };
        return builder;
      }),
      limit: vi.fn(() => builder),
      single: vi.fn(async () => {
        const rows = resolveRows();
        return { data: rows[0] ?? null, error: null };
      }),
      then: (onFulfilled: any, onRejected: any) =>
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
        on: vi.fn((_eventType: string, config: any, callback: any) => {
          subscription.handlers.push({
            event: String(config?.event || ""),
            table: String(config?.table || ""),
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
    rpc: vi.fn(),
    storage: {
      from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn() })),
    },
  };

  return { supabase };
});

function getSubscription(name: string): RealtimeSubscription {
  const found = realtimeState.subscriptions.find((item) => item.name === name);
  if (!found) throw new Error(`Subscription not found: ${name}`);
  return found;
}

function getHandler(name: string, table: string, event: string): RealtimeHandler {
  const subscription = getSubscription(name);
  const found = subscription.handlers.find((handler) => handler.table === table && handler.event === event);
  if (!found) throw new Error(`Handler not found: ${name}/${table}/${event}`);
  return found;
}

describe("channel/group realtime hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    realtimeState.subscriptions.length = 0;
    authState.user = { id: "user-1" };
    dbState.channelMessages = [];
    dbState.groupMessages = [];
    dbState.profiles = {
      "sender-1": { user_id: "sender-1", display_name: "Sender", avatar_url: null },
    };
    dbState.channelMessageSelectCalls = 0;
    dbState.groupMessageSelectCalls = 0;
  });

  it("useChannelMessages deduplicates INSERT replay racing with initial fetch", async () => {
    dbState.channelMessages = [
      {
        id: "cm-1",
        channel_id: "ch-1",
        sender_id: "sender-1",
        content: "hello",
        created_at: "2026-03-05T10:00:00.000Z",
      },
    ];

    const { useChannelMessages } = await import("@/hooks/useChannels");
    const { result } = renderHook(() => useChannelMessages("ch-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toHaveLength(1);
    });

    const insertHandler = getHandler("channel_messages:ch-1", "channel_messages", "INSERT");

    await act(async () => {
      await insertHandler.callback({
        new: {
          id: "cm-1",
          channel_id: "ch-1",
          sender_id: "sender-1",
          content: "hello",
          created_at: "2026-03-05T10:00:00.000Z",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].id).toBe("cm-1");
    });
  });

  it("useGroupMessages deduplicates INSERT replay racing with initial fetch", async () => {
    dbState.groupMessages = [
      {
        id: "gm-1",
        group_id: "gr-1",
        sender_id: "sender-1",
        content: "hello",
        created_at: "2026-03-05T10:00:00.000Z",
      },
    ];

    const { useGroupMessages } = await import("@/hooks/useGroupChats");
    const { result } = renderHook(() => useGroupMessages("gr-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toHaveLength(1);
    });

    const insertHandler = getHandler("group_messages:gr-1", "group_chat_messages", "INSERT");

    await act(async () => {
      await insertHandler.callback({
        new: {
          id: "gm-1",
          group_id: "gr-1",
          sender_id: "sender-1",
          content: "hello",
          created_at: "2026-03-05T10:00:00.000Z",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].id).toBe("gm-1");
    });
  });

  it("useChannelMessages applies UPDATE and DELETE realtime events", async () => {
    dbState.channelMessages = [
      {
        id: "cm-1",
        channel_id: "ch-1",
        sender_id: "sender-1",
        content: "before",
        created_at: "2026-03-05T10:00:00.000Z",
      },
      {
        id: "cm-2",
        channel_id: "ch-1",
        sender_id: "sender-1",
        content: "other",
        created_at: "2026-03-05T10:01:00.000Z",
      },
    ];

    const { useChannelMessages } = await import("@/hooks/useChannels");
    const { result } = renderHook(() => useChannelMessages("ch-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toHaveLength(2);
    });

    const updateHandler = getHandler("channel_messages:ch-1", "channel_messages", "UPDATE");
    const deleteHandler = getHandler("channel_messages:ch-1", "channel_messages", "DELETE");

    await act(async () => {
      await updateHandler.callback({
        new: {
          id: "cm-1",
          channel_id: "ch-1",
          sender_id: "sender-1",
          content: "after",
          created_at: "2026-03-05T10:00:00.000Z",
          updated_at: "2026-03-05T10:02:00.000Z",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.messages.find((m) => m.id === "cm-1")?.content).toBe("after");
    });

    await act(async () => {
      await deleteHandler.callback({ old: { id: "cm-1" } });
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].id).toBe("cm-2");
    });
  });

  it("useGroupMessages applies UPDATE and DELETE realtime events", async () => {
    dbState.groupMessages = [
      {
        id: "gm-1",
        group_id: "gr-1",
        sender_id: "sender-1",
        content: "before",
        created_at: "2026-03-05T10:00:00.000Z",
      },
      {
        id: "gm-2",
        group_id: "gr-1",
        sender_id: "sender-1",
        content: "other",
        created_at: "2026-03-05T10:01:00.000Z",
      },
    ];

    const { useGroupMessages } = await import("@/hooks/useGroupChats");
    const { result } = renderHook(() => useGroupMessages("gr-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toHaveLength(2);
    });

    const updateHandler = getHandler("group_messages:gr-1", "group_chat_messages", "UPDATE");
    const deleteHandler = getHandler("group_messages:gr-1", "group_chat_messages", "DELETE");

    await act(async () => {
      await updateHandler.callback({
        new: {
          id: "gm-1",
          group_id: "gr-1",
          sender_id: "sender-1",
          content: "after",
          created_at: "2026-03-05T10:00:00.000Z",
          updated_at: "2026-03-05T10:02:00.000Z",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.messages.find((m) => m.id === "gm-1")?.content).toBe("after");
    });

    await act(async () => {
      await deleteHandler.callback({ old: { id: "gm-1" } });
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].id).toBe("gm-2");
    });
  });

  it("useChannelMessages refetches on subscribe status recovery branches", async () => {
    dbState.channelMessages = [
      {
        id: "cm-1",
        channel_id: "ch-1",
        sender_id: "sender-1",
        content: "m1",
        created_at: "2026-03-05T10:00:00.000Z",
      },
    ];

    const { useChannelMessages } = await import("@/hooks/useChannels");
    const { result } = renderHook(() => useChannelMessages("ch-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.messages).toHaveLength(1);
    });

    const subscription = getSubscription("channel_messages:ch-1");
    expect(subscription.statusCallback).toBeTypeOf("function");

    const recoveryStatuses = ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"] as const;
    for (const status of recoveryStatuses) {
      dbState.channelMessages = [
        ...dbState.channelMessages,
        {
          id: `cm-${dbState.channelMessages.length + 1}`,
          channel_id: "ch-1",
          sender_id: "sender-1",
          content: `next-${status}`,
          created_at: `2026-03-05T10:0${dbState.channelMessages.length}:00.000Z`,
        },
      ];

      await act(async () => {
        subscription.statusCallback?.(status);
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(dbState.channelMessages.length);
      });
    }
  });
});
