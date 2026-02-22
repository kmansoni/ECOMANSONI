import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" } as null | { id: string },
}));

const rpcMock = vi.hoisted(() => vi.fn());
const removeChannelMock = vi.hoisted(() => vi.fn());
const channelHandlers = vi.hoisted(() => ({
  receiptInsert: null as null | ((payload: any) => void),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/lib/supabase", () => {
  const makeQuery = (response: { data: any; error: any } = { data: [], error: null }) => {
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      neq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      in: vi.fn(() => builder),
      maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: (onFulfilled: any, onRejected: any) => Promise.resolve(response).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const channel = (_name: string) => {
    const builder: any = {
      on: vi.fn((event: string, filter: any, cb: (payload: any) => void) => {
        if (event === "postgres_changes" && filter?.table === "chat_receipts" && filter?.event === "INSERT") {
          channelHandlers.receiptInsert = cb;
        }
        return builder;
      }),
      subscribe: vi.fn(() => builder),
    };
    return builder;
  };

  const supabase = {
    rpc: rpcMock,
    from: vi.fn((_table: string) => makeQuery({ data: [], error: null })),
    channel: vi.fn(channel),
    removeChannel: removeChannelMock,
  };

  return { supabase };
});

describe("chat v1.1 realtime receipt race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    authState.user = { id: "user-1" };
    channelHandlers.receiptInsert = null;
    localStorage.clear();
    localStorage.setItem("chat.protocol.v11.force", "1");
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("test-uuid" as any);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not run recovery when receipt arrives before timeout", async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === "chat_send_message_v11") {
        return Promise.resolve({
          data: [{ ack_status: "accepted", msg_id: null, error_code: null }],
          error: null,
        });
      }
      if (name === "chat_status_write_v11") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "chat_resync_stream_v11") {
        return Promise.resolve({ data: [], error: null });
      }
      if (name === "chat_full_state_dialog_v11") {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { useMessages } = await import("@/hooks/useChat");
    const { result } = renderHook(() => useMessages("conv-1"));

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    expect(channelHandlers.receiptInsert).toBeTypeOf("function");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
      channelHandlers.receiptInsert?.({
        new: {
          client_write_seq: 1,
          device_id: "test-uuid",
          user_id: "user-1",
        },
      });
      await vi.advanceTimersByTimeAsync(2_500);
    });

    expect(rpcMock).not.toHaveBeenCalledWith("chat_status_write_v11", expect.anything());
    expect(rpcMock).not.toHaveBeenCalledWith("chat_resync_stream_v11", expect.anything());
    expect(rpcMock).not.toHaveBeenCalledWith("chat_full_state_dialog_v11", expect.anything());
  });
});

