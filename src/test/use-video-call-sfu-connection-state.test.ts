import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";

const authState = vi.hoisted(() => ({
  user: { id: "u-callee" } as null | { id: string },
}));

const updateEqMock = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
const selectMaybeSingleMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: null }));
const removeChannelMock = vi.hoisted(() => vi.fn());

const channelMock = vi.hoisted(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: authState.user }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: updateEqMock,
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: selectMaybeSingleMock,
        })),
      })),
    })),
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}));

describe("useVideoCallSfu connection state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    authState.user = { id: "u-callee" };

    const fakeTrack = { stop: vi.fn(), enabled: true } as unknown as MediaStreamTrack;
    const fakeStream = {
      getTracks: () => [fakeTrack],
      getAudioTracks: () => [fakeTrack],
      getVideoTracks: () => [],
    } as unknown as MediaStream;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(fakeStream),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps connectionState as connecting right after answerCall", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());

    await act(async () => {
      await result.current.answerCall({
        id: "call-1",
        caller_id: "u-caller",
        callee_id: "u-callee",
        conversation_id: "conv-1",
        call_type: "audio",
        status: "ringing",
        created_at: new Date().toISOString(),
        started_at: null,
        ended_at: null,
      });
    });

    expect(result.current.status).toBe("connected");
    expect(result.current.connectionState).toBe("connecting");
    expect(updateEqMock).toHaveBeenCalled();
  });

  it("does not auto-promote to connected without transport progress signals", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());

    await act(async () => {
      await result.current.answerCall({
        id: "call-2",
        caller_id: "u-caller",
        callee_id: "u-callee",
        conversation_id: "conv-1",
        call_type: "audio",
        status: "ringing",
        created_at: new Date().toISOString(),
        started_at: null,
        ended_at: null,
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(3600);
    });

    expect(result.current.connectionState).toBe("connecting");
  });

  it("promotes to connected after fallback when send/recv transport signals are present", async () => {
    const { useVideoCallSfu } = await import("@/hooks/useVideoCallSfu");
    const { result } = renderHook(() => useVideoCallSfu());

    await act(async () => {
      await result.current.answerCall({
        id: "call-3",
        caller_id: "u-caller",
        callee_id: "u-callee",
        conversation_id: "conv-1",
        call_type: "audio",
        status: "ringing",
        created_at: new Date().toISOString(),
        started_at: null,
        ended_at: null,
      });
    });

    act(() => {
      result.current.markMediaBootstrapProgress("send_transport_created");
      result.current.markMediaBootstrapProgress("recv_transport_created");
    });

    await act(async () => {
      vi.advanceTimersByTime(3600);
    });

    expect(result.current.connectionState).toBe("connected");
  });
});
