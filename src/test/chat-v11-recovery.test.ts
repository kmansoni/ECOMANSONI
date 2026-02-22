import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: { id: "user-1" } as null | { id: string },
}));

const rpcMock = vi.hoisted(() => vi.fn());
const removeChannelMock = vi.hoisted(() => vi.fn());
const logSpy = vi.hoisted(() => vi.fn());

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

  const channelBuilder: any = {
    on: vi.fn(() => channelBuilder),
    subscribe: vi.fn(() => channelBuilder),
  };

  const supabase = {
    rpc: rpcMock,
    from: vi.fn((_table: string) => makeQuery({ data: [], error: null })),
    channel: vi.fn(() => channelBuilder),
    removeChannel: removeChannelMock,
  };

  return { supabase };
});

describe("chat v1.1 recovery path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    authState.user = { id: "user-1" };
    localStorage.clear();
    localStorage.setItem("chat.protocol.v11.force", "1");
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("test-uuid" as any);
    vi.spyOn(console, "log").mockImplementation(logSpy);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back to full_state_dialog when resync range is unavailable", async () => {
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
        return Promise.resolve({
          data: null,
          error: { message: "ERR_RESYNC_RANGE_UNAVAILABLE" },
        });
      }
      if (name === "chat_full_state_dialog_v11") {
        return Promise.resolve({
          data: [
            {
              snapshot: {
                messages: [
                  {
                    msg_id: "msg-1",
                    msg_seq: 1,
                    sender_id: "user-1",
                    content: "hello",
                    created_at: "2026-02-22T00:00:00.000Z",
                  },
                ],
              },
            },
          ],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { useMessages } = await import("@/hooks/useChat");
    const { result } = renderHook(() => useMessages("conv-1"));

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "chat_full_state_dialog_v11",
      expect.objectContaining({ p_dialog_id: "conv-1" })
    );
    expect(rpcMock).toHaveBeenCalledWith(
      "chat_status_write_v11",
      expect.objectContaining({ p_device_id: expect.any(String), p_client_write_seq: 1 })
    );
  });

  it("does not call full_state_dialog when resync succeeds", async () => {
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "chat_resync_stream_v11",
      expect.objectContaining({ p_stream_id: "dialog:conv-1" })
    );
    expect(rpcMock).not.toHaveBeenCalledWith(
      "chat_full_state_dialog_v11",
      expect.anything()
    );
  });

  it("does not escalate to full_state when resync is throttled", async () => {
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
        return Promise.resolve({
          data: null,
          error: { code: "ERR_RESYNC_THROTTLED", message: "ERR_RESYNC_THROTTLED", retry_after_ms: 1200 },
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { useMessages } = await import("@/hooks/useChat");
    const { result } = renderHook(() => useMessages("conv-1"));

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });

    expect(rpcMock).toHaveBeenCalledWith(
      "chat_resync_stream_v11",
      expect.objectContaining({ p_stream_id: "dialog:conv-1" })
    );
    expect(rpcMock).not.toHaveBeenCalledWith("chat_full_state_dialog_v11", expect.anything());
  });

  it("retries recovery after retry_after_ms when resync is throttled", async () => {
    let resyncCalls = 0;
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
        resyncCalls += 1;
        if (resyncCalls === 1) {
          return Promise.resolve({
            data: null,
            error: { code: "ERR_RESYNC_THROTTLED", message: "ERR_RESYNC_THROTTLED", retry_after_ms: 1200 },
          });
        }
        return Promise.resolve({
          data: null,
          error: { code: "ERR_RESYNC_RANGE_UNAVAILABLE", message: "ERR_RESYNC_RANGE_UNAVAILABLE" },
        });
      }
      if (name === "chat_full_state_dialog_v11") {
        return Promise.resolve({
          data: [{ snapshot: { messages: [] } }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { useMessages } = await import("@/hooks/useChat");
    const { result } = renderHook(() => useMessages("conv-1"));

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_050);
    });
    expect(resyncCalls).toBe(1);
    expect(rpcMock).not.toHaveBeenCalledWith("chat_full_state_dialog_v11", expect.anything());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_500);
    });
    expect(resyncCalls).toBeGreaterThanOrEqual(2);
    expect(rpcMock).toHaveBeenCalledWith("chat_full_state_dialog_v11", expect.any(Object));
  });

  it("treats status=unknown as recovery path and reaches full_state on unavailable range", async () => {
    rpcMock.mockImplementation((name: string) => {
      if (name === "chat_send_message_v11") {
        return Promise.resolve({
          data: [{ ack_status: "accepted", msg_id: null, error_code: null }],
          error: null,
        });
      }
      if (name === "chat_status_write_v11") {
        return Promise.resolve({
          data: [{ status: "unknown", msg_id: null }],
          error: null,
        });
      }
      if (name === "chat_resync_stream_v11") {
        return Promise.resolve({
          data: null,
          error: { code: "ERR_RESYNC_RANGE_UNAVAILABLE", message: "ERR_RESYNC_RANGE_UNAVAILABLE" },
        });
      }
      if (name === "chat_full_state_dialog_v11") {
        return Promise.resolve({
          data: [{ snapshot: { messages: [] } }],
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const { useMessages } = await import("@/hooks/useChat");
    const { result } = renderHook(() => useMessages("conv-1"));

    await act(async () => {
      await result.current.sendMessage("hello");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_100);
    });

    expect(rpcMock).toHaveBeenCalledWith("chat_status_write_v11", expect.any(Object));
    expect(rpcMock).toHaveBeenCalledWith("chat_resync_stream_v11", expect.any(Object));
    expect(rpcMock).toHaveBeenCalledWith("chat_full_state_dialog_v11", expect.any(Object));
  });
});
